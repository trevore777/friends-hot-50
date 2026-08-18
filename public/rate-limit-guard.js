// Spotify rate-limit protection for Friends Hot 50.
// Loaded before the other Spotify guards so every API call shares one backoff policy.
(() => {
  const nativeFetch = window.fetch.bind(window);
  const COOLDOWN_KEY = 'friends-hot-50-spotify-cooldown-until';
  const DIAG_KEY = 'friends-hot-50-sync-diagnostic';
  const cache = new Map();
  const inFlight = new Map();

  function saveDiag(patch) {
    try {
      const old = JSON.parse(localStorage.getItem(DIAG_KEY) || '{}');
      localStorage.setItem(DIAG_KEY, JSON.stringify({...old, ...patch, checkedAt:new Date().toISOString()}));
    } catch {}
  }

  function cloneResponse(response) {
    try { return response.clone(); } catch { return response; }
  }

  function spotifyUrl(input) {
    return typeof input === 'string' ? input : (input?.url || '');
  }

  function ttlFor(url, method) {
    if (method !== 'GET') return 0;
    if (url.includes('/v1/me/player/currently-playing')) return 5500;
    if (/\/v1\/me\/player\/?(?:\?|$)/.test(url)) return 5500;
    if (url.includes('/v1/me/player/recently-played')) return 12000;
    if (url.includes('/v1/me')) return 30000;
    return 0;
  }

  function currentCooldown() {
    const until = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
    return Number.isFinite(until) ? until : 0;
  }

  function setCooldown(seconds, reason='RATE_LIMITED') {
    const safeSeconds = Math.max(2, Number(seconds) || 30);
    const until = Date.now() + safeSeconds * 1000;
    localStorage.setItem(COOLDOWN_KEY, String(until));
    saveDiag({rateLimited:true, rateLimitReason:reason, retryAfterSeconds:safeSeconds, cooldownUntil:new Date(until).toISOString()});
  }

  function synthetic429(until, reason='RATE_LIMITED') {
    const retry = Math.max(1, Math.ceil((until - Date.now()) / 1000));
    return new Response(JSON.stringify({error:{status:429,message:`Spotify is rate limiting requests. Try again in ${retry} seconds.`,reason}}), {
      status:429,
      headers:{'Content-Type':'application/json','Retry-After':String(retry)}
    });
  }

  async function parse429(response) {
    let reason = 'RATE_LIMITED';
    try {
      const body = await response.clone().json();
      reason = body?.error?.reason || reason;
    } catch {}
    const retryHeader = Number(response.headers.get('Retry-After'));
    // Quota exceeded responses do not always include a useful Retry-After. Give the
    // app a longer quiet period instead of immediately retrying and worsening it.
    const retry = Number.isFinite(retryHeader) && retryHeader > 0
      ? retryHeader
      : (reason === 'QUOTA_EXCEEDED' ? 120 : 30);
    setCooldown(retry, reason);
  }

  window.fetch = async function(input, init={}) {
    const url = spotifyUrl(input);
    if (!url.includes('api.spotify.com/v1/')) return nativeFetch(input, init);

    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const ttl = ttlFor(url, method);
    const key = `${method}:${url}`;
    const until = currentCooldown();

    // During Spotify's requested backoff period, do not send more API calls.
    if (Date.now() < until) {
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cloneResponse(cached.response);
      return synthetic429(until);
    }

    if (ttl) {
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return cloneResponse(cached.response);
      if (inFlight.has(key)) {
        const response = await inFlight.get(key);
        return cloneResponse(response);
      }
    }

    const request = (async()=>{
      const response = await nativeFetch(input, init);
      if (response.status === 429) {
        await parse429(response);
        return response;
      }
      if (response.ok) {
        localStorage.removeItem(COOLDOWN_KEY);
        saveDiag({rateLimited:false});
      }
      if (ttl && response.ok) {
        cache.set(key,{response:cloneResponse(response),expiresAt:Date.now()+ttl});
      }
      return response;
    })();

    if (ttl) inFlight.set(key, request);
    try {
      const response = await request;
      return cloneResponse(response);
    } finally {
      if (ttl) inFlight.delete(key);
    }
  };
})();
