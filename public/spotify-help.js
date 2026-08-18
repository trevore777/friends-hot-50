// Adds Spotify setup guidance to Settings and a playlist workflow guide in the top bar.
(() => {
  const HELP_ID = 'spotify-client-id-help';
  const GUIDE_ID = 'spotify-playlist-guide';

  function injectStyles() {
    if (document.getElementById('spotify-help-styles')) return;
    const style = document.createElement('style');
    style.id = 'spotify-help-styles';
    style.textContent = `
      #${HELP_ID}{margin:14px 0 2px;padding:14px;border:1px solid #294b36;border-radius:14px;background:#08170f;color:#eaffef}
      #${HELP_ID} .sh-title{font-weight:900;font-size:13px;margin-bottom:8px}
      #${HELP_ID} .sh-copy{font-size:12px;line-height:1.55;color:#9fb6a6;margin:0 0 10px}
      #${HELP_ID} ol{margin:8px 0 12px;padding-left:20px;color:#cfe0d4;font-size:12px;line-height:1.55}
      #${HELP_ID} li{margin:5px 0}
      #${HELP_ID} .sh-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
      #${HELP_ID} .sh-link,#${HELP_ID} .sh-copy-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid #2d6343;border-radius:10px;padding:9px 11px;background:#10271a;color:#eaffef;text-decoration:none;font-weight:800;font-size:12px;cursor:pointer}
      #${HELP_ID} .sh-link.primary{background:#1ed760;border-color:#1ed760;color:#041109}
      #${HELP_ID} .sh-uri{display:flex;align-items:center;gap:8px;padding:9px 10px;border:1px solid #284532;border-radius:9px;background:#06110b;margin-top:7px}
      #${HELP_ID} .sh-uri code{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#b9d3c1;font-size:11px}
      #${HELP_ID} .sh-note{font-size:11px;color:#7f9b88;margin-top:9px;line-height:1.45}
      .fh50-guide-btn{border:1px solid #2d6343;border-radius:999px;background:#10271a;color:#eaffef;padding:10px 14px;font-weight:850;font-size:13px;cursor:pointer;white-space:nowrap}
      #${GUIDE_ID}{position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px}
      #${GUIDE_ID} .guide-card{position:relative;width:min(720px,100%);max-height:min(820px,88vh);overflow:auto;background:#08170f;color:#eaffef;border:1px solid #2d6343;border-radius:24px;padding:28px;box-shadow:0 30px 90px rgba(0,0,0,.55)}
      #${GUIDE_ID} .guide-close{position:absolute;right:18px;top:16px;border:0;background:transparent;color:#eaffef;font-size:30px;cursor:pointer}
      #${GUIDE_ID} h2{font-size:28px;margin:0 42px 8px 0} #${GUIDE_ID} h3{font-size:17px;margin:22px 0 8px}
      #${GUIDE_ID} p,#${GUIDE_ID} li{color:#b7cbbd;line-height:1.55} #${GUIDE_ID} ol{padding-left:22px} #${GUIDE_ID} li{margin:9px 0}
      #${GUIDE_ID} .best{border:1px solid #287b4b;background:#0c2918;border-radius:15px;padding:14px 16px;margin:16px 0}
      #${GUIDE_ID} .best strong{color:#55ed8c} #${GUIDE_ID} .tip{font-size:13px;color:#91ad9a}
      #${GUIDE_ID} a{color:#55ed8c;font-weight:800} #${GUIDE_ID} .guide-action{display:inline-flex;margin-top:10px;padding:11px 14px;border-radius:12px;background:#1ed760;color:#041109;text-decoration:none;font-weight:900}
      @media(max-width:700px){.fh50-guide-btn{padding:9px 11px;font-size:0}.fh50-guide-btn:after{content:'Help';font-size:13px}#${GUIDE_ID}{padding:10px}#${GUIDE_ID} .guide-card{padding:24px 20px;border-radius:18px;max-height:90vh}#${GUIDE_ID} h2{font-size:23px}}
      @media(max-width:520px){#${HELP_ID} .sh-actions{display:grid;grid-template-columns:1fr}#${HELP_ID} .sh-link,#${HELP_ID} .sh-copy-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function openGuide(){
    if(document.getElementById(GUIDE_ID)) return;
    injectStyles();
    const overlay=document.createElement('div');
    overlay.id=GUIDE_ID;
    overlay.innerHTML=`<div class="guide-card" role="dialog" aria-modal="true" aria-label="How to set up Spotify">
      <button class="guide-close" type="button" aria-label="Close">×</button>
      <h2>How to set up Spotify</h2>
      <p>Friends Hot 50 works best with <b>one master Spotify playlist</b> containing everybody's nominated songs.</p>
      <div class="best"><strong>Recommended method</strong><br><span class="tip">Ask each friend to make their own small playlist first. Then add those songs to one master playlist in groups. Keeping each person's songs together makes allocation in Friends Hot 50 much faster.</span></div>
      <ol>
        <li><b>Create your master playlist.</b> In Spotify create a new playlist, for example <i>Friends Hot 50</i>. This should be a playlist owned by the Spotify account you connect to this app.</li>
        <li><b>Collect the nominations.</b> Ask each friend to send you a Spotify playlist containing their choices. They can nominate fewer than 10 songs; 10 is only the maximum in this app.</li>
        <li><b>Add one friend's songs at a time.</b> Open their playlist and add/copy their nominated tracks into your master playlist. Do Trevor's group, then Sarah's group, then John's, and so on. Do not shuffle the master playlist while you are building it.</li>
        <li><b>Alternative: use Spotify collaboration.</b> You can use Spotify's <i>Invite collaborators</i> option and let friends add songs directly. For easier allocation, ask each person to add all of their songs together before the next person starts.</li>
        <li><b>Copy the master playlist link.</b> In Spotify open the master playlist → <b>…</b> → <b>Share</b> → <b>Copy link to playlist</b>.</li>
        <li><b>Import it here.</b> Open the <b>Playlist</b> tab in Friends Hot 50, paste the master playlist link and press <b>Import playlist</b>.</li>
        <li><b>Allocate the songs.</b> Open <b>Setup</b>. Choose a friend, select their block of songs and press <b>Assign selected</b>. Repeat for each friend.</li>
        <li><b>Start the countdown.</b> Once every imported song has an owner, press <b>Start</b>. Spotify handles playback/shuffle while Friends Hot 50 tracks the countdown and prize positions.</li>
      </ol>
      <h3>Why group each friend's songs together?</h3>
      <p>It does not affect the final shuffle. It simply makes setup much easier because all of one person's nominations appear together when you allocate them in the app.</p>
      <h3>Collaborative playlist option</h3>
      <p>Spotify allows the playlist owner to invite collaborators who can add, remove and reorder tracks. Spotify's current collaborator invite links are time-limited, so for a one-off Hot 50 the separate-playlist method above is often simpler to organise.</p>
      <a class="guide-action" href="https://support.spotify.com/article/collaborative-playlists/" target="_blank" rel="noopener noreferrer">Spotify collaborative playlist help ↗</a>
    </div>`;
    const close=()=>overlay.remove();
    overlay.querySelector('.guide-close').addEventListener('click',close);
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    document.body.appendChild(overlay);
  }

  function addTopGuideButton(){
    if(document.querySelector('.fh50-guide-btn')) return;
    const actions=document.querySelector('.top-actions');
    if(!actions) return;
    injectStyles();
    const btn=document.createElement('button');
    btn.type='button'; btn.className='fh50-guide-btn'; btn.textContent='How to set up';
    btn.addEventListener('click',openGuide);
    actions.insertBefore(btn,actions.firstChild);
  }

  function addHelp() {
    addTopGuideButton();
    const modal = document.querySelector('.modal');
    if (!modal || document.getElementById(HELP_ID)) return;
    const labels = [...modal.querySelectorAll('label')];
    const clientLabel = labels.find(l => l.textContent.trim() === 'Spotify Client ID');
    if (!clientLabel) return;
    const input = clientLabel.nextElementSibling;
    if (!input) return;
    injectStyles();
    const redirectUri = window.location.origin + '/';
    const help = document.createElement('div');
    help.id = HELP_ID;
    help.innerHTML = `
      <div class="sh-title">Need a Spotify Client ID?</div>
      <p class="sh-copy">Create a free Spotify Developer app, copy its <b>Client ID</b>, then paste it into the field above.</p>
      <ol>
        <li>Open the Spotify Developer Dashboard and sign in with your Spotify account.</li>
        <li>Choose <b>Create app</b>. Give it a name such as <b>Friends Hot 50</b> and select <b>Web API</b>.</li>
        <li>Open the app's <b>Settings</b> and copy the <b>Client ID</b>. Do <b>not</b> paste the Client Secret into Friends Hot 50.</li>
        <li>In <b>Redirect URIs</b>, add the exact address shown below and save the Spotify app settings.</li>
        <li>Return here, paste the Client ID above, press <b>Save</b>, then <b>Connect Spotify</b>.</li>
      </ol>
      <div class="sh-actions">
        <a class="sh-link primary" href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener noreferrer">Open Spotify Developer Dashboard ↗</a>
        <a class="sh-link" href="https://developer.spotify.com/documentation/web-api/concepts/apps" target="_blank" rel="noopener noreferrer">Spotify setup guide ↗</a>
      </div>
      <div class="sh-copy">Redirect URI to add in Spotify:</div>
      <div class="sh-uri"><code>${redirectUri}</code><button type="button" class="sh-copy-btn">Copy</button></div>
      <div class="sh-note">Spotify requires the Redirect URI to match exactly. For this browser-based app we use Spotify's PKCE login flow, so Friends Hot 50 only needs your Client ID — not your Client Secret.</div>
    `;
    help.querySelector('.sh-copy-btn').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(redirectUri); const btn=help.querySelector('.sh-copy-btn'); const old=btn.textContent; btn.textContent='Copied ✓'; setTimeout(()=>{btn.textContent=old;},1400); } catch {}
    });
    input.insertAdjacentElement('afterend', help);
  }

  const observer = new MutationObserver(() => setTimeout(addHelp, 20));
  observer.observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('load', addHelp);
  setTimeout(addHelp, 250);
})();
