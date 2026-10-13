class FootAssist {
  constructor(engine, delay) {
    this.e = engine;
    this.delay = delay;
    this.timer = 0;
    this.spotter = new Crux.Spotter(engine);
    this.moves = 0;
  }

  pending() {
    const e = this.e;
    const s = this.spotter;
    if (e.unbalanced) {
      const fix = s.fixBalance();
      if (fix) return fix;
    }
    for (const foot of [Crux.LF, Crux.RF]) {
      if (e.limbs[foot].hold !== null) continue;
      const pick = s.bestFoot(foot, Infinity);
      if (pick !== null) return { kind: 'move', limb: foot, hold: pick };
    }
    const low = e.limbs[Crux.LF].y >= e.limbs[Crux.RF].y ? e.limbs[Crux.LF] : e.limbs[Crux.RF];
    if (low.y - e.body.py > 72) {
      const pick = s.bestFoot(low.limb.id, low.y - 15);
      if (pick !== null) return { kind: 'move', limb: low.limb.id, hold: pick };
    }
    if (s.bestHand(Crux.LH, false) !== null || s.bestHand(Crux.RH, false) !== null) return null;
    for (const foot of [e.limbs[Crux.LF], e.limbs[Crux.RF]].sort((a, b) => b.y - a.y)) {
      const pick = s.bestFoot(foot.limb.id, foot.y - 15);
      if (pick !== null) return { kind: 'move', limb: foot.limb.id, hold: pick };
    }
    return null;
  }

  update(dt) {
    const e = this.e;
    if (e.phase !== 'CLIMB' || e.drag || e.aim) {
      this.timer = 0;
      return null;
    }
    const action = this.pending();
    if (!action) {
      this.timer = 0;
      return null;
    }
    this.timer += dt;
    if (this.timer < this.delay) return null;
    this.timer = 0;
    this.moves++;
    this.spotter.perform(action);
    return action;
  }
}
