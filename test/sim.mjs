import { readFileSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const src = ['engine.js', 'route.js', 'assist.js'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const { Crux, ROUTE, KIT, FootAssist } = new Function(src + '\nreturn { Crux, ROUTE, KIT, FootAssist };')();
const kits = { game: KIT, hard: { pump: 1.3 } };

function run(kit, pace, slop, seed, handsOnly, chalk, assistDelay) {
  const e = new Crux.Engine(ROUTE, kit);
  const assist = assistDelay ? new FootAssist(e, assistDelay) : null;
  const s = new Crux.Spotter(e, pace, slop, seed);
  if (handsOnly) {
    const decide = s.decide.bind(s);
    s.decide = () => {
      const a = decide(chalk);
      if (a && a.kind === 'move' && !Crux.LIMBS[a.limb].hand) {
        for (const hand of [Crux.LH, Crux.RH].sort((x, y) => e.limbs[y].y - e.limbs[x].y)) {
          const pick = s.bestHand(hand, false);
          if (pick !== null) return { kind: 'move', limb: hand, hold: pick };
        }
        return null;
      }
      if (a && a.kind === 'dyno') return null;
      return a;
    };
  }
  while (!e.over && e.time < 120) { s.update(1 / 60); if (assist) assist.update(1 / 60); e.step(1 / 60); }
  if (!e.over) e.letGo();
  return e;
}

for (const assistDelay of [2.2]) for (const [name, kit] of Object.entries(kits)) {
  for (const mode of ['full', 'hands', 'hands+chalk']) {
    for (const pace of [0.6, 1.0, 1.5, 2.0]) {
      let sent = 0, time = 0, hs = [];
      const runs = 20;
      for (let seed = 1; seed <= runs; seed++) {
        const e = run(kit, pace, 0.1, seed, mode !== 'full', mode === 'hands+chalk', assistDelay);
        if (e.phase === 'SENT') { sent++; time += e.time; }
        hs.push(e.high / 100);
      }
      const avgH = (hs.reduce((a, b) => a + b, 0) / hs.length).toFixed(1);
      console.log(`assist=${assistDelay} ${name.padEnd(8)} ${mode.padEnd(11)} pace=${pace} sent=${String(sent).padStart(2)}/${runs} t=${sent ? (time / sent).toFixed(1) : '-'}s avgHigh=${avgH}m`);
    }
  }
}
