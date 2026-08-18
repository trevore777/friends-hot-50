const STORAGE_KEY = 'friends-hot-50-state-v1';
const PANEL_ID = 'bulk-song-assignment';

function getState(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
  catch { return null; }
}

function injectStyles(){
  if(document.getElementById('bulk-assign-styles')) return;
  const style=document.createElement('style');
  style.id='bulk-assign-styles';
  style.textContent=`
    #${PANEL_ID}{margin:18px 0 22px;padding:18px;border:1px solid #245a3c;border-radius:18px;background:#071b11;color:#effff4}
    #${PANEL_ID} .ba-title{font-size:1.05rem;font-weight:800;margin-bottom:6px}
    #${PANEL_ID} .ba-help{color:#9db7a7;margin-bottom:14px;line-height:1.4}
    #${PANEL_ID} .ba-people{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
    #${PANEL_ID} .ba-person,#${PANEL_ID} .ba-action{border:1px solid #2b6946;background:#0b2718;color:#effff4;border-radius:999px;padding:10px 14px;font-weight:750;cursor:pointer}
    #${PANEL_ID} .ba-person.active{background:#22dc6b;color:#031108;border-color:#22dc6b}
    #${PANEL_ID} .ba-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    #${PANEL_ID} .ba-action.primary{background:#22dc6b;color:#031108;border-color:#22dc6b}
    #${PANEL_ID} .ba-action:disabled{opacity:.45;cursor:not-allowed}
    #${PANEL_ID} .ba-status{margin-left:auto;color:#b9d2c1;font-weight:700}

    .song-row.bulk-selectable{position:relative}
    .song-row.bulk-selected{background:rgba(34,220,107,.11);outline:2px solid rgba(34,220,107,.55);outline-offset:-2px;border-radius:12px}
    .bulk-song-toggle{border:1px solid #2b6946;background:#0b2718;color:#effff4;border-radius:12px;padding:10px 14px;font-weight:850;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .bulk-song-toggle.selected{background:#22dc6b;border-color:#22dc6b;color:#031108}

    @media(max-width:700px){
      #${PANEL_ID} .ba-status{width:100%;margin-left:0}
      .song-row.bulk-selectable{padding:14px 10px!important;display:grid!important;grid-template-columns:1fr!important;gap:10px!important;min-height:0!important}
      .song-row.bulk-selectable .song-index{display:none!important}
      .song-row.bulk-selectable .track-main{grid-column:1!important;width:100%!important}
      .song-row.bulk-selectable .track-main strong{font-size:18px!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;line-height:1.25!important}
      .song-row.bulk-selectable .track-main span{font-size:14px!important;white-space:normal!important}
      .song-row.bulk-selectable .bulk-song-toggle{grid-column:1!important;width:100%!important;min-height:52px!important;font-size:16px!important;margin:0!important}
      .song-row.bulk-selectable select{grid-column:1!important;width:100%!important;min-height:48px!important}
      .song-row.bulk-selected{background:rgba(34,220,107,.14)}
    }
  `;
  document.head.appendChild(style);
}

function toggleSong(panel,row,songId,button){
  const selected=new Set((panel.dataset.selected||'').split(',').filter(Boolean));
  if(selected.has(songId)) selected.delete(songId); else selected.add(songId);
  panel.dataset.selected=[...selected].join(',');
  const isSelected=selected.has(songId);
  row.classList.toggle('bulk-selected',isSelected);
  button.classList.toggle('selected',isSelected);
  button.textContent=isSelected?'✓ Selected':'Select this song';
  button.setAttribute('aria-pressed',isSelected?'true':'false');
  updateStatus(panel,getState());
}

function buildPanel(){
  const songsPanel=document.querySelector('.songs-panel');
  const songTable=document.querySelector('.song-table');
  if(!songsPanel || !songTable) return;

  let panel=document.getElementById(PANEL_ID);
  if(!panel){
    panel=document.createElement('div');
    panel.id=PANEL_ID;
    songTable.parentNode.insertBefore(panel,songTable);
  }

  const state=getState();
  if(!state?.songs?.length || !state?.participants?.length){ panel.remove(); return; }

  const selectedPerson=panel.dataset.person || '';
  const selectedIds=new Set((panel.dataset.selected || '').split(',').filter(Boolean));
  const counts=Object.fromEntries(state.participants.map(p=>[p.id,state.songs.filter(s=>s.ownerId===p.id).length]));

  panel.innerHTML=`
    <div class="ba-title">Quick assign songs</div>
    <div class="ba-help">1. Choose a friend. 2. Tap <b>Select this song</b> on each of their songs. 3. Press <b>Assign selected</b>. Each friend can have up to 10 songs.</div>
    <div class="ba-people"></div>
    <div class="ba-toolbar">
      <button class="ba-action" data-action="unassigned">Select all unassigned</button>
      <button class="ba-action" data-action="clear">Clear selection</button>
      <button class="ba-action primary" data-action="assign">Assign selected</button>
      <span class="ba-status"></span>
    </div>`;

  const people=panel.querySelector('.ba-people');
  state.participants.forEach(p=>{
    const b=document.createElement('button');
    b.className='ba-person'+(p.id===selectedPerson?' active':'');
    b.textContent=`${p.name} · ${counts[p.id]||0}/10`;
    b.onclick=()=>{panel.dataset.person=p.id; panel.dataset.selected=''; render();};
    people.appendChild(b);
  });

  const rows=[...songTable.querySelectorAll('.song-row')];
  rows.forEach((row,i)=>{
    const song=state.songs[i];
    if(!song) return;

    row.querySelector('.bulk-song-check')?.remove();
    row.querySelector('.bulk-song-toggle')?.remove();

    const toggle=document.createElement('button');
    toggle.type='button';
    toggle.className='bulk-song-toggle';
    toggle.setAttribute('aria-label',`Select ${song.name}`);

    const isSelected=selectedIds.has(song.id);
    toggle.classList.toggle('selected',isSelected);
    toggle.textContent=isSelected?'✓ Selected':'Select this song';
    toggle.setAttribute('aria-pressed',isSelected?'true':'false');
    row.classList.toggle('bulk-selected',isSelected);
    row.classList.add('bulk-selectable');

    const trackMain=row.querySelector('.track-main');
    if(trackMain && trackMain.nextSibling){
      row.insertBefore(toggle,trackMain.nextSibling);
    }else{
      row.appendChild(toggle);
    }

    toggle.onclick=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      toggleSong(panel,row,song.id,toggle);
    };
  });

  panel.querySelector('[data-action="clear"]').onclick=()=>{panel.dataset.selected='';render();};
  panel.querySelector('[data-action="unassigned"]').onclick=()=>{
    panel.dataset.selected=state.songs.filter(s=>!s.ownerId).map(s=>s.id).join(','); render();
  };
  panel.querySelector('[data-action="assign"]').onclick=()=>assignSelected(panel,state,rows);
  updateStatus(panel,state);
}

function updateStatus(panel,state){
  if(!state) return;
  const personId=panel.dataset.person || '';
  const selected=(panel.dataset.selected||'').split(',').filter(Boolean);
  const person=state.participants.find(p=>p.id===personId);
  const status=panel.querySelector('.ba-status');
  const assign=panel.querySelector('[data-action="assign"]');
  if(!person){
    status.textContent=`${selected.length} selected · choose a friend`;
    assign.disabled=true;
    return;
  }
  const current=state.songs.filter(s=>s.ownerId===personId).length;
  const selectedNew=selected.filter(id=>state.songs.find(s=>s.id===id)?.ownerId!==personId).length;
  const wouldBe=current+selectedNew;
  status.textContent=`${person.name}: ${current}/10 · ${selected.length} selected`;
  assign.disabled=!selected.length || wouldBe>10;
  if(wouldBe>10) status.textContent+=` · too many (would be ${wouldBe}/10)`;
}

async function assignSelected(panel,state,rows){
  const personId=panel.dataset.person || '';
  const selected=(panel.dataset.selected||'').split(',').filter(Boolean);
  if(!personId || !selected.length) return;

  const current=state.songs.filter(s=>s.ownerId===personId).length;
  const selectedNew=selected.filter(id=>state.songs.find(s=>s.id===id)?.ownerId!==personId).length;
  if(current+selectedNew>10){ alert('That would give this person more than 10 songs.'); return; }

  for(const id of selected){
    const index=state.songs.findIndex(s=>s.id===id);
    const row=rows[index];
    const select=row?.querySelector('select');
    if(!select) continue;
    select.value=personId;
    select.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,70));
  }
  panel.dataset.selected='';
  setTimeout(render,180);
}

function render(){
  injectStyles();
  if(!document.querySelector('.songs-panel')){
    document.getElementById(PANEL_ID)?.remove();
    return;
  }
  buildPanel();
}

const observer=new MutationObserver(()=>{
  clearTimeout(window.__bulkAssignTimer);
  window.__bulkAssignTimer=setTimeout(render,80);
});
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('load',render);
setTimeout(render,300);
