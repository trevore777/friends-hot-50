(function(){
  const STORAGE_KEY='friends-hot-50-state-v1';
  const FIRST_TRACK_KEY='friends-hot-50-first-live-track';
  const originalFetch=window.fetch.bind(window);

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch{return null;}
  }
  function songIds(state){return new Set((state?.songs||[]).map(s=>s.spotifyId).filter(Boolean));}
  function playlistContext(state){return state?.playlistId?{type:'playlist',uri:`spotify:playlist:${state.playlistId}`,href:null,external_urls:{spotify:`https://open.spotify.com/playlist/${state.playlistId}`}}:null;}
  function jsonResponse(body,response){
    return new Response(JSON.stringify(body),{status:response.status,statusText:response.statusText,headers:response.headers});
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

  // Starting a new event gets a new first-live-song marker.
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('button');
    if(b && /start( countdown)?/i.test((b.textContent||'').trim())){
      sessionStorage.removeItem(FIRST_TRACK_KEY);
    }
  },true);
})();
