# Crux playable ad

A playable ad for **Crux**, a 2D bouldering game for Android. The player climbs a short gym route by dragging hands and feet from hold to hold, manages grip, chalks up and tops out. After the climb an end card leads to the store.

**Play it:** https://i1qxa.github.io/crux-playable/ (open on a phone, or use device mode in desktop Chrome)

## What is inside

- **Real game feel.** The climbing physics is a port of the original Kotlin engine: four limbs with reach limits, hold types that drain grip at different rates (jug, crimp, sloper, pinch), barn-door swing, dynos and chalk.
- **Built for first-time players.** An animated finger shows the next move, a tap on a hold sends the nearest limb to it, feet step up on their own after 2.2 s, and the chalk button pulses when grip is low.
- **Tuned by simulation.** `test/sim.mjs` runs the original autopilot over the route with different paces and a hands-only "novice" model. The route clears in 10-40 s, and slow players sometimes need chalk.
- **Ad network ready.** A single self-contained HTML with no external requests. The MRAID build waits for `ready` and viewability, opens the store through `mraid.open` and respects the host volume. The Meta build calls `FbPlayableAd.onCTAClick()`. Portrait and landscape layouts.
- **Small.** About 880 KB including fonts, 12 sound effects and a 32 s seamless music loop.

## Build

```
python3 build.py
```

Outputs `dist/crux-playable-mraid.html` (AppLovin, Unity Ads, Liftoff) and `dist/crux-playable-meta.html` (Meta), and checks them against the 5 MB and 2 MB limits.

## Tests

```
node test/sim.mjs
node test/cdp.mjs "$PWD/dist/crux-playable-meta.html" 390,844 60
node test/input.mjs "$PWD/dist/crux-playable-mraid.html" 390 844
```

`sim.mjs` checks route balance. `cdp.mjs` runs the autopilot demo in headless Chrome and waits for the top-out. `input.mjs` drives real pointer input: dragging a hand, tapping a hold, the store button through a mocked MRAID, a fall and a retry.

## Layout

- `src/engine.js` - climbing engine and autopilot
- `src/route.js` - the route and difficulty
- `src/assist.js` - automatic foot steps
- `src/game.js` - rendering, HUD, hints, end card, audio, MRAID and Meta hooks
- `src/template.html`, `build.py` - single-file packaging
- `tools/` - music loop cutting

See `CREDITS.md` for the music license.
