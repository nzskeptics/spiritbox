# Spirit Box

Retro-styled web spirit box that hops between online radio streams with configurable static, jitter, and crossfades.

## Run

Serve this folder from any static HTTP server (required for module imports and audio worklet loading).

Example:

```bash
npx serve .
```

Then open the shown local URL in a browser.

## Station Sources

- Default mode: pulls stations from Radio Browser using failover logic in [radioBrowserApi.mjs](radioBrowserApi.mjs).
- Fallback mode: loads [stations.json](stations.json) if remote fetch fails.
- Force local file mode: add `?source=file` to the URL.

## Controls

- `Play/Stop`: starts or halts tuning and static.
- `Volume`: output level for station/static mix.
- `Stations`: number of active stations from the loaded list.
- `Hop`: base retune interval in milliseconds.
- `Static`: chance that a retune lands between stations.
- `Jitter`: random variation added to hop timing.

## Audio Behavior

- Crossfades between station-to-station and station-to-static transitions.
- Optional static engine warm state to reduce startup clicks.
- Prewarmed stream pool (limited count) to reduce audible gaps while keeping bandwidth in check.
- Static generator prefers AudioWorklet ([noise-worklet.js](noise-worklet.js)) and falls back to ScriptProcessor when unavailable.

## Config

Main runtime knobs are centralized in `APP_CONFIG` near the top of [spirit.js](spirit.js):

- `radio`: API request policy (limit, timeout, retries, delay)
- `audio`: worklet path, prewarm count, fallback buffer size
- `defaults`: initial UI/control values
- `ui.transitions`: fade and ramp durations

## Service Worker

[sw.js](sw.js) uses split strategies:

- Network-first for HTML/JS/CSS so code updates land quickly.
- Stale-while-revalidate for runtime static assets.
- No caching for live API/stream requests (Radio Browser + audio streams).

## Notes

- Browser autoplay restrictions may require a user interaction before audio starts.
- Public radio stream availability can change at any time.
