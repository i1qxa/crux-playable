# Crux playable ad

A playable ad for **Crux**, a 2D bouldering game for Android, in two A/B variants built from one codebase.

- **Tide Rescue** - https://i1qxa.github.io/crux-playable/ - the climber is slipping off a sea cliff and the tide is coming in. Tap holds to climb before the water reaches you.
- **Race** - https://i1qxa.github.io/crux-playable/race.html - beat Max, a ghost rival, to the top of a gym wall.

Open on a phone, or use device mode in desktop Chrome. Add `#demo` to the URL to watch the autopilot play.

## What is inside

- **Real game feel.** The climbing physics is a port of the original Kotlin engine: four limbs with reach limits, hold types that drain grip at different rates (jug, crimp, sloper, pinch), barn-door swing, dynos and chalk.
- **Crisis hook in the first seconds.** Tide Rescue opens on a one-handed hang over rising water with a shaking "HE'S SLIPPING!" headline. Race opens with "BEAT MAX TO THE TOP!" and a GO.
- **One action.** Tap a hold and the right hand reaches for it. Feet step up on their own, so a first-time player only ever taps. Dragging limbs, chalk and dynos stay in for players who discover them.
- **Rubber-banded tension.** The tide speeds up when the player is far ahead and almost stops near their feet, so the water nearly catches most players without drowning them. Max slows down when ahead and sprints when behind, then eases off near the top.
- **Fast rewards.** Combo popups (NICE, GREAT, ON FIRE), meter milestones, "CLOSE ONE!" after a near miss, a bonus hold with screen shake, a progress rail with the rival marker, and confetti on the top-out.
- **CTA where emotion peaks.** A store chip slides in after the bonus hold, and the end card leads with the store button after a win or a second fall, with a locked "next crag" teaser.
- **Tuned by simulation.** `test/sim.mjs` plays both variants with the original autopilot at different paces and a tap-only novice model. Tide: almost every active player is saved, with the water within 30-45 cm at its closest, and an idle player is washed off in about 20 s. Race: active players win 75-100% of races, Max leads by up to 2 m on the way, and an idle player loses in about 30 s.
- **Ad network ready.** A single self-contained HTML with no external requests. The MRAID build waits for `ready` and viewability, opens the store through `mraid.open` and respects the host volume. The Meta build calls `FbPlayableAd.onCTAClick()`. Portrait and landscape layouts.
- **Small.** About 980 KB per file including fonts, the app icon, 13 sound effects and a 32 s seamless music loop.

## Build

```
python3 build.py
```

Outputs `dist/crux-{tide,race}-mraid.html` (AppLovin, Unity Ads, Liftoff) and `dist/crux-{tide,race}-meta.html` (Meta), and checks them against the 5 MB and 2 MB limits. Images dropped into `assets/art/` (`hero`, `fail`, or per variant `hero_tide`, `fail_race` and so on) are embedded and shown on the end card.

## Tests

```
node test/sim.mjs
node test/cdp.mjs "$PWD/dist/crux-tide-meta.html" 390,844 60
node test/cdp.mjs "$PWD/dist/crux-race-meta.html" 390,844 70 ""
node test/input.mjs "$PWD/dist/crux-race-mraid.html" 390 844
```

`sim.mjs` checks balance for both variants. `cdp.mjs` runs the autopilot demo in headless Chrome and waits for the win, or with an empty hash waits for an idle player to lose. `input.mjs` drives real pointer input: dragging a hand, tapping a hold, the store button through a mocked MRAID, a fall and a retry.

## Layout

- `src/engine.js` - climbing engine and autopilot
- `src/route.js` - the route, tide and rival tuning
- `src/assist.js` - automatic foot steps
- `src/race.js` - the rubber-banded rival
- `src/game.js` - rendering, HUD, hints, end card, audio, MRAID and Meta hooks
- `src/template.html`, `build.py` - single-file packaging
- `tools/` - music loop cutting

See `CREDITS.md` for the music license.
