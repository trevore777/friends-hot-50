// Adds Spotify developer setup guidance to the Settings modal.
(() => {
  const HELP_ID = 'spotify-client-id-help';

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
      @media(max-width:520px){#${HELP_ID} .sh-actions{display:grid;grid-template-columns:1fr}#${HELP_ID} .sh-link,#${HELP_ID} .sh-copy-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function addHelp() {
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
      try {
        await navigator.clipboard.writeText(redirectUri);
        const btn = help.querySelector('.sh-copy-btn');
        const old = btn.textContent;
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = old; }, 1400);
      } catch {}
    });

    input.insertAdjacentElement('afterend', help);
  }

  const observer = new MutationObserver(() => setTimeout(addHelp, 20));
  observer.observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('load', addHelp);
  setTimeout(addHelp, 250);
})();
