class Rival {
  constructor(prob, seed) {
    this.prob = prob;
    this.seed = seed;
    this.restarts = 0;
    this.reset();
  }

  reset() {
    this.engine = new Crux.Engine(this.prob, { pump: 1 });
    this.spotter = new Crux.Spotter(this.engine, RIVAL.base, 0.05, this.seed + this.restarts * 31);
    this.fellAt = 0;
  }

  progress(engine) {
    const span = engine.problem.ground - engine.problem.holds[engine.problem.top].y;
    return Math.max(0, Math.min(1, engine.high / span));
  }

  pace(player) {
    const lead = this.engine.high - player.high;
    const mine = this.progress(this.engine);
    if (lead > 260) return RIVAL.base;
    if (mine > 0.82 && lead > -40) return RIVAL.finish;
    if (lead > 110) return RIVAL.ahead;
    if (lead < -90) return RIVAL.behind;
    return RIVAL.base;
  }

  update(dt, player) {
    const e = this.engine;
    if (e.phase === 'FELL') {
      this.fellAt += dt;
      if (this.fellAt > 0.8) {
        this.restarts++;
        this.reset();
      }
      return;
    }
    this.spotter.pace = this.pace(player);
    this.spotter.update(dt);
    e.step(dt);
    e.drainCues();
  }

  get sent() { return this.engine.phase === 'SENT'; }
}
