// Keep legacy helper scripts on the same browser state as the main React app.
// The React app uses friends-hot-50-state-v2; older helper scripts still read v1.
(function(){
  const SOURCE='friends-hot-50-state-v2';
  const LEGACY='friends-hot-50-state-v1';
  let last='';

  function sync(){
    try{
      const current=localStorage.getItem(SOURCE) || '';
      if(current && current!==last){
        localStorage.setItem(LEGACY,current);
        last=current;
      }
    }catch(e){
      console.warn('State bridge sync failed',e);
    }
  }

  sync();
  window.addEventListener('focus',sync);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) sync(); });
  setInterval(sync,150);
})();
