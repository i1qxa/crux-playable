import { readFileSync } from 'node:fs';
const dir = new URL('../src/', import.meta.url);
const src = ['engine.js', 'route.js', 'assist.js', 'race.js'].map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
const G = new Function(src + '\nreturn { Crux, ROUTE, TIDE_ROUTE, KIT, TIDE_KIT, FootAssist, Rival };')();
const { Crux } = G;
const DT = 1 / 60;

function player(prob, kit, pace, seed, handsOnly) {
  const e = new Crux.Engine(prob, kit);
  const s = new Crux.Spotter(e, pace, 0.1, seed);
  const assist = new FootAssist(e, 0.9);
  if (handsOnly) {
    const decide = s.decide.bind(s);
    s.decide = () => {
      const a = decide(false);
      if (a && a.kind === 'move' && Crux.LIMBS[a.limb].hand) return a;
      for (const hand of [Crux.LH, Crux.RH].sort((x, y) => e.limbs[y].y - e.limbs[x].y)) {
        const pick = s.bestHand(hand, e.limbs[hand].hold === null);
        if (pick !== null) return { kind: 'move', limb: hand, hold: pick };
      }
      return null;
    };
  }
  return { e, s, assist };
}
const { FootAssist, Rival } = G;

function tideRun(pace, seed, handsOnly, idle) {
  const p = player(G.TIDE_ROUTE, G.TIDE_KIT, pace, seed, handsOnly);
  p.e.tideRunning = true;
  let minGap = Infinity;
  while (!p.e.over && p.e.time < 120) {
    if (!idle || p.e.time > idle) p.s.update(DT);
    p.assist.update(DT);
    p.e.step(DT);
    if (p.e.phase === 'CLIMB') minGap = Math.min(minGap, p.e.tideGap);
  }
  return { phase: p.e.phase, cause: p.e.cause, time: p.e.time, high: p.e.high, minGap };
}

function raceRun(pace, seed, handsOnly, idle) {
  const p = player(G.ROUTE, G.KIT, pace, seed, handsOnly);
  const r = new Rival(G.ROUTE, seed);
  let maxLead = 0;
  while (!p.e.over && !r.sent && p.e.time < 120) {
    if (!idle || p.e.time > idle) p.s.update(DT);
    p.assist.update(DT);
    p.e.step(DT);
    r.update(DT, p.e);
    maxLead = Math.max(maxLead, r.engine.high - p.e.high);
  }
  return { win: p.e.phase === 'SENT' && !r.sent, time: p.e.time, rival: r.engine.high, maxLead };
}

const runs = 20;
console.log('TIDE');
for (const [label, handsOnly, idle] of [['full', false, 0], ['taps', true, 0], ['taps, 4s idle', true, 4]]) {
  for (const pace of [0.6, 1.0, 1.5, 2.0]) {
    const rs = Array.from({ length: runs }, (_, i) => tideRun(pace, i + 1, handsOnly, idle));
    const saved = rs.filter((r) => r.phase === 'SENT');
    const causes = [...new Set(rs.filter((r) => r.phase !== 'SENT').map((r) => r.cause))].join(',');
    const closest = Math.min(...rs.map((r) => r.minGap)).toFixed(0);
    console.log(`  ${label.padEnd(14)} pace=${pace} saved=${String(saved.length).padStart(2)}/${runs} t=${saved.length ? (saved.reduce((a, r) => a + r.time, 0) / saved.length).toFixed(1) : '-'}s closestGap=${closest} fails=${causes || '-'}`);
  }
}
const idleRun = tideRun(1, 1, true, 999);
console.log(`  idle player: ${idleRun.phase} ${idleRun.cause} after ${idleRun.time.toFixed(1)}s`);

console.log('RACE');
for (const [label, handsOnly] of [['full', false], ['taps', true]]) {
  for (const pace of [0.6, 1.0, 1.5, 2.0]) {
    const rs = Array.from({ length: runs }, (_, i) => raceRun(pace, i + 1, handsOnly, 0));
    const wins = rs.filter((r) => r.win).length;
    console.log(`  ${label.padEnd(14)} pace=${pace} wins=${String(wins).padStart(2)}/${runs} t=${(rs.reduce((a, r) => a + r.time, 0) / runs).toFixed(1)}s maxRivalLead=${(Math.max(...rs.map((r) => r.maxLead)) / 100).toFixed(1)}m`);
  }
}
const lazy = raceRun(1, 1, true, 999);
console.log(`  idle player: win=${lazy.win} after ${lazy.time.toFixed(1)}s`);
