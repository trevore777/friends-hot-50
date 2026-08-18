# Friends Hot 50

A surprise Spotify shuffle countdown companion for a group music night. Spotify plays one master playlist on shuffle; Friends Hot 50 tracks what is playing, records completed songs in countdown order, remembers who nominated each song, and highlights prize positions.

## Current features

- Spotify OAuth using PKCE — no client secret stored in the app
- Spotify 2026 playlist `/items` API with pagination
- One master Spotify playlist owned by the host
- Flexible participant song counts: up to 10 each, no minimum
- Assign each imported song to the friend who nominated it
- Automatic countdown size based on the number of unique songs
- Automatic Spotify shuffle request when the countdown starts
- Live currently-playing display at the correct countdown position
- Completed-song history reconciled from Spotify Recently Played
- History restricted to tracks played after the countdown starts and from the selected master playlist
- Upcoming queue is never requested or displayed
- Adaptive prize positions ending with #3, #2 and #1
- Prize celebration display
- CSV results export
- Local browser persistence
- Responsive phone, tablet and TV-friendly interface

## Spotify setup

1. Create an app in the Spotify Developer Dashboard.
2. Copy the app's Client ID into **Settings** in Friends Hot 50.
3. Add the exact Redirect URI shown in Friends Hot 50 Settings to the Spotify app.
4. Add the Spotify account to the Development Mode user allowlist if required.
5. Connect Spotify, import the host-owned master playlist and assign each song to its nominator.

The app uses PKCE, so no Spotify Client Secret is stored in the browser or repository.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
