// Spotify compatibility layer for Friends Hot 50.
// Loaded before React so iOS/Spotify playback responses are normalised for the countdown.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const STORAGE_KEY = 'friends-hot-50-state-v1';
  const DIAG_KEY = 'friends-hot-50-sync-diagnostic';

  function appState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }

  function saveDiag(patch) {
    try {
      const old = JSON.parse(localStorage.getItem(DIAG_KEY) || '{}');
      localStorage.setItem(DIAG_KEY, JSON.stringify({...old, ...patch, checkedAt: new Date().toISOString()}));
    } catch {}
  }

  function isCountdownTrack(id) {
    if (!id) return false;
    return (appState().songs || []).some(song => song.spotifyId === id);
  }

  function playlistContext() {
    const playlistId = appState().playlistId;
    return playlistId ? { type: 'playlist', uri: `spotify:playlist:${playlistId}` } : null;
  }

  function responseFromJson(body, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function patchedJsonResponse(response, transform) {
    try {
      const body = await response.clone().json();
      const changed = transform(body) || body;
      return new Response(JSON.stringify(changed), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  }

  function normalisePlayerBody(body) {
    if (body?.item?.id && isCountdownTrack(body.item.id)) {
      body.context = playlistContext() || body.context;
      // Pressing Start while a playlist song is already playing must reveal that song.
      // main.jsx derives the track start from progress_ms, so zero prevents a valid
      // current song being rejected as having started before the countdown button tap.
      body.progress_ms = 0;
      saveDiag({currentTrackId: body.item.id, currentTrackName: body.item.name, matchedPlaylist: true, isPlaying: !!body.is_playing});
    } else {
      saveDiag({currentTrackId: body?.item?.id || null, currentTrackName: body?.item?.name || null, matchedPlaylist: false, isPlaying: !!body?.is_playing});
    }
    return body;
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();

    // Shuffle is optional. Some Spotify/iPhone playback targets reject remote shuffle.
    if (url.includes('/v1/me/player/shuffle') && method === 'PUT') {
      try {
        const response = await nativeFetch(input, init);
        if (response.ok) return response;
        saveDiag({shuffleStatus: response.status});
        return new Response(null, { status: 204 });
      } catch (error) {
        saveDiag({shuffleStatus: 'unavailable'});
        return new Response(null, { status: 204 });
      }
    }

    let response = await nativeFetch(input, init);

    // Spotify mobile/Connect can return 204 from currently-playing while /me/player
    // still contains the active device and track. Fall back to the full player state.
    if (url.includes('/v1/me/player/currently-playing') && method === 'GET') {
      if (response.status === 204) {
        try {
          const playerUrl = url.replace('/currently-playing', '');
          const fallback = await nativeFetch(playerUrl, init);
          if (fallback.ok && fallback.status !== 204) {
            const body = await fallback.clone().json();
            if (body?.item) {
              saveDiag({currentEndpoint: 'player-fallback', currentStatus: fallback.status});
              return responseFromJson(normalisePlayerBody(body));
            }
          }
          saveDiag({currentEndpoint: 'currently-playing', currentStatus: 204, fallbackStatus: fallback.status});
        } catch (error) {
          saveDiag({currentEndpoint: 'currently-playing', currentStatus: 204, fallbackStatus: 'error'});
        }
        return response;
      }
      if (!response.ok) {
        saveDiag({currentEndpoint: 'currently-playing', currentStatus: response.status});
        return response;
      }
      saveDiag({currentEndpoint: 'currently-playing', currentStatus: response.status});
      return patchedJsonResponse(response, normalisePlayerBody);
    }

    if (!response.ok) return response;

    if (url.includes('/v1/me/player/recently-played') && method === 'GET' && response.status !== 204) {
      return patchedJsonResponse(response, body => {
        const context = playlistContext();
        if (context && Array.isArray(body?.items)) {
          body.items.forEach(item => {
            if (isCountdownTrack(item?.track?.id)) item.context = context;
          });
          saveDiag({recentCount: body.items.length, recentMatches: body.items.filter(i => isCountdownTrack(i?.track?.id)).length});
        }
        return body;
      });
    }

    return response;
  };

  // iOS suspends Safari while Spotify is foregrounded. When the page becomes visible
  // again, nudge timers/fetch consumers immediately instead of waiting for the next
  // throttled interval. React's normal polling then performs the actual catch-up.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      saveDiag({resumedAt: new Date().toISOString()});
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    }
  });
})();
