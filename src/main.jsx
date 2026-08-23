import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Music2, Trophy, Users, Settings, Play, Pause, RotateCcw, CheckCircle2,
  ListMusic, Sparkles, Plus, Trash2, Wifi, WifiOff, X, Save, LogOut,
  Download, Volume2, ExternalLink
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'friends-hot-50-state-v2';
const TOKEN_KEY = 'friends-hot-50-spotify-token';
const PKCE_KEY = 'friends-hot-50-pkce';
const DEFAULT_PRIZES = [50, 40, 30, 20, 10, 3, 2, 1];
const MAX_SONGS_PER_PERSON = 10;
const DEFAULT_PEOPLE = ['Trevor', 'Sarah', 'John', 'Michelle', 'Peter'];

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const formatTime = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

function initialState() {
  return {
    eventName: 'Friends Hot 50',
    participants: DEFAULT_PEOPLE.map(name => ({ id: uid(), name })),
    songs: [], history: [], startedAt: null, active: false,
    spotifyClientId: '', playlistId: '', lastTrackId: null, lastPlayedAt: null
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || initialState();
  } catch {
    return initialState();
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function parsePlaylistId(value = '') {
  const match = value.match(/playlist[/:]([A-Za-z0-9]+)/);
  return match ? match[1] : value.trim();
}

function prizePositionsFor(total) {
  if (!total) return [];
  return [...new Set([total, ...DEFAULT_PRIZES.filter(p => p < total)])]
    .filter(p => p <= total)
    .sort((a, b) => b - a);
}

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha256(text) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}
function randomVerifier() {
  const data = new Uint8Array(64);
  crypto.getRandomValues(data);
  return b64url(data);
}

async function spotifyLogin(clientId) {
  if (!clientId) throw new Error('Add your Spotify Client ID in Settings first.');
  const verifier = randomVerifier();
  const challenge = b64url(await sha256(verifier));
  const redirectUri = window.location.origin + '/';
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, redirectUri }));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'user-read-currently-playing user-read-playback-state user-read-recently-played playlist-read-private playlist-read-collaborative',
    code_challenge_method: 'S256',
    code_challenge: challenge,
    show_dialog: 'true'
  });
  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeSpotifyCode(code, clientId) {
  const saved = JSON.parse(sessionStorage.getItem(PKCE_KEY) || '{}');
  if (!saved.verifier) throw new Error('Spotify login session expired. Connect again.');
  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: saved.redirectUri,
    code_verifier: saved.verifier
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  if (!response.ok) throw new Error('Spotify login failed.');
  const raw = await response.json();
  const token = { ...raw, expires_at: Date.now() + raw.expires_in * 1000 };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  sessionStorage.removeItem(PKCE_KEY);
  return token;
}

async function refreshToken(token, clientId) {
  if (!token?.refresh_token) return null;
  const body = new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: token.refresh_token });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  if (!response.ok) return null;
  const raw = await response.json();
  const next = { ...token, ...raw, refresh_token: raw.refresh_token || token.refresh_token, expires_at: Date.now() + raw.expires_in * 1000 };
  localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
  return next;
}

async function spotifyFetch(path, token) {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token.access_token}` }
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch {}
    throw new Error(detail ? `Spotify ${response.status}: ${detail}` : `Spotify request failed (${response.status}).`);
  }
  return response.json();
}

function App() {
  const [state, setState] = useState(loadState);
  const [tab, setTab] = useState('countdown');
  const [token, setToken] = useState(() => {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY)); } catch { return null; }
  });
  const [spotifyUser, setSpotifyUser] = useState(null);
  const [polling, setPolling] = useState(false);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pollingRef = useRef(false);

  useEffect(() => saveState(state), [state]);

  const ownerMap = useMemo(() => Object.fromEntries(state.participants.map(p => [p.id, p.name])), [state.participants]);
  const songMap = useMemo(() => Object.fromEntries(state.songs.map(s => [s.spotifyId, s])), [state.songs]);
  const assignmentCounts = useMemo(() => Object.fromEntries(state.participants.map(p => [p.id, state.songs.filter(s => s.ownerId === p.id).length])), [state.participants, state.songs]);
  const prizes = useMemo(() => prizePositionsFor(state.songs.length), [state.songs.length]);

  const flash = message => { setNotice(message); setTimeout(() => setNotice(''), 2800); };
  const fail = message => { setError(message); setTimeout(() => setError(''), 5000); };

  useEffect(() => {
    const url = new URL(location.href);
    const code = url.searchParams.get('code');
    const authError = url.searchParams.get('error');
    if (authError) {
      setError(`Spotify login: ${authError}`);
      history.replaceState({}, '', location.pathname);
    }
    if (code && state.spotifyClientId) {
      exchangeSpotifyCode(code, state.spotifyClientId)
        .then(next => { setToken(next); flash('Spotify connected.'); history.replaceState({}, '', location.pathname); })
        .catch(e => fail(e.message));
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      let activeToken = token;
      if (activeToken.expires_at < Date.now() + 60000) activeToken = await refreshToken(activeToken, state.spotifyClientId);
      if (activeToken) {
        setToken(activeToken);
        try {
          const me = await spotifyFetch('/me', activeToken);
          if (alive) setSpotifyUser(me);
        } catch {}
      }
    })();
    return () => { alive = false; };
  }, [token?.access_token, state.spotifyClientId]);

  async function ensureToken() {
    let activeToken = token;
    if (!activeToken) throw new Error('Connect Spotify first.');
    if (activeToken.expires_at < Date.now() + 60000) {
      activeToken = await refreshToken(activeToken, state.spotifyClientId);
      if (!activeToken) throw new Error('Spotify session expired. Reconnect.');
      setToken(activeToken);
    }
    return activeToken;
  }

  async function importPlaylist() {
    try {
      const activeToken = await ensureToken();
      const playlistId = parsePlaylistId(state.playlistId);
      if (!playlistId) throw new Error('Paste the Spotify playlist link or ID.');
      const playlist = await spotifyFetch(`/playlists/${playlistId}`, activeToken);
      let tracks = [];
      let offset = 0;
      while (true) {
        const page = await spotifyFetch(`/playlists/${playlistId}/items?limit=50&offset=${offset}`, activeToken);
        const items = Array.isArray(page?.items) ? page.items : [];
        tracks.push(...items);
        offset += items.length;
        if (!items.length || !page?.next) break;
      }
      const seen = new Set();
      const songs = tracks
        .map(item => item?.item ?? item?.track ?? item)
        .filter(track => track?.type === 'track' && track.id)
        .filter(track => { if (seen.has(track.id)) return false; seen.add(track.id); return true; })
        .map(track => ({
          id: uid(), spotifyId: track.id, name: track.name,
          artist: track.artists?.map(a => a.name).join(', ') || '',
          image: track.album?.images?.[0]?.url || '',
          spotifyUrl: track.external_urls?.spotify || '', ownerId: ''
        }));
      if (!songs.length) throw new Error('No playable songs were found in that playlist.');
      setNowPlaying(null);
      setPolling(false);
      setState(s => ({ ...s, eventName: playlist?.name || s.eventName, playlistId, songs, history: [], active: false, startedAt: null }));
      flash(`Imported ${songs.length} unique songs.`);
      setTab('setup');
    } catch (e) { fail(e.message); }
  }

  function setOwner(songId, ownerId) {
    if (ownerId) {
      const count = state.songs.filter(song => song.ownerId === ownerId && song.id !== songId).length;
      if (count >= MAX_SONGS_PER_PERSON) return fail(`${ownerMap[ownerId] || 'This person'} already has 10 songs.`);
    }
    setState(s => ({ ...s, songs: s.songs.map(song => song.id === songId ? { ...song, ownerId } : song) }));
  }

  function addParticipant() {
    setState(s => ({ ...s, participants: [...s.participants, { id: uid(), name: `Friend ${s.participants.length + 1}` }] }));
  }
  function renameParticipant(id, name) {
    setState(s => ({ ...s, participants: s.participants.map(p => p.id === id ? { ...p, name } : p) }));
  }
  function removeParticipant(id) {
    setState(s => ({ ...s, participants: s.participants.filter(p => p.id !== id), songs: s.songs.map(song => song.ownerId === id ? { ...song, ownerId: '' } : song) }));
  }

  function recordTrack(track, playedAt = new Date().toISOString()) {
    setState(s => {
      if (!track?.id || s.history.some(item => item.spotifyId === track.id)) return s;
      const song = s.songs.find(item => item.spotifyId === track.id);
      if (!song) return s;
      const position = s.songs.length - s.history.length;
      const entry = {
        id: uid(), spotifyId: song.spotifyId, name: song.name, artist: song.artist,
        ownerId: song.ownerId, position, playedAt
      };
      return { ...s, history: [...s.history, entry], lastTrackId: song.spotifyId, lastPlayedAt: playedAt };
    });
  }

  async function updatePlayback(showNotice = false) {
    try {
      const activeToken = await ensureToken();
      if (state.startedAt) {
        const after = new Date(state.startedAt).getTime();
        const recent = await spotifyFetch(`/me/player/recently-played?limit=50&after=${after}`, activeToken);
        const chronological = (recent?.items || []).slice().reverse();
        chronological.forEach(item => {
          if (item?.track?.id && songMap[item.track.id] && new Date(item.played_at).getTime() >= after - 1500) {
            recordTrack(item.track, item.played_at);
          }
        });
      }
      const current = await spotifyFetch('/me/player/currently-playing', activeToken);
      if (current?.item?.id && songMap[current.item.id]) setNowPlaying(current);
      else setNowPlaying(null);
      if (showNotice) flash('Played-song history synced from Spotify.');
    } catch (e) {
      if (showNotice) fail(e.message);
      else console.warn(e);
    }
  }

  async function pollOnce() {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try { await updatePlayback(false); } finally { pollingRef.current = false; }
  }

  useEffect(() => {
    if (!polling) return;
    pollOnce();
    const timer = setInterval(pollOnce, 4000);
    return () => clearInterval(timer);
  }, [polling, token?.access_token, state.startedAt, state.playlistId, state.songs.length]);

  function startTracking() {
    if (!state.songs.length) return fail('Import the Spotify playlist first.');
    const unassigned = state.songs.filter(song => !song.ownerId).length;
    if (unassigned) return fail(`${unassigned} song${unassigned === 1 ? '' : 's'} still need an owner.`);
    if (!token) return fail('Connect Spotify before starting the countdown.');
    const startedAt = new Date().toISOString();
    setState(s => ({ ...s, history: [], active: true, startedAt, lastTrackId: null, lastPlayedAt: null }));
    setNowPlaying(null);
    setPolling(true);
    setTab('countdown');
    flash('Tracking started. Keep playing the playlist on Shuffle in Spotify.');
  }

  function resetCountdown() {
    if (!confirm('Clear the played-song history and start again?')) return;
    setState(s => ({ ...s, history: [], active: false, startedAt: null, lastTrackId: null, lastPlayedAt: null }));
    setPolling(false);
    setNowPlaying(null);
  }

  function undoLast() {
    setState(s => ({ ...s, history: s.history.slice(0, -1) }));
  }

  function exportResults() {
    const rows = [['Position', 'Song', 'Artist', 'Nominated by', 'Played at'], ...state.history.map(h => [h.position, h.name, h.artist, ownerMap[h.ownerId] || '', h.playedAt])];
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    link.download = `${state.eventName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-results.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null); setSpotifyUser(null); setPolling(false);
    flash('Spotify disconnected.');
  }

  const completed = state.history.length;
  const currentSong = nowPlaying?.item?.id ? state.songs.find(song => song.spotifyId === nowPlaying.item.id) : null;
  const currentAlreadyRecorded = !!(currentSong && state.history.some(h => h.spotifyId === currentSong.spotifyId));
  const livePosition = currentSong && !currentAlreadyRecorded ? Math.max(1, state.songs.length - completed) : null;
  const latest = state.history[state.history.length - 1];
  const display = currentSong && livePosition ? { ...currentSong, position: livePosition } : latest;
  const currentPosition = display?.position || state.songs.length || 50;
  const stillToPlay = Math.max(0, state.songs.length - completed - (livePosition ? 1 : 0));

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><div className="brandmark"><Music2 size={22}/></div><div><strong>{state.eventName}</strong><span>Spotify shuffle countdown</span></div></div>
      <div className="top-actions">
        <button className={`spotify-pill ${token ? 'connected' : ''}`} onClick={() => token ? setSettingsOpen(true) : spotifyLogin(state.spotifyClientId).catch(e => fail(e.message))}>
          {token ? <Wifi size={16}/> : <WifiOff size={16}/>} {token ? (spotifyUser?.display_name || 'Spotify connected') : 'Connect Spotify'}
        </button>
        <button className="icon-btn" onClick={() => setSettingsOpen(true)}><Settings size={20}/></button>
      </div>
    </header>

    {(notice || error) && <div className={`toast ${error ? 'error' : ''}`}>{error || notice}</div>}

    <main>
      {tab === 'countdown' && <section className="countdown-grid">
        <div className="hero-card">
          <div className="eyebrow">{state.active ? 'TRACKING SPOTIFY' : 'READY FOR COUNTDOWN'}</div>
          <div className="rank">#{currentPosition}</div>
          {display ? <>
            <h1>{display.name}</h1><p className="artist">{display.artist}</p>
            <div className="nominee"><span>Nominated by</span><strong>{ownerMap[display.ownerId] || 'Unassigned'}</strong></div>
          </> : <>
            <h1>{state.songs.length ? 'Upcoming songs stay a surprise.' : 'Build your countdown.'}</h1>
            <p className="artist">{state.songs.length ? 'Start the playlist in Spotify, turn Shuffle on, then start tracking here. This app never shows the upcoming queue.' : 'Connect Spotify and import the group playlist.'}</p>
          </>}
          <div className="hero-stats">
            <div><b>{completed}</b><span>songs recorded</span></div>
            <div><b>{stillToPlay}</b><span>still to play</span></div>
            <div><b>{state.songs.length}</b><span>playlist songs</span></div>
            <div><b>{prizes.filter(p => p < currentPosition && !state.history.some(h => h.position === p)).length}</b><span>prizes ahead</span></div>
          </div>
          <div className="hero-buttons">
            {!state.active ? <button className="primary" onClick={startTracking}><Play size={18}/> Start tracking</button> :
              <button className="primary" onClick={() => setPolling(p => !p)}>{polling ? <Pause size={18}/> : <Play size={18}/>} {polling ? 'Pause tracking' : 'Resume tracking'}</button>}
            {token && <button className="secondary" onClick={() => updatePlayback(true)}><RotateCcw size={18}/> Sync played songs</button>}
          </div>
          {state.songs.length > 0 && !state.active && <div className="now-playing"><Music2 size={16}/><span><b>Before starting:</b> open this playlist in Spotify, press Shuffle, start playback, then return here and press Start tracking.</span></div>}
          {nowPlaying?.item && <div className="now-playing"><Volume2 size={16}/><span>Now playing: <b>{nowPlaying.item.name}</b> — {nowPlaying.item.artists?.map(a => a.name).join(', ')}{livePosition ? ` · countdown #${livePosition}` : ''}</span></div>}
        </div>

        <aside className="side-card prizes-card">
          <div className="section-title"><Trophy size={18}/> Prize positions</div>
          <div className="prize-list">{prizes.map(position => {
            const hit = state.history.find(h => h.position === position);
            const liveHit = livePosition === position ? currentSong : null;
            return <div className={`prize-row ${hit || liveHit ? 'hit' : ''}`} key={position}>
              <div className="prize-num">#{position}</div>
              <div><strong>{position === 1 ? 'Countdown champion' : position <= 3 ? 'Podium prize' : 'Prize song'}</strong>
                <span>{hit ? `${hit.name} · ${ownerMap[hit.ownerId] || ''}` : liveHit ? `${liveHit.name} · ${ownerMap[liveHit.ownerId] || ''} · LIVE` : 'Still a surprise'}</span>
              </div>
              {hit || liveHit ? <CheckCircle2 size={18}/> : <Sparkles size={18}/>} 
            </div>;
          })}</div>
        </aside>

        <div className="history-card">
          <div className="section-head"><div className="section-title"><ListMusic size={18}/> Songs played so far</div><div className="history-actions">
            {state.history.length > 0 && <button className="text-btn" onClick={undoLast}>Undo last</button>}
            <button className="text-btn" onClick={exportResults}><Download size={15}/> Export</button>
          </div></div>
          {state.history.length === 0 ? <div className="empty"><Music2 size={34}/><strong>No completed songs yet</strong><span>As Spotify finishes songs, they will appear here automatically in countdown order.</span></div> :
            <div className="history-list">{[...state.history].reverse().map((h, index) => <div className={`history-row ${index === 0 ? 'latest' : ''}`} key={h.id}>
              <div className="history-rank">#{h.position}</div><div className="track-main"><strong>{h.name}</strong><span>{h.artist}</span></div><div className="owner-chip">{ownerMap[h.ownerId] || '—'}</div><time>{formatTime(h.playedAt)}</time>
            </div>)}</div>}
        </div>
      </section>}

      {tab === 'setup' && <section className="setup-layout">
        <div className="panel setup-panel">
          <div className="section-title"><Users size={18}/> Friends</div>
          <p className="muted">Add the group members. Each person can nominate up to 10 songs.</p>
          <div className="people-list">{state.participants.map((p, index) => <div className="person-row" key={p.id}>
            <span>{index + 1}</span><input value={p.name} onChange={e => renameParticipant(p.id, e.target.value)}/><span className="assignment-count">{assignmentCounts[p.id] || 0} song{assignmentCounts[p.id] === 1 ? '' : 's'} assigned</span><button className="icon-btn small" onClick={() => removeParticipant(p.id)}><Trash2 size={16}/></button>
          </div>)}</div>
          <button className="secondary full" onClick={addParticipant}><Plus size={17}/> Add friend</button>
        </div>

        <div className="panel setup-panel">
          <div className="section-title"><Music2 size={18}/> Spotify playlist</div>
          <p className="muted">All songs must be unique. The app removes duplicate Spotify track IDs when importing.</p>
          <div className="playlist-import"><input placeholder="Spotify playlist link or ID" value={state.playlistId} onChange={e => setState(s => ({ ...s, playlistId: e.target.value }))}/><button className="primary" onClick={importPlaylist}>Import playlist</button></div>
          <p className="muted">{state.songs.length ? `${state.songs.length} unique songs imported.` : 'No playlist imported yet.'}</p>
        </div>

        <div className="panel songs-panel">
          <div className="section-title"><ListMusic size={18}/> Assign songs to friends</div>
          <p className="muted">The song order shown here is only the playlist setup order. It does not reveal Spotify's shuffled playback order.</p>
          {state.songs.length === 0 ? <div className="empty"><Music2 size={30}/><strong>Import the playlist first</strong></div> :
            <div className="song-table">{state.songs.map((song, index) => <div className="song-row" key={song.id}>
              <span className="song-index">{index + 1}</span><div className="track-main"><strong>{song.name}</strong><span>{song.artist}</span></div>
              <select value={song.ownerId || ''} onChange={e => setOwner(song.id, e.target.value)}><option value="">Choose friend</option>{state.participants.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select>
              {song.spotifyUrl && <a className="icon-btn small" href={song.spotifyUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/></a>}
            </div>)}</div>}
        </div>
      </section>}
    </main>

    <nav className="bottom-nav">
      <button className={tab === 'countdown' ? 'active' : ''} onClick={() => setTab('countdown')}><Trophy size={19}/> Countdown</button>
      <button className={tab === 'setup' ? 'active' : ''} onClick={() => setTab('setup')}><Users size={19}/> Setup</button>
      <button onClick={resetCountdown}><RotateCcw size={19}/> Reset</button>
    </nav>

    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}>
      <div className="modal-head"><div><strong>Settings</strong><span>Spotify connection</span></div><button className="icon-btn" onClick={() => setSettingsOpen(false)}><X size={20}/></button></div>
      <label>Event name<input value={state.eventName} onChange={e => setState(s => ({ ...s, eventName: e.target.value }))}/></label>
      <label>Spotify Client ID<input value={state.spotifyClientId} onChange={e => setState(s => ({ ...s, spotifyClientId: e.target.value.trim() }))} placeholder="Spotify app Client ID"/></label>
      <p className="muted">Add this site's exact URL as a Redirect URI in your Spotify developer app.</p>
      <div className="modal-actions">
        {token ? <button className="secondary" onClick={logout}><LogOut size={16}/> Disconnect Spotify</button> : <button className="secondary" onClick={() => spotifyLogin(state.spotifyClientId).catch(e => fail(e.message))}><Wifi size={16}/> Connect Spotify</button>}
        <button className="primary" onClick={() => { saveState(state); setSettingsOpen(false); flash('Settings saved.'); }}><Save size={16}/> Save</button>
      </div>
    </div></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
