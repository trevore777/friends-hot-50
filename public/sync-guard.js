(function(){
  const STORAGE_KEY='friends-hot-50-state-v1';
  const FIRST_TRACK_KEY='friends-hot-50-first-live-track';
  const LAST_TRACK_KEY='friends-hot-50-last-live-track';
  const PENDING_SKIPS_KEY='friends-hot-50-pending-skipped-tracks';
  const originalFetch=window.fetch.bind(window);

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}
  }
  function songIds(state){return new Set((state?.songs||[]).map(s=>s.spotifyId).filter(Boolean));}
  function playlistContext(state){return state?.playlistId?{type:'playlist',uri:`spotify:playlist:${state.playlistId}`,href:null,external_urls:{spotify:`https://open.spotify.com/playlist/${state.playlistId}`}}:null;}
  function jsonResponse(body,response){
    return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  function readPending(){
    try{return JSON.parse(sessionStorage.getItem(PENDING_SKIPS_KEY)||'[]');}catch{return [];}
  }
  function writePending(items){
    sessionStorage.setItem(PENDING_SKIPS_KEY,JSON.stringify(items));
  }
  function queueSkippedTrack(trackId,state){
    if(!trackId) return;
    const song=(state?.songs||[]).find(s=>s.spotifyId===trackId);
    if(!song) return;
    if((state.history||[]).some(h=>h.spotifyId===trackId)) return;
    const pending=readPending();
    if(pending.some(x=>x.spotifyId===trackId)) return;
    pending.push({
      spotifyId:trackId,
      name:song.name||'',
      artist:song.artist||'',
      detectedAt:new Date().toISOString()
    });
    writePending(pending);
  }
  function syntheticRecentEntry(item,state){
    const song=(state?.songs||[]).find(s=>s.spotifyId===item.spotifyId);
    if(!song) return null;
    return {
      track:{
        id:song.spotifyId,
        name:song.name||'',
        type:'track',
        artists:(song.artist||'').split(',').filter(Boolean).map(name=>({name:name.trim()}))
      },
      played_at:item.detectedAt||new Date().toISOString(),
      context:playlistContext(state)
    };
  }

  window.fetch=async function(input,init){
    const response=await originalFetch(input,init);
    const url=typeof input==='string'?input:(input?.url||'');
    if(!url.includes('api.spotify.com/v1/me/player/')) return response;
    if(!response.ok || response.status===204) return response;

    const state=readState();
    if(!state?.active || !state?.startedAt) return response;
    const ids=songIds(state);
    if(!ids.size) return response;

    try{
      if(url.includes('/currently-playing')){
        const data=await response.clone().json();
        const id=data?.item?.id;
        if(id && ids.has(id)){
          const previous=sessionStorage.getItem(LAST_TRACK_KEY);
          // Any transition from one imported countdown track to a different imported
          // countdown track means the previous song occupied a countdown position.
          // This includes natural endings AND manual Skip/Next actions.
          if(previous && previous!==id && ids.has(previous)){
            queueSkippedTrack(previous,state);
          }
          sessionStorage.setItem(LAST_TRACK_KEY,id);

          // A countdown may be started while a song is already playing. Treat that
          // song as the live first entry instead of rejecting it because its Spotify
          // start time predates the Start button by a few seconds/minutes.
          data.progress_ms=0;
          if(state.playlistId) data.context=playlistContext(state);
          if(!sessionStorage.getItem(FIRST_TRACK_KEY)) sessionStorage.setItem(FIRST_TRACK_KEY,id);
          return jsonResponse(data,response);
        }
      }

      if(url.includes('/recently-played')){
        const data=await response.clone().json();
        const firstTrack=sessionStorage.getItem(FIRST_TRACK_KEY);
        const startMs=new Date(state.startedAt).getTime();
        if(Array.isArray(data?.items)){
          data.items=data.items.map(entry=>{
            const id=entry?.track?.id;
            if(!id || !ids.has(id)) return entry;
            const next={...entry};
            if(state.playlistId) next.context=playlistContext(state);
            // If the first song was already underway when Start was pressed, move
            // its history timestamp to the countdown boundary so it is recorded as #N.
            if(id===firstTrack && new Date(next.played_at).getTime()<startMs){
              next.played_at=new Date(startMs+1).toISOString();
            }
            return next;
          });

          // Spotify may omit a manually skipped track from Recently Played. Add any
          // transitions we observed ourselves so React records them in countdown order.
          const existing=new Set(data.items.map(x=>x?.track?.id).filter(Boolean));
          const pending=readPending();
          const remaining=[];
          for(const item of pending){
            if(existing.has(item.spotifyId) || (state.history||[]).some(h=>h.spotifyId===item.spotifyId)) continue;
            const synthetic=syntheticRecentEntry(item,state);
            if(synthetic){
              data.items.unshift(synthetic);
              existing.add(item.spotifyId);
            }else{
              remaining.push(item);
            }
          }
          writePending(remaining);
          return jsonResponse(data,response);
        }
      }
    }catch(err){
      console.warn('Friends Hot 50 sync guard:',err);
    }
    return response;
  };

  function catchUp(){
    if(document.visibilityState!=='visible') return;
    setTimeout(()=>{
      const state=readState();
      if(!state?.active) return;
      const buttons=[...document.querySelectorAll('button')];
      const sync=buttons.find(b=>/sync history/i.test(b.textContent||''));
      if(sync && !sync.disabled) sync.click();
    },350);
  }

  document.addEventListener('visibilitychange',catchUp);
  window.addEventListener('focus',catchUp);
  window.addEventListener('pageshow',catchUp);

  // Starting a new event gets fresh live-track transition state.
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('button');
    if(b && /start( countdown)?/i.test((b.textContent||'').trim())){
      sessionStorage.removeItem(FIRST_TRACK_KEY);
      sessionStorage.removeItem(LAST_TRACK_KEY);
      sessionStorage.removeItem(PENDING_SKIPS_KEY);
    }
  },true);
})();
