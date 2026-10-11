# Spirit Box

Retro-styled web spirit box that hops between online radio streams with configurable static, jitter, and crossfades.

## Run

Serve this folder from any static HTTP server (required for module imports and audio worklet loading).
No install step is required.

Example:

```bash
npx serve .
```

Then open the shown local URL in a browser.

## Station Sources

- Default mode: pulls stations from Radio Browser using failover logic in [radioBrowserApi.mjs](radioBrowserApi.mjs).
- Fallback mode: loads [stations.json](stations.json) if remote fetch fails.
- Force local file mode: add `?source=file` to the URL.

To refresh the fallback file with a larger randomized pool (default target: 1000 tested stations):

```bash
node ./getstations.js
```

`getstations.js` uses only built-in Node APIs (no external npm packages required).

Optional larger scrape:

```bash
node ./getstations.js --pages=10 --limit=1000 --concurrency=12
```

Mirror handling for `getstations.js` is fully dynamic:

- Discovers Radio Browser mirrors via DNS SRV, DNS reverse lookup, and the Radio Browser servers directory.
- Probes discovered mirrors until one works, then uses that mirror first for station batches.
- Stores mirror candidates and last known good mirror in [radio-browser-mirrors.json](radio-browser-mirrors.json) for fallback on later runs.

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

Main runtime knobs are centralized in `APP_CONFIG` in [spirit.config.js](spirit.config.js):

- `radio`: API request policy (limit, timeout, retries, delay)
- `audio`: worklet path, prewarm count, fallback buffer size
- `controls`: initial UI/control values and labels
- `ui.needle.transitions`: fade and ramp durations

## Service Worker

[sw.js](sw.js) uses split strategies:

- Network-first for HTML/JS/CSS so code updates land quickly.
- Network-first for local station data ([stations.json](stations.json)) so updates are picked up on refresh when online.
- Stale-while-revalidate for runtime static assets.
- No caching for live API/stream requests (Radio Browser + audio streams).

## Notes

- Browser autoplay restrictions may require a user interaction before audio starts.
- Public radio stream availability can change at any time.
