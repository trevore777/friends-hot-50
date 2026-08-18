// Friends Hot 50: make remote Spotify shuffle optional.
// Some Spotify/iOS playback sessions reject PUT /me/player/shuffle even though
// currently-playing and recently-played APIs work normally. The countdown must
// continue in that case rather than treating shuffle control as a fatal error.
(() => {
  const originalFetch = window.fetch.bind(window);
  let manualShuffleNeeded = false;

  window.fetch = async (...args) => {
    const request = args[0];
    const url = typeof request === 'string' ? request : request?.url || '';
    const options = args[1] || {};
    const method = String(options.method || request?.method || 'GET').toUpperCase();
    const isShuffleRequest = method === 'PUT' && url.includes('/v1/me/player/shuffle');

    if (!isShuffleRequest) return originalFetch(...args);

    try {
      const response = await originalFetch(...args);
      if (response.ok || response.status === 204) {
        manualShuffleNeeded = false;
        sessionStorage.removeItem('friends-hot-50-manual-shuffle');
        return response;
      }

      // Preserve countdown startup. We only swallow the remote-shuffle failure.
      manualShuffleNeeded = true;
      sessionStorage.setItem('friends-hot-50-manual-shuffle', '1');
      return new Response(null, { status: 204, statusText: 'No Content' });
    } catch (error) {
      manualShuffleNeeded = true;
      sessionStorage.setItem('friends-hot-50-manual-shuffle', '1');
      return new Response(null, { status: 204, statusText: 'No Content' });
    }
  };

  function improveMessage() {
    if (!manualShuffleNeeded && sessionStorage.getItem('friends-hot-50-manual-shuffle') !== '1') return;
    document.querySelectorAll('.toast').forEach(toast => {
      const text = toast.textContent || '';
      if (text.includes('Spotify shuffle is ON') || text.includes('shuffle could not be changed')) {
        toast.classList.remove('error');
        toast.textContent = 'Countdown started. Turn Shuffle ON manually in Spotify; Friends Hot 50 will keep tracking the songs.';
      }
    });
  }

  const observer = new MutationObserver(improveMessage);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  window.addEventListener('load', improveMessage);
})();
