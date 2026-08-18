// Spotify compatibility layer for Friends Hot 50.
// Loaded before React so iOS/Spotify playback responses are normalised for the countdown.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const STORAGE_KEY = 'friends-hot-50-state-v1';

  function appState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function isCountdownTrack(id) {
    if (!id) return false;
    return (appState().songs || []).some(song => song.spotifyId === id);
  }

  function playlistContext() {
    const playlistId = appState().playlistId;
    return playlistId ? { type: 'playlist', uri: `spotify:playlist:${playlistId}` } : null;
  }

  function patchedJsonResponse(response, transform) {
    const clone = response.clone();
    return clone.json().then(body => {
      const changed = transform(body) || body;
      return new Response(JSON.stringify(changed), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    }).catch(() => response);
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();

    // Shuffle is optional. Some Spotify/iPhone playback targets reject remote shuffle
    // even though read/playback APIs work normally. Never let that block Start.
    if (url.includes('/v1/me/player/shuffle') && method === 'PUT') {
      try {
        const response = await nativeFetch(input, init);
        if (response.ok) return response;
        console.warn('Spotify shuffle command rejected; continuing with manual shuffle.', response.status);
        return new Response(null, { status: 204 });
      } catch (error) {
        console.warn('Spotify shuffle command unavailable; continuing with manual shuffle.', error);
        return new Response(null, { status: 204 });
      }
    }

    const response = await nativeFetch(input, init);
    if (!response.ok) return response;

    // The app already knows exactly which Spotify track IDs belong to the imported
    // countdown. Membership is therefore safer than relying on context, which can be
    // null/different on Spotify mobile and Spotify Connect.
    if (url.includes('/v1/me/player/currently-playing') && method === 'GET' && response.status !== 204) {
      return patchedJsonResponse(response, body => {
        if (body?.item?.id && isCountdownTrack(body.item.id)) {
          body.context = playlistContext() || body.context;
          // A song may already be playing when Start is pressed. Treat it as the
          // first live countdown song rather than rejecting it as pre-start audio.
          body.progress_ms = 0;
        }
        return body;
      });
    }

    if (url.includes('/v1/me/player/recently-played') && method === 'GET' && response.status !== 204) {
      return patchedJsonResponse(response, body => {
        const context = playlistContext();
        if (context && Array.isArray(body?.items)) {
          body.items.forEach(item => {
            if (isCountdownTrack(item?.track?.id)) item.context = context;
          });
        }
        return body;
      });
    }

    return response;
  };
})();
