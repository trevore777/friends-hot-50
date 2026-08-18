import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Music2, Trophy, Users, Settings, Play, Pause, RotateCcw,
  CheckCircle2, ListMusic, Sparkles, Plus, Trash2, Wifi, WifiOff,
  Shuffle, X, Save, LogOut, Copy, Upload, Download, Volume2
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'friends-hot-50-state-v1';
const TOKEN_KEY = 'friends-hot-50-spotify-token';
const PKCE_KEY = 'friends-hot-50-pkce';
const DEFAULT_PRIZES = [50, 40, 30, 20, 10, 3, 2, 1];
const MAX_SONGS_PER_PERSON = 10;

function prizePositionsFor(total) {
  if (!total) return [];
  return [...new Set([total, ...DEFAULT_PRIZES.filter(p => p < total)])]
    .filter(p => p <= total)
    .sort((a,b)=>b-a);
}

const DEMO_SONGS = [
  ['Mr Brightside','The Killers'],['Everlong','Foo Fighters'],['Dancing Queen','ABBA'],['Thunderstruck','AC/DC'],
  ['Blinding Lights','The Weeknd'],['Dreams','Fleetwood Mac'],['Africa','Toto'],['Take on Me','a-ha'],
  ['Don’t Stop Me Now','Queen'],['Valerie','Mark Ronson ft. Amy Winehouse'],['The Horses','Daryl Braithwaite'],['Sex on Fire','Kings of Leon']
];
const DEFAULT_PEOPLE = ['Trevor','Sarah','John','Michelle','Peter'];

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; } catch { return null; } }
function initialState() {
  return {
    eventName: 'Friends Hot 50', participants: DEFAULT_PEOPLE.map(name => ({id:uid(), name})),
    songs: [], history: [], prizes: DEFAULT_PRIZES, startedAt: null, active: false,
    spotifyClientId: '', playlistId: '', lastTrackId: null, lastPlayedAt: null
  };
}
function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
function parsePlaylistId(value='') { const m = value.match(/playlist[/:]([A-Za-z0-9]+)/); return m ? m[1] : value.trim(); }
function formatTime(iso) { return iso ? new Date(iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''; }
function b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
async function sha256(text) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); }
function randomVerifier() { const a = new Uint8Array(64); crypto.getRandomValues(a); return b64url(a); }

async function spotifyLogin(clientId) {
  if (!clientId) throw new Error('Add your Spotify Client ID in Settings first.');
  const verifier = randomVerifier();
  const challenge = b64url(await sha256(verifier));
  const redirectUri = window.location.origin + '/';
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({verifier, redirectUri}));
  const p = new URLSearchParams({
    client_id: clientId,
    response_type:'code',
    redirect_uri:redirectUri,
    scope:'user-read-currently-playing user-read-playback-state user-read-recently-played user-modify-playback-state playlist-read-private playlist-read-collaborative',
    code_challenge_method:'S256',
    code_challenge:challenge,
    show_dialog:'true'
  });
  location.href = `https://accounts.spotify.com/authorize?${p}`;
}

async function exchangeSpotifyCode(code, clientId) {
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || '{}');
  if (!saved.verifier) throw new Error('Spotify login session expired. Try connecting again.');
  const body = new URLSearchParams({client_id:clientId, grant_type:'authorization_code', code, redirect_uri:saved.redirectUri, code_verifier:saved.verifier});
  const r = await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok) throw new Error('Spotify token exchange failed.');
  const t = await r.json();
  const token = {...t, expires_at: Date.now() + t.expires_in*1000};
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  sessionStorage.removeItem(PKCE_KEY);
  return token;
}

async function refreshToken(token, clientId) {
  if (!token?.refresh_token) return null;
  const body = new URLSearchParams({client_id:clientId, grant_type:'refresh_token', refresh_token:token.refresh_token});
  const r = await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  if(!r.ok) return null;
  const t = await r.json();
  const next={...token,...t,refresh_token:t.refresh_token||token.refresh_token,expires_at:Date.now()+t.expires_in*1000};
  localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  return next;
}

async function spotifyFetch(path, token, options={}) {
  const r = await fetch(`https://api.spotify.com/v1${path}`,{
    ...options,
    headers:{Authorization:`Bearer ${token.access_token}`,...(options.headers||{})}
  });
  if(r.status===204) return null;
  if(!r.ok){
    let detail='';
    try{
      const body=await r.json();
      detail=body?.error?.message || body?.message || '';
    }catch{}
    const err=new Error(detail ? `Spotify ${r.status}: ${detail}` : `Spotify request failed (${r.status}).`);
    err.status=r.status;
    err.path=path;
    throw err;
  }
  return r.json();
}

function App(){
  const [state,setState] = useState(()=>loadState()||initialState());
  const [tab,setTab] = useState('countdown');
  const [token,setToken] = useState(()=>{try{return JSON.parse(localStorage.getItem(TOKEN_KEY))}catch{return null}});
  const [spotifyUser,setSpotifyUser] = useState(null);
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [polling,setPolling] = useState(false);
  const [nowPlaying,setNowPlaying] = useState(null);
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [prize,setPrize] = useState(null);
  const pollingRef = useRef(false);
  const lastLiveTrackRef = useRef(null);

  useEffect(()=>saveState(state),[state]);

  const remaining = Math.max(0,state.songs.length-state.history.length);
  const ownerMap = useMemo(()=>Object.fromEntries(state.participants.map(p=>[p.id,p.name])),[state.participants]);
  const songMap = useMemo(()=>Object.fromEntries(state.songs.map(s=>[s.spotifyId,s])),[state.songs]);

  useEffect(()=>{
    const url = new URL(location.href);
    const code=url.searchParams.get('code');
    const authError=url.searchParams.get('error');
    if(authError){setError(`Spotify login: ${authError}`); history.replaceState({},'',location.pathname);}
    if(code && state.spotifyClientId){
      exchangeSpotifyCode(code,state.spotifyClientId)
        .then(t=>{setToken(t);setNotice('Spotify connected.');history.replaceState({},'',location.pathname);})
        .catch(e=>setError(e.message));
    }
  },[]);

  useEffect(()=>{
    if(!token) return;
    let alive=true;
    (async()=>{
      let t=token;
      if(t.expires_at && t.expires_at < Date.now()+60000){ t=await refreshToken(t,state.spotifyClientId); if(t) setToken(t); }
      if(t){ try{const me=await spotifyFetch('/me',t); if(alive)setSpotifyUser(me);}catch{} }
    })();
    return()=>{alive=false};
  },[token,state.spotifyClientId]);

  function update(patch){setState(s=>({...s,...patch}));}
  function flash(msg){setNotice(msg);setTimeout(()=>setNotice(''),2600);}
  function fail(msg){setError(msg);setTimeout(()=>setError(''),5000);}
  function logout(){localStorage.removeItem(TOKEN_KEY);setToken(null);setSpotifyUser(null);setPolling(false);flash('Spotify disconnected.');}

  async function ensureToken(){
    let t=token;
    if(!t) throw new Error('Connect Spotify first.');
    if(t.expires_at < Date.now()+60000){
      t=await refreshToken(t,state.spotifyClientId);
      if(!t) throw new Error('Spotify session expired. Reconnect.');
      setToken(t);
    }
    return t;
  }

  async function importPlaylist(){
    try{
      const t=await ensureToken();
      const pid=parsePlaylistId(state.playlistId);
      if(!pid) throw new Error('Paste a Spotify playlist link or ID.');
      const pl=await spotifyFetch(`/playlists/${pid}`,t);
      let items=[];
      let offset=0;
      const limit=50;
      let total=null;
      try{
        do{
          const page=await spotifyFetch(`/playlists/${pid}/items?limit=${limit}&offset=${offset}`,t);
          const pageItems=Array.isArray(page?.items) ? page.items : [];
          items.push(...pageItems);
          total=Number.isFinite(page?.total) ? page.total : total;
          if(!pageItems.length) break;
          offset += pageItems.length;
          if(total===null && !page?.next) break;
        }while(total===null ? true : offset<total);
      }catch(e){
        if(e.status===403){
          const owner=pl?.owner?.display_name || pl?.owner?.id || 'another Spotify user';
          throw new Error(`Spotify denied access to this playlist's songs. The connected account must own the playlist or be an accepted collaborator. Playlist owner: ${owner}.`);
        }
        throw e;
      }
      const raw=items
        .map(x=>x?.item ?? x?.track ?? x)
        .filter(item=>item?.type==='track' && item.id)
        .map(track=>({
          id:uid(),spotifyId:track.id,name:track.name,
          artist:track.artists?.map(a=>a.name).join(', ')||'',
          album:track.album?.name||'',image:track.album?.images?.[0]?.url||'',
          spotifyUrl:track.external_urls?.spotify||'',ownerId:''
        }));
      const seen=new Set();
      const valid=raw.filter(track=>{ if(seen.has(track.spotifyId)) return false; seen.add(track.spotifyId); return true; });
      if(!valid.length) throw new Error('Spotify returned no playable tracks from this playlist.');
      setState(s=>({...s,eventName:pl.name||s.eventName,playlistId:pid,songs:valid,history:[],active:false,startedAt:null,lastTrackId:null,lastPlayedAt:null}));
      const duplicates=raw.length-valid.length;
      flash(duplicates ? `Imported ${valid.length} unique songs (${duplicates} duplicate${duplicates===1?'':'s'} removed).` : `Imported ${valid.length} songs.`);
      setTab('setup');
    }catch(e){fail(e.message);}
  }

  function loadDemo(){
    const people=state.participants.length?state.participants:DEFAULT_PEOPLE.map(name=>({id:uid(),name}));
    const songs=Array.from({length:50},(_,i)=>{
      const base=DEMO_SONGS[i%DEMO_SONGS.length];
      return {id:uid(),spotifyId:`demo-${i+1}`,name:i<DEMO_SONGS.length?base[0]:`${base[0]} ${Math.floor(i/DEMO_SONGS.length)+1}`,artist:base[1],ownerId:people[i%people.length]?.id||''};
    });
    setState(s=>({...s,eventName:'Friends Hot 50 – Demo',participants:people,songs,history:[],active:false,lastTrackId:null}));
    flash('50-song demo loaded.');
    setTab('setup');
  }

  function setOwner(songId,ownerId){
    if(ownerId){
      const current=state.songs.find(x=>x.id===songId)?.ownerId;
      const count=state.songs.filter(x=>x.ownerId===ownerId && x.id!==songId).length;
      if(count>=MAX_SONGS_PER_PERSON && current!==ownerId) return fail(`${ownerMap[ownerId]||'This person'} already has ${MAX_SONGS_PER_PERSON} songs assigned.`);
    }
    setState(s=>({...s,songs:s.songs.map(x=>x.id===songId?{...x,ownerId}:x)}));
  }
  function addParticipant(){setState(s=>({...s,participants:[...s.participants,{id:uid(),name:`Friend ${s.participants.length+1}`}]}));}
  function renameParticipant(id,name){setState(s=>({...s,participants:s.participants.map(p=>p.id===id?{...p,name}:p)}));}
  function removeParticipant(id){setState(s=>({...s,participants:s.participants.filter(p=>p.id!==id),songs:s.songs.map(x=>x.ownerId===id?{...x,ownerId:''}:x)}));}

  function recordTrack(track, playedAt=new Date().toISOString(), source='spotify'){
    setState(s=>{
      if(!track?.id || s.history.some(h=>h.spotifyId===track.id)) return s;
      const match=s.songs.find(x=>x.spotifyId===track.id);
      if(!match) return s;
      const pos=s.songs.length-s.history.length;
      const entry={id:uid(),spotifyId:track.id,name:match.name,artist:match.artist,ownerId:match.ownerId,position:pos,playedAt,source};
      return {...s,history:[...s.history,entry],lastTrackId:track.id,lastPlayedAt:playedAt};
    });
  }

  function isCountdownContext(context){
    if(!state.playlistId) return true;
    return context?.uri === `spotify:playlist:${state.playlistId}`;
  }
  function startedAfterCountdown(playedAt){
    if(!state.startedAt) return false;
    return new Date(playedAt).getTime() >= new Date(state.startedAt).getTime() - 1500;
  }

  function handleLiveTrack(current, startedAt){
    const match=songMap[current?.item?.id];
    if(!match || !startedAfterCountdown(startedAt) || !isCountdownContext(current.context)) return;
    if(lastLiveTrackRef.current===current.item.id) return;
    lastLiveTrackRef.current=current.item.id;
    const livePos=Math.max(1,state.songs.length-state.history.length);
    if(prizePositionsFor(state.songs.length).includes(livePos)){
      setPrize({id:uid(),spotifyId:current.item.id,name:match.name,artist:match.artist,ownerId:match.ownerId,position:livePos,playedAt:startedAt,source:'live'});
    }
  }

  async function syncSpotify(){
    try{
      const t=await ensureToken();
      const after=state.startedAt ? `&after=${new Date(state.startedAt).getTime()}` : '';
      const recent=await spotifyFetch(`/me/player/recently-played?limit=50${after}`,t);
      const candidates=(recent?.items||[]).slice().reverse();
      for(const item of candidates){
        if(songMap[item.track?.id] && startedAfterCountdown(item.played_at) && isCountdownContext(item.context)){
          recordTrack(item.track,item.played_at,'recent');
        }
      }
      const current=await spotifyFetch('/me/player/currently-playing',t);
      if(current?.item){
        setNowPlaying(current.item);
        handleLiveTrack(current,new Date(Date.now()-(current.progress_ms||0)).toISOString());
      } else setNowPlaying(null);
      flash('Spotify history synced.');
    }catch(e){fail(e.message);}
  }

  async function pollOnce(){
    if(pollingRef.current)return;
    pollingRef.current=true;
    try{
      const t=await ensureToken();
      const current=await spotifyFetch('/me/player/currently-playing',t);
      if(current?.item){
        setNowPlaying(current.item);
        handleLiveTrack(current,new Date(Date.now()-(current.progress_ms||0)).toISOString());
      } else setNowPlaying(null);
    }catch(e){console.warn(e);}
    finally{pollingRef.current=false;}
  }

  useEffect(()=>{
    if(!polling)return;
    pollOnce();
    const id=setInterval(pollOnce,4000);
    return()=>clearInterval(id);
  },[polling,token,state.songs,state.history.length,state.startedAt,state.playlistId]);

  async function startCountdown(){
    const unassigned=state.songs.filter(s=>!s.ownerId).length;
    if(!state.songs.length)return fail('Import or load songs first.');
    if(unassigned)return fail(`${unassigned} songs still need an owner.`);
    const startTime=new Date().toISOString();
    lastLiveTrackRef.current=null;
    setNowPlaying(null);
    setState(s=>({...s,history:[],active:true,startedAt:startTime,lastTrackId:null,lastPlayedAt:null}));
    if(token){
      try{
        const t=await ensureToken();
        await spotifyFetch('/me/player/shuffle?state=true',t,{method:'PUT'});
        flash('Countdown started — Spotify shuffle is ON.');
      }catch(e){
        fail(`Countdown started, but I could not switch Spotify shuffle on automatically. Turn Shuffle on in Spotify. ${e.message}`);
      }
    } else flash('Countdown started. Turn Shuffle on in Spotify.');
    setPolling(!!token);
    setTab('countdown');
  }

  function resetCountdown(){
    if(confirm('Reset the played-song history and start again?')){
      lastLiveTrackRef.current=null;
      setState(s=>({...s,history:[],active:false,startedAt:null,lastTrackId:null,lastPlayedAt:null}));
      setPolling(false);
      setNowPlaying(null);
    }
  }
  function simulateNext(){
    const left=state.songs.filter(s=>!state.history.some(h=>h.spotifyId===s.spotifyId));
    if(!left.length)return;
    const pick=left[Math.floor(Math.random()*left.length)];
    recordTrack({id:pick.spotifyId},new Date().toISOString(),'demo');
  }
  function undoLast(){setState(s=>({...s,history:s.history.slice(0,-1)}));}
  function exportResults(){
    const rows=[['Position','Song','Artist','Nominated by','Played at'],...state.history.map(h=>[h.position,h.name,h.artist,ownerMap[h.ownerId]||'',h.playedAt])];
    const csv=rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download=`${state.eventName.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-results.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const assigned=state.songs.filter(s=>s.ownerId).length;
  const assignmentCounts=useMemo(()=>Object.fromEntries(state.participants.map(p=>[p.id,state.songs.filter(song=>song.ownerId===p.id).length])),[state.participants,state.songs]);
  const activePrizes=useMemo(()=>prizePositionsFor(state.songs.length),[state.songs.length]);
  const latest=state.history[state.history.length-1];
  const liveSong = nowPlaying?.id ? state.songs.find(s=>s.spotifyId===nowPlaying.id) : null;
  const livePosition=Math.max(1,state.songs.length-state.history.length);
  const displayEntry = liveSong ? {spotifyId:liveSong.spotifyId,name:liveSong.name,artist:liveSong.artist,ownerId:liveSong.ownerId,position:livePosition} : latest;
  const currentPosition=displayEntry?.position || (state.songs.length||50);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brandmark"><Music2 size={22}/></div><div><strong>{state.eventName}</strong><span>shuffle countdown</span></div></div>
      <div className="top-actions">
        <button className={`spotify-pill ${token?'connected':''}`} onClick={()=>token?setSettingsOpen(true):spotifyLogin(state.spotifyClientId).catch(e=>fail(e.message))}>
          {token?<Wifi size={16}/>:<WifiOff size={16}/>} {token?(spotifyUser?.display_name||'Spotify connected'):'Connect Spotify'}
        </button>
        <button className="icon-btn" onClick={()=>setSettingsOpen(true)} aria-label="Settings"><Settings size={20}/></button>
      </div>
    </header>

    {(notice||error)&&<div className={`toast ${error?'error':''}`}>{error||notice}</div>}

    <main>
      {tab==='countdown' && <section className="countdown-grid">
        <div className="hero-card">
          <div className="eyebrow">{state.active?'COUNTDOWN LIVE':'READY FOR COUNTDOWN'}</div>
          <div className="rank">#{currentPosition}</div>
          {displayEntry ? <>
            <h1>{displayEntry.name}</h1><p className="artist">{displayEntry.artist}</p>
            <div className="nominee"><span>Nominated by</span><strong>{ownerMap[displayEntry.ownerId]||'Unassigned'}</strong></div>
          </> : <>
            <h1>{state.songs.length ? 'The next song is a surprise.' : 'Build your countdown.'}</h1>
            <p className="artist">{state.songs.length ? 'Spotify keeps shuffling. The app reveals the live song but never the upcoming queue.' : 'Import your Spotify playlist, assign each song, then start the party.'}</p>
          </>}
          <div className="hero-stats"><div><b>{state.history.length}</b><span>completed</span></div><div><b>{remaining||state.songs.length}</b><span>remaining incl. current</span></div><div><b>{activePrizes.filter(p=>p<=currentPosition && !state.history.some(h=>h.position===p)).length}</b><span>prizes ahead</span></div></div>
          <div className="hero-buttons">
            {!state.active?<button className="primary" onClick={startCountdown}><Play size={18}/> Start countdown</button>:<button className="primary" onClick={()=>setPolling(p=>!p)}>{polling?<Pause size={18}/>:<Play size={18}/>} {polling?'Pause tracking':'Resume tracking'}</button>}
            {token&&<button className="secondary" onClick={syncSpotify}><RotateCcw size={18}/> Sync history</button>}
            {!token&&state.songs.some(s=>s.spotifyId.startsWith('demo-'))&&<button className="secondary" onClick={simulateNext}><Shuffle size={18}/> Play random demo song</button>}
          </div>
          {nowPlaying&&<div className="now-playing"><Volume2 size={16}/><span>Spotify now playing: <b>{nowPlaying.name}</b> — {nowPlaying.artists?.map(a=>a.name).join(', ')}{liveSong ? ` · live countdown #${livePosition}` : ' · not in master playlist'}</span></div>}
        </div>

        <aside className="side-card prizes-card"><div className="section-title"><Trophy size={18}/> Prize positions</div>
          <div className="prize-list">{activePrizes.map(p=>{
            const hit=state.history.find(h=>h.position===p);
            const liveHit=liveSong && livePosition===p ? liveSong : null;
            return <div className={`prize-row ${hit||liveHit?'hit':''}`} key={p}><div className="prize-num">#{p}</div><div><strong>{p===1?'Countdown champion':p<=3?'Podium prize':'Prize song'}</strong><span>{hit?`${hit.name} · ${ownerMap[hit.ownerId]||''}`:liveHit?`${liveHit.name} · LIVE`:'Still a surprise'}</span></div>{hit||liveHit?<CheckCircle2 size={18}/>:<Sparkles size={18}/>}</div>
          })}</div>
        </aside>

        <div className="history-card"><div className="section-head"><div className="section-title"><ListMusic size={18}/> Countdown so far</div><div className="history-actions">{state.history.length>0&&<button className="text-btn" onClick={undoLast}>Undo last</button>}<button className="text-btn" onClick={exportResults}><Download size={15}/> Export</button></div></div>
          {state.history.length===0?<div className="empty"><Music2 size={34}/><strong>No completed songs yet</strong><span>The live track is shown above. Completed tracks appear here once Spotify adds them to Recently Played.</span></div>:
          <div className="history-list">{[...state.history].reverse().map((h,i)=><div className={`history-row ${i===0?'latest':''}`} key={h.id}><div className="history-rank">#{h.position}</div><div className="track-main"><strong>{h.name}</strong><span>{h.artist}</span></div><div className="owner-chip">{ownerMap[h.ownerId]||'—'}</div><time>{formatTime(h.playedAt)}</time></div>)}</div>}
        </div>
      </section>}

      {tab==='setup' && <section className="setup-layout">
        <div className="panel setup-panel"><div className="section-title"><Users size={18}/> Friends</div><p className="muted">Each person can nominate up to 10 songs, but there is no minimum. The countdown length is the number of unique songs in the master playlist.</p>
          <div className="people-list">{state.participants.map((p,i)=><div className="person-row" key={p.id}><span>{i+1}</span><input value={p.name} onChange={e=>renameParticipant(p.id,e.target.value)}/><div className={`song-count ${assignmentCounts[p.id]>=MAX_SONGS_PER_PERSON?'full-count':''}`}>{assignmentCounts[p.id]||0} song{(assignmentCounts[p.id]||0)===1?'':'s'} assigned · max {MAX_SONGS_PER_PERSON}</div><button className="icon-btn small" onClick={()=>removeParticipant(p.id)}><Trash2 size={16}/></button></div>)}</div>
          <button className="secondary full" onClick={addParticipant}><Plus size={17}/> Add friend</button>
        </div>
        <div className="panel songs-panel"><div className="section-head"><div><div className="section-title"><ListMusic size={18}/> Playlist songs</div><p className="muted">{assigned}/{state.songs.length} assigned · maximum {MAX_SONGS_PER_PERSON} per person · no minimum</p></div><button className="primary compact" onClick={startCountdown}><Play size={16}/> Start</button></div>
          {!state.songs.length?<div className="empty"><ListMusic size={34}/><strong>No playlist imported</strong><span>Connect Spotify and import your playlist, or load the demo.</span><button className="secondary" onClick={loadDemo}>Load 50-song demo</button></div>:
          <div className="song-table">{state.songs.map((s,i)=><div className="song-row" key={s.id}><span className="song-index">{i+1}</span><div className="track-main"><strong>{s.name}</strong><span>{s.artist}</span></div><select value={s.ownerId} onChange={e=>setOwner(s.id,e.target.value)}><option value="">Choose owner…</option>{state.participants.map(p=><option value={p.id} key={p.id} disabled={(assignmentCounts[p.id]||0)>=MAX_SONGS_PER_PERSON && s.ownerId!==p.id}>{p.name} — {assignmentCounts[p.id]||0} assigned (max {MAX_SONGS_PER_PERSON})</option>)}</select></div>)}</div>}
        </div>
      </section>}

      {tab==='import' && <section className="import-wrap"><div className="panel import-panel"><div className="import-icon"><Music2 size={32}/></div><h2>Import your master Spotify playlist</h2><p>Paste the playlist you own containing everyone’s nominated songs. People can contribute any number up to 10.</p>
        <label>Spotify playlist URL or ID</label><input className="big-input" placeholder="https://open.spotify.com/playlist/..." value={state.playlistId} onChange={e=>update({playlistId:e.target.value})}/>
        <button className="primary full big" onClick={importPlaylist} disabled={!token}><Upload size={18}/> Import playlist</button>
        {!token&&<div className="helper">Connect Spotify in Settings first, or <button className="link" onClick={loadDemo}>load the 50-song demo</button>.</div>}
        <div className="privacy-note"><CheckCircle2 size={18}/><div><strong>Surprise mode by design</strong><span>This app does not request or display Spotify’s upcoming queue.</span></div></div>
      </div></section>}
    </main>

    <nav className="bottom-nav">
      <button className={tab==='countdown'?'active':''} onClick={()=>setTab('countdown')}><Trophy size={20}/><span>Countdown</span></button>
      <button className={tab==='import'?'active':''} onClick={()=>setTab('import')}><Music2 size={20}/><span>Playlist</span></button>
      <button className={tab==='setup'?'active':''} onClick={()=>setTab('setup')}><Users size={20}/><span>Setup</span></button>
    </nav>

    {settingsOpen&&<div className="modal-backdrop" onMouseDown={()=>setSettingsOpen(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setSettingsOpen(false)}><X/></button><h2>Settings</h2>
      <label>Event name</label><input value={state.eventName} onChange={e=>update({eventName:e.target.value})}/>
      <label>Spotify Client ID</label><input placeholder="Paste your Spotify app Client ID" value={state.spotifyClientId} onChange={e=>update({spotifyClientId:e.target.value.trim()})}/>
      <p className="smallprint">In the Spotify Developer Dashboard, add this Redirect URI exactly:</p><div className="copybox"><code>{window.location.origin}/</code><button onClick={()=>{navigator.clipboard.writeText(window.location.origin+'/');flash('Redirect URI copied.')}}><Copy size={15}/></button></div>
      <div className="modal-actions">{token?<button className="secondary" onClick={logout}><LogOut size={17}/> Disconnect Spotify</button>:<button className="spotify-connect" onClick={()=>spotifyLogin(state.spotifyClientId).catch(e=>fail(e.message))}><Music2 size={17}/> Connect Spotify</button>}<button className="primary" onClick={()=>{saveState(state);setSettingsOpen(false);flash('Settings saved.')}}><Save size={17}/> Save</button></div>
      <hr/><button className="danger-link" onClick={resetCountdown}><RotateCcw size={16}/> Reset countdown history</button>
    </div></div>}

    {prize&&<div className="celebration" onClick={()=>setPrize(null)}><div className="burst">✦</div><Trophy size={64}/><div className="eyebrow">PRIZE SONG!</div><div className="celebration-rank">#{prize.position}</div><h2>{prize.name}</h2><p>{prize.artist}</p><div className="winner-name">{ownerMap[prize.ownerId]}</div><span>Tap anywhere to continue</span></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
