const Crux = (() => {
  const KINDS = {
    JUG: { label: 'Jug', drain: 0.035, foot: 1 },
    CRIMP: { label: 'Crimp', drain: 0.15, foot: 1 },
    SLOPER: { label: 'Sloper', drain: 0.12, foot: 0.65 },
    PINCH: { label: 'Pinch', drain: 0.085, foot: 0.9 }
  };

  const LIMBS = [
    { id: 0, hand: true, side: -1 },
    { id: 1, hand: true, side: 1 },
    { id: 2, hand: false, side: -1 },
    { id: 3, hand: false, side: 1 }
  ];
  const LH = 0, RH = 1, LF = 2, RF = 3;

  const K = {
    STEP: 1 / 120,
    HAND_REACH: 118,
    FOOT_REACH: 100,
    REACH_SLACK: 14,
    UPPER_ARM: 59,
    FOREARM: 59,
    THIGH: 50,
    SHIN: 50,
    TORSO_LEN: 58,
    SHOULDER_HALF: 14,
    HIP_HALF: 11,
    ARM_DROP: 34,
    DYNO_CHARGE_MAX: 84,
    LIMB_PICK_RADIUS: 34,
    TORSO_PICK_RADIUS: 38,
    GRAB_RADIUS: 34,
    DYNO_POWER: 480,
    DYNO_GRAVITY: 900,
    DYNO_REACH: 70,
    TORSO_LEAN: 0.55,
    ONE_ARM_SAG: 10,
    LEG_RISE: 54,
    BODY_LERP: 0.2,
    DRAG_LEAN: 26,
    JUG_REST: 0.05,
    SLOPER_HIPS_IN: 0.45,
    SLOPER_HIPS_TOL: 34,
    ONE_HAND_MULT: 1.65,
    FEET_RELIEF: 0.42,
    ONE_FOOT_RELIEF: 0.78,
    FOOT_UNDER_TOL: 52,
    BALANCE_TOL: 30,
    BARNDOOR_DRAIN: 0.4,
    BARNDOOR_SWING: 40,
    SWING_LERP: 0.09,
    CHALK_GAIN: 0.42,
    SHAKE_RECOVER: 0.16,
    DYNO_GRAB: 50,
    DYNO_DROP: 170,
    DYNO_COST: 0.12,
    CAM_ANCHOR: 0.58,
    CAM_LERP: 0.11,
    FALL_ACCEL: 1500,
    HAND_SLACK: 18,
    FOOT_SLACK: 22,
    STRETCH_TIME: 0.25,
    FOOT_HIGH_STEP: 30
  };

  const COACH = {
    START: 'Both hands on. Move a foot up first.',
    SWINGING: 'You are swinging out. Bring a hip back in.',
    PUMPED: 'Pumped. Move now, or chalk up.',
    RESTING: 'Good feet. Your hands are resting.',
    FOOT_OFF: 'Foot came off. Bring it up under you.',
    HAND_OPEN: 'That hand opened. Get it back on something.',
    CHALKED: 'Chalked. Keep moving while it lasts.',
    BAG_EMPTY: 'Bag is empty. Rest on a jug instead.',
    AIRBORNE: 'In the air.',
    CAUGHT: 'Caught it. Feet on before you pull.',
    NEED_FOOT: 'Get a foot on before you jump.',
    MATCH: 'Match the top. Both hands.',
    CLIMBING: 'Steady. Read the next hold before you go.'
  };

  const FALL_LINES = {
    LEFT_HAND: 'Left hand opened',
    RIGHT_HAND: 'Right hand opened',
    LET_GO: 'Let go',
    MISSED_DYNO: 'Missed the jump',
    TIDE: 'Washed off'
  };

  const hypot = Math.hypot;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ease = (rate, dt) => 1 - Math.pow(1 - rate, dt * 60);

  function problem(spec) {
    const holds = spec.holds.map(([x, y, kind]) => ({ x, y, kind }));
    const ground = spec.ground || 1560;
    const top = spec.top;
    return {
      name: spec.name,
      grade: spec.grade,
      tape: spec.tape,
      holds,
      start: spec.start,
      bonus: spec.bonus,
      top,
      ground,
      wallTop: holds[top].y - 70,
      heightOf: (y) => (ground - y) / 100
    };
  }

  class Engine {
    constructor(prob, kit, viewHeight) {
      this.problem = prob;
      this.kit = Object.assign({ chalkUses: 3, pump: 1, relief: K.FEET_RELIEF }, kit || {});
      this.viewHeight = viewHeight || 560;
      this.holds = prob.holds;
      this.limbs = LIMBS.map((l) => ({ limb: l, hold: null, x: 0, y: 0, grip: 1, stretch: 0, pumpWarned: false }));
      this.body = { sx: 0, sy: 0, px: 0, py: 0, swing: 0 };
      this.phase = 'CLIMB';
      this.time = 0;
      this.chalk = this.kit.chalkUses;
      this.chalkUsed = 0;
      this.bonus = false;
      this.camera = 0;
      this.unbalanced = false;
      this.coach = COACH.START;
      this.cause = null;
      this.failX = 0;
      this.failY = 0;
      this.drag = null;
      this.aim = null;
      this.line = [];
      this.cues = [];
      this.coachHold = 0;
      this.velX = 0;
      this.velY = 0;
      this.dynoFrom = 0;
      this.launchHolds = new Set();
      this.wasUnbalanced = false;
      this.dynoCatches = 0;
      this.tide = this.kit.tide || null;
      this.tideY = this.tide ? this.tide.start : Infinity;
      this.tideRunning = false;
      this.tideGap = Infinity;
      prob.start.forEach((h, i) => {
        if (h !== null) this.place(i, h);
      });
      const t = this.targetPose();
      this.body.sx = t[0];
      this.body.sy = t[1];
      this.body.px = t[2];
      this.body.py = t[3];
      for (const s of this.limbs) {
        if (s.hold !== null) continue;
        const a = this.anchor(s.limb.id);
        s.x = a[0] + s.limb.side * (s.limb.hand ? 8 : 5);
        s.y = a[1] + (s.limb.hand ? 72 : 86);
      }
      for (const h of [prob.start[0], prob.start[1]]) if (h !== null) this.line.push(h);
      this.camera = this.clampCamera(this.body.py - this.viewHeight * K.CAM_ANCHOR);
      this.high = prob.ground - this.body.py;
    }

    get over() { return this.phase === 'SENT' || this.phase === 'FELL'; }
    get headX() { return this.body.sx + (this.body.sx - this.body.px) * 0.14; }
    get headY() { return this.body.sy - 21; }

    setViewHeight(h) {
      this.viewHeight = h;
      this.camera = this.clampCamera(this.camera);
    }

    reachOf(limb) { return LIMBS[limb].hand ? K.HAND_REACH : K.FOOT_REACH; }

    drainCues() {
      const out = this.cues;
      this.cues = [];
      return out;
    }

    anchor(limb) {
      const b = this.body;
      return this.anchorAt(limb, b.sx, b.sy, b.px, b.py);
    }

    cogX() { return (this.body.sx + this.body.px) / 2 + this.body.swing * 0.5; }
    cogY() { return (this.body.sy + this.body.py) / 2 + 6; }

    heldBy(index) { return this.limbs.some((s) => s.hold === index); }

    isSubmerged(index) { return this.holds[index].y > this.tideY - 4; }

    canGrab(limb, index) {
      if (this.isSubmerged(index)) return false;
      const hold = this.holds[index];
      const hand = LIMBS[limb].hand;
      if (!hand && hold.y < this.body.py - K.FOOT_HIGH_STEP) return false;
      return !this.limbs.some((o) =>
        o.limb.id !== limb && o.hold === index &&
        !(hand && o.limb.hand && (hold.kind === 'JUG' || index === this.problem.top))
      );
    }

    inReach(limb, index, margin = 0) {
      const a = this.anchor(limb);
      const h = this.holds[index];
      return hypot(h.x - a[0], h.y - a[1]) <= this.reachOf(limb) + K.REACH_SLACK - margin;
    }

    reachableHolds(limb, margin = 0) {
      const out = [];
      for (let i = 0; i < this.holds.length; i++) if (this.canGrab(limb, i) && this.inReach(limb, i, margin)) out.push(i);
      return out;
    }

    pickLimb(x, y) {
      let pick = -1;
      let best = K.LIMB_PICK_RADIUS;
      for (const s of this.limbs) {
        const d = hypot(s.x - x, s.y - y);
        if (d < best) {
          best = d;
          pick = s.limb.id;
        }
      }
      return pick;
    }

    press(x, y) {
      if (this.phase !== 'CLIMB') return false;
      const pick = this.pickLimb(x, y);
      if (pick >= 0) {
        this.pressLimb(pick);
        return true;
      }
      if (hypot(this.body.px - x, this.body.py - y) < K.TORSO_PICK_RADIUS && this.heldHands().length) {
        this.aim = { x0: x, y0: y, x, y };
        return true;
      }
      return false;
    }

    pressLimb(limb) {
      if (this.phase !== 'CLIMB' || this.drag) return;
      const s = this.limbs[limb];
      this.drag = { limb, fromX: s.x, fromY: s.y, fromHold: s.hold };
      s.hold = null;
      s.stretch = 0;
    }

    pressBody() {
      if (this.phase !== 'CLIMB' || !this.heldHands().length) return;
      this.aim = { x0: this.body.px, y0: this.body.py, x: this.body.px, y: this.body.py };
    }

    move(x, y) {
      const d = this.drag;
      if (d) {
        const s = this.limbs[d.limb];
        const a = this.anchor(d.limb);
        const r = this.reachOf(d.limb);
        let dx = x - a[0];
        let dy = y - a[1];
        const dist = hypot(dx, dy);
        if (dist > r) {
          dx = dx / dist * r;
          dy = dy / dist * r;
        }
        s.x = a[0] + dx;
        s.y = a[1] + dy;
        return;
      }
      if (this.aim) {
        this.aim.x = x;
        this.aim.y = y;
      }
    }

    release() {
      const d = this.drag;
      if (d) {
        this.drag = null;
        if (this.phase !== 'CLIMB') return;
        const s = this.limbs[d.limb];
        const a = this.anchor(d.limb);
        const r = this.reachOf(d.limb);
        let best = -1;
        let bestDistance = K.GRAB_RADIUS;
        for (let i = 0; i < this.holds.length; i++) {
          if (!this.canGrab(d.limb, i)) continue;
          const h = this.holds[i];
          const dist = hypot(h.x - s.x, h.y - s.y);
          if (dist < bestDistance && hypot(h.x - a[0], h.y - a[1]) <= r + K.REACH_SLACK) {
            bestDistance = dist;
            best = i;
          }
        }
        if (best >= 0) {
          this.grabWith(d.limb, best);
        } else if (d.fromHold !== null && this.canGrab(d.limb, d.fromHold)) {
          s.hold = d.fromHold;
          s.x = this.holds[d.fromHold].x;
          s.y = this.holds[d.fromHold].y;
        } else {
          s.x = d.fromX;
          s.y = d.fromY;
        }
        return;
      }
      const shot = this.aim;
      if (!shot) return;
      this.aim = null;
      if (this.phase !== 'CLIMB') return;
      const dx = shot.x0 - shot.x;
      const dy = shot.y0 - shot.y;
      const dist = hypot(dx, dy);
      if (dist <= 18) return;
      if (!this.heldFeet().length) {
        this.say(COACH.NEED_FOOT);
        return;
      }
      const power = Math.min(dist, K.DYNO_CHARGE_MAX) / K.DYNO_CHARGE_MAX;
      this.velX = dx / dist * power * K.DYNO_POWER * 0.5;
      this.velY = dy / dist * power * K.DYNO_POWER;
      this.launchHolds.clear();
      for (const s of this.limbs) {
        if (s.hold !== null) this.launchHolds.add(s.hold);
        s.hold = null;
        s.stretch = 0;
      }
      this.dynoFrom = this.body.py;
      this.phase = 'DYNO';
      this.say(COACH.AIRBORNE);
      this.cues.push('LAUNCH');
    }

    chalkUp() {
      if (this.phase !== 'CLIMB') return;
      if (this.chalk <= 0) {
        this.say(COACH.BAG_EMPTY);
        this.cues.push('EMPTY_BAG');
        return;
      }
      this.chalk--;
      this.chalkUsed++;
      for (const h of this.hands()) {
        h.grip = Math.min(1, h.grip + K.CHALK_GAIN);
        if (h.grip > 0.4) h.pumpWarned = false;
      }
      this.say(COACH.CHALKED);
      this.cues.push('CHALK');
    }

    letGo() {
      if (this.phase !== 'CLIMB') return;
      this.cause = 'LET_GO';
      this.startFall();
    }

    step(dt) {
      let left = Math.min(dt, 0.1);
      while (left > 0) {
        const slice = Math.min(left, K.STEP);
        this.advance(slice);
        left -= slice;
      }
    }

    advance(dt) {
      this.time += dt;
      if (this.coachHold > 0) this.coachHold -= dt;
      if (this.phase === 'CLIMB') {
        this.updateTide(dt);
        if (this.phase === 'CLIMB') this.updateBody(dt);
        if (this.phase === 'CLIMB') this.updateGrip(dt);
      } else if (this.phase === 'DYNO') {
        this.updateDyno(dt);
      } else if (this.phase === 'FALL') {
        this.updateFall(dt);
      }
      if (this.phase === 'CLIMB' || this.phase === 'DYNO') this.high = Math.max(this.high, this.problem.ground - this.body.py);
      const target = this.clampCamera(this.body.py - this.viewHeight * K.CAM_ANCHOR);
      this.camera += (target - this.camera) * ease(K.CAM_LERP, dt);
    }

    updateTide(dt) {
      const tide = this.tide;
      if (!tide) return;
      this.tideGap = this.tideY - this.body.py;
      if (!this.tideRunning) return;
      const scale = clamp((this.tideGap - tide.near) / (tide.cruise - tide.near), tide.min, tide.max);
      this.tideY -= tide.rate * scale * dt;
      for (const s of this.limbs) {
        if (s.hold === null || !this.isSubmerged(s.hold)) continue;
        s.hold = null;
        this.cues.push(s.limb.hand ? 'SLIP' : 'FOOT_OFF');
        this.cues.push('TIDE');
      }
      if (this.body.py > this.tideY + 6) {
        this.cause = 'TIDE';
        this.startFall();
      }
    }

    clampCamera(v) {
      const lo = this.problem.wallTop - 60;
      const hi = this.problem.ground - this.viewHeight + 40;
      return lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi);
    }

    updateBody(dt) {
      const target = this.targetPose();
      const contacts = this.limbs.filter((s) => s.hold !== null && !(this.drag && this.drag.limb === s.limb.id));
      let swingTarget = 0;
      if (contacts.length) {
        let minX = Infinity, maxX = -Infinity;
        for (const s of contacts) {
          minX = Math.min(minX, s.x);
          maxX = Math.max(maxX, s.x);
        }
        const c = this.cogX();
        if (c < minX - K.BALANCE_TOL) swingTarget = -K.BARNDOOR_SWING;
        else if (c > maxX + K.BALANCE_TOL) swingTarget = K.BARNDOOR_SWING;
      }
      this.unbalanced = swingTarget !== 0;
      if (this.unbalanced && !this.wasUnbalanced) this.cues.push('SWING');
      this.wasUnbalanced = this.unbalanced;
      const k = ease(K.BODY_LERP, dt);
      const b = this.body;
      b.swing += (swingTarget - b.swing) * ease(K.SWING_LERP, dt);
      b.sx += (target[0] + b.swing * 0.4 - b.sx) * k;
      b.sy += (target[1] - b.sy) * k;
      b.px += (target[2] + b.swing - b.px) * k;
      b.py += (target[3] - b.py) * k;

      for (const s of this.limbs) {
        if (this.drag && this.drag.limb === s.limb.id) continue;
        const a = this.anchor(s.limb.id);
        if (s.hold !== null) {
          const d = hypot(s.x - a[0], s.y - a[1]);
          const limit = this.reachOf(s.limb.id) + (s.limb.hand ? K.HAND_SLACK : K.FOOT_SLACK);
          if (d > limit) {
            if (!this.drag) s.stretch += dt;
            if (s.stretch > K.STRETCH_TIME) {
              s.hold = null;
              s.stretch = 0;
              if (s.limb.hand) {
                this.cues.push('SLIP');
                this.say(COACH.HAND_OPEN);
              } else {
                this.cues.push('FOOT_OFF');
                this.say(COACH.FOOT_OFF);
              }
            }
          } else {
            s.stretch = 0;
          }
        } else {
          this.relax(s, a, dt);
        }
      }
    }

    relax(s, a, dt) {
      const tx = a[0] + s.limb.side * (s.limb.hand ? 8 : 5);
      const ty = a[1] + (s.limb.hand ? 72 : 86);
      const k = ease(0.15, dt);
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
    }

    updateGrip(dt) {
      const hands = this.hands();
      const feetOn = this.heldFeet();
      const cx = this.cogX();
      const cy = this.cogY();
      const feetUnder = feetOn.length === 2 &&
        Math.abs((feetOn[0].x + feetOn[1].x) / 2 - cx) < K.FOOT_UNDER_TOL &&
        feetOn.every((f) => f.y > cy);
      const quality = feetOn.length ? feetOn.reduce((acc, f) => acc + KINDS[this.holds[f.hold].kind].foot, 0) / feetOn.length : 0;
      const relief = this.kit.relief;

      for (let i = 0; i < 2; i++) {
        const hand = hands[i];
        const other = hands[1 - i];
        const index = hand.hold;
        if (index !== null) {
          const hold = this.holds[index];
          if (hold.kind === 'JUG' && feetUnder && !this.unbalanced) {
            hand.grip = Math.min(1, hand.grip + K.JUG_REST * quality * dt);
            if (hand.grip > 0.4) hand.pumpWarned = false;
            continue;
          }
          let rate = KINDS[hold.kind].drain;
          if (hold.kind === 'SLOPER' && Math.abs(cx - hold.x) < K.SLOPER_HIPS_TOL) rate *= K.SLOPER_HIPS_IN;
          if (other.hold === null) rate *= K.ONE_HAND_MULT;
          if (feetUnder) rate *= lerp(1, relief, quality);
          else if (feetOn.length) rate *= lerp(1, K.ONE_FOOT_RELIEF, quality);
          if (this.unbalanced) rate += K.BARNDOOR_DRAIN;
          hand.grip -= rate * this.kit.pump * dt;
          if (hand.grip < 0.25 && !hand.pumpWarned) {
            hand.pumpWarned = true;
            this.cues.push('PUMP');
          }
          if (hand.grip <= 0) {
            hand.grip = 0;
            hand.hold = null;
            this.failX = hold.x;
            this.failY = hold.y;
            this.cause = hand.limb.id === LH ? 'LEFT_HAND' : 'RIGHT_HAND';
            this.cues.push('SLIP');
            this.say(COACH.HAND_OPEN);
          }
        } else if (!(this.drag && this.drag.limb === hand.limb.id)) {
          const oh = other.hold;
          let recover = 0;
          if (oh !== null && this.holds[oh].kind === 'JUG') recover = K.SHAKE_RECOVER;
          else if (oh !== null && feetUnder) recover = K.SHAKE_RECOVER * 0.4;
          hand.grip = Math.min(1, hand.grip + recover * dt);
          if (hand.grip > 0.4) hand.pumpWarned = false;
        }
      }

      for (const hand of hands) {
        if (hand.hold === this.problem.bonus && !this.bonus) {
          this.bonus = true;
          this.cues.push('BONUS');
        }
      }
      const lh = this.limbs[LH].hold;
      const rh = this.limbs[RH].hold;
      if (lh === this.problem.top && rh === this.problem.top) {
        this.phase = 'SENT';
        this.drag = null;
        this.aim = null;
        this.cues.push('SENT');
        return;
      }
      if (!this.heldHands().length) {
        const d = this.drag;
        if (!d || !LIMBS[d.limb].hand || !this.heldFeet().length) {
          if (this.cause === null) this.cause = 'LET_GO';
          this.startFall();
          return;
        }
      }
      if (this.coachHold <= 0) {
        let next;
        if (this.unbalanced) next = COACH.SWINGING;
        else if (hands.some((h) => h.hold !== null && h.grip < 0.25)) next = COACH.PUMPED;
        else if ((lh === this.problem.top) !== (rh === this.problem.top)) next = COACH.MATCH;
        else if (feetUnder) next = COACH.RESTING;
        else if (this.coach === COACH.START && this.time < 6) next = COACH.START;
        else next = COACH.CLIMBING;
        this.coach = next;
      }
    }

    startFall() {
      if (this.phase !== 'CLIMB' && this.phase !== 'DYNO') return;
      if (this.failX === 0 && this.failY === 0) {
        this.failX = this.body.sx;
        this.failY = this.body.sy - K.ARM_DROP;
      }
      this.phase = 'FALL';
      this.velY = 60;
      this.velX = 0;
      this.drag = null;
      this.aim = null;
      for (const s of this.limbs) s.hold = null;
      this.cues.push('FALL');
    }

    updateDyno(dt) {
      const b = this.body;
      this.velY += K.DYNO_GRAVITY * dt;
      const mx = this.velX * dt;
      const my = this.velY * dt;
      b.sx += mx;
      b.px += mx;
      b.sy += my;
      b.py += my;
      b.swing *= 0.9;
      const lh = this.limbs[LH];
      const rh = this.limbs[RH];
      lh.x = b.sx - 12;
      lh.y = b.sy - 62;
      rh.x = b.sx + 12;
      rh.y = b.sy - 62;
      this.relax(this.limbs[LF], this.anchor(LF), dt);
      this.relax(this.limbs[RF], this.anchor(RF), dt);
      const cx = b.sx;
      const cy = b.sy - K.DYNO_REACH;
      let best = -1;
      let bestDistance = K.DYNO_GRAB;
      for (let i = 0; i < this.holds.length; i++) {
        if (this.launchHolds.has(i) || this.isSubmerged(i)) continue;
        const d = hypot(this.holds[i].x - cx, this.holds[i].y - cy);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      if (best >= 0) {
        const h = this.holds[best];
        lh.hold = best;
        rh.hold = best;
        lh.x = h.x - 7;
        lh.y = h.y;
        rh.x = h.x + 7;
        rh.y = h.y;
        lh.grip = Math.max(0.05, lh.grip - K.DYNO_COST);
        rh.grip = Math.max(0.05, rh.grip - K.DYNO_COST);
        this.velX = 0;
        this.velY = 0;
        this.phase = 'CLIMB';
        this.dynoCatches++;
        this.noteHandHold(best);
        this.say(COACH.CAUGHT);
        this.cues.push('CATCH');
        return;
      }
      if (b.py > this.problem.ground - 40 || b.py > this.dynoFrom + K.DYNO_DROP) {
        this.cause = 'MISSED_DYNO';
        this.failX = b.sx;
        this.failY = b.sy - K.DYNO_REACH;
        this.startFall();
      }
    }

    updateFall(dt) {
      this.velY += K.FALL_ACCEL * dt;
      const my = this.velY * dt;
      this.body.sy += my;
      this.body.py += my;
      for (const s of this.limbs) s.y += my;
      if (this.body.py > Math.min(this.problem.ground - 40, this.tideY + 30)) {
        this.phase = 'FELL';
        this.cues.push('LANDED');
      }
    }

    grabWith(limb, index) {
      const s = this.limbs[limb];
      const h = this.holds[index];
      s.hold = index;
      s.x = h.x;
      s.y = h.y;
      s.stretch = 0;
      if (LIMBS[limb].hand) {
        this.noteHandHold(index);
        this.cause = null;
        this.failX = 0;
        this.failY = 0;
        this.cues.push('GRAB_HAND');
      } else {
        this.cues.push('GRAB_FOOT');
      }
    }

    noteHandHold(index) {
      if (this.line[this.line.length - 1] !== index) this.line.push(index);
      if (index === this.problem.bonus && !this.bonus) {
        this.bonus = true;
        this.cues.push('BONUS');
      }
    }

    place(limb, index) {
      const s = this.limbs[limb];
      s.hold = index;
      s.x = this.holds[index].x;
      s.y = this.holds[index].y;
    }

    say(line) {
      this.coach = line;
      this.coachHold = 2.5;
    }

    hands() { return [this.limbs[LH], this.limbs[RH]]; }
    feet() { return [this.limbs[LF], this.limbs[RF]]; }
    heldHands() { return this.hands().filter((s) => s.hold !== null && !(this.drag && this.drag.limb === s.limb.id)); }
    heldFeet() { return this.feet().filter((s) => s.hold !== null && !(this.drag && this.drag.limb === s.limb.id)); }

    targetPose() {
      const hands = this.heldHands();
      const feet = this.heldFeet();
      const fmx = feet.length ? feet.reduce((a, f) => a + f.x, 0) / feet.length : NaN;
      const fmy = feet.length ? feet.reduce((a, f) => a + f.y, 0) / feet.length : NaN;
      let tsx, tsy;
      if (hands.length === 2) {
        tsx = (hands[0].x + hands[1].x) / 2;
        tsy = (hands[0].y + hands[1].y) / 2 + K.ARM_DROP;
      } else if (hands.length === 1) {
        const h = hands[0];
        const hang = h.x - h.limb.side * K.SHOULDER_HALF;
        tsx = feet.length ? lerp(hang, fmx, 0.25 * feet.length) : hang;
        tsy = h.y + K.ARM_DROP + K.ONE_ARM_SAG;
        const d = this.drag;
        if (d && LIMBS[d.limb].hand) tsx += clamp((this.limbs[d.limb].x - tsx) * 0.3, -K.DRAG_LEAN, K.DRAG_LEAN);
      } else if (!feet.length) {
        tsx = this.body.sx;
        tsy = this.body.sy;
      } else {
        tsx = fmx;
        tsy = fmy - K.LEG_RISE - K.TORSO_LEN;
      }
      const leanRef = feet.length ? fmx : tsx;
      const lean = clamp((leanRef - tsx) / 90, -1, 1) * K.TORSO_LEAN;
      let tpx = tsx + Math.sin(lean) * K.TORSO_LEN;
      let tpy = tsy + Math.cos(lean) * K.TORSO_LEN;

      if (hands.length && feet.length) {
        const standPy = fmy - K.LEG_RISE;
        if (standPy < tpy) {
          const full = tpy - standPy;
          const fits = (lift) => hands.every((h) => {
            const a = this.anchorAt(h.limb.id, tsx, tsy - lift, tpx, tpy - lift);
            return hypot(h.x - a[0], h.y - a[1]) <= K.HAND_REACH - 2;
          });
          let lift = 0;
          if (fits(full)) {
            lift = full;
          } else if (fits(0)) {
            let lo = 0, hi = full;
            for (let i = 0; i < 10; i++) {
              const mid = (lo + hi) / 2;
              if (fits(mid)) lo = mid; else hi = mid;
            }
            lift = lo;
          }
          tsy -= lift;
          tpy -= lift;
        }
      }
      for (let r = 0; r < 3; r++) {
        for (const h of hands) {
          const a = this.anchorAt(h.limb.id, tsx, tsy, tpx, tpy);
          const d = hypot(h.x - a[0], h.y - a[1]);
          if (d > K.HAND_REACH - 2) {
            const f = (d - K.HAND_REACH + 2) / d;
            const dx = (h.x - a[0]) * f;
            const dy = (h.y - a[1]) * f;
            tsx += dx;
            tsy += dy;
            tpx += dx;
            tpy += dy;
          }
        }
      }
      return [tsx, tsy, tpx, tpy];
    }

    anchorAt(limb, sx, sy, px, py) {
      const ax = px - sx;
      const ay = py - sy;
      const len = hypot(ax, ay) > 0.001 ? hypot(ax, ay) : 1;
      const nx = ay / len;
      const ny = -ax / len;
      if (limb === LH) return [sx - nx * K.SHOULDER_HALF, sy - ny * K.SHOULDER_HALF];
      if (limb === RH) return [sx + nx * K.SHOULDER_HALF, sy + ny * K.SHOULDER_HALF];
      if (limb === LF) return [px - nx * K.HIP_HALF, py - ny * K.HIP_HALF];
      return [px + nx * K.HIP_HALF, py + ny * K.HIP_HALF];
    }
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Spotter {
    constructor(engine, pace = 0.45, sloppiness = 0, seed = 7) {
      this.e = engine;
      this.pace = pace;
      this.sloppiness = sloppiness;
      this.random = mulberry(seed);
      this.wait = pace;
      this.stale = 0;
      this.bestHeight = Infinity;
    }

    update(dt) {
      const e = this.e;
      if (e.phase !== 'CLIMB') return;
      this.wait -= dt;
      if (this.wait > 0) return;
      this.wait = this.pace * (0.85 + this.random() * 0.3);
      this.perform(this.decide());
      const highest = this.highestHandY();
      if (highest < this.bestHeight - 4) {
        this.bestHeight = highest;
        this.stale = 0;
      } else if (++this.stale > 36) {
        e.letGo();
      }
    }

    decide(allowChalk = true) {
      const e = this.e;
      const holds = e.holds;
      const top = e.problem.top;
      const lh = e.limbs[LH];
      const rh = e.limbs[RH];
      const grips = [lh, rh].filter((s) => s.hold !== null).map((s) => s.grip);
      if (allowChalk && e.chalk > 0 && grips.length && Math.min(...grips) < 0.3) return { kind: 'chalk' };
      if ((lh.hold === top) !== (rh.hold === top)) {
        const other = lh.hold === top ? RH : LH;
        if (e.canGrab(other, top) && e.inReach(other, top, 4)) return { kind: 'move', limb: other, hold: top };
      }
      for (const hand of [LH, RH]) {
        if (e.limbs[hand].hold !== null) continue;
        const pick = this.bestHand(hand, true);
        if (pick !== null) return { kind: 'move', limb: hand, hold: pick };
      }
      if (e.unbalanced) {
        const fix = this.fixBalance();
        if (fix) return fix;
      }
      for (const foot of [LF, RF]) {
        if (e.limbs[foot].hold !== null) continue;
        const pick = this.bestFoot(foot, Infinity);
        if (pick !== null) return { kind: 'move', limb: foot, hold: pick };
      }
      const hipY = e.body.py;
      const lowFoot = e.limbs[LF].y >= e.limbs[RF].y ? e.limbs[LF] : e.limbs[RF];
      if (lowFoot.y - hipY > 72) {
        const pick = this.bestFoot(lowFoot.limb.id, lowFoot.y - 15);
        if (pick !== null) return { kind: 'move', limb: lowFoot.limb.id, hold: pick };
      }
      for (const hand of [lh, rh].sort((a, b) => b.y - a.y)) {
        const pick = this.bestHand(hand.limb.id, false);
        if (pick !== null) return { kind: 'move', limb: hand.limb.id, hold: pick };
      }
      for (const foot of [e.limbs[LF], e.limbs[RF]].sort((a, b) => b.y - a.y)) {
        const pick = this.bestFoot(foot.limb.id, foot.y - 15);
        if (pick !== null) return { kind: 'move', limb: foot.limb.id, hold: pick };
      }
      const target = this.dynoTarget();
      if (target !== null) return { kind: 'dyno', hold: target };
      return null;
    }

    perform(action) {
      if (!action) return;
      const e = this.e;
      if (action.kind === 'chalk') e.chalkUp();
      else if (action.kind === 'move') {
        e.pressLimb(action.limb);
        e.move(e.holds[action.hold].x, e.holds[action.hold].y);
        e.release();
      } else if (action.kind === 'dyno') {
        const v = this.dynoVector(action.hold);
        e.pressBody();
        e.move(e.body.px - v[0], e.body.py - v[1]);
        e.release();
      }
    }

    highestHandY() {
      const e = this.e;
      let best = Infinity;
      for (const s of [e.limbs[LH], e.limbs[RH]]) if (s.hold !== null) best = Math.min(best, e.holds[s.hold].y);
      return best;
    }

    bestHand(hand, loose) {
      const e = this.e;
      const holds = e.holds;
      const top = e.problem.top;
      let highest = this.highestHandY();
      if (highest === Infinity) highest = e.limbs[hand].y;
      const candidates = e.reachableHolds(hand, 4).filter((i) => loose ? holds[i].y < highest + 70 : holds[i].y < highest - 8);
      if (!candidates.length) return null;
      if (this.sloppiness > 0 && this.random() < this.sloppiness) return candidates[Math.floor(this.random() * candidates.length)];
      const cx = e.cogX();
      let best = null, bestScore = -Infinity;
      for (const i of candidates) {
        const h = holds[i];
        const gain = Math.min(highest - h.y, 115);
        let kindBonus = 0;
        if (h.kind === 'JUG') kindBonus = 22;
        else if (h.kind === 'PINCH') kindBonus = 10;
        else if (h.kind === 'CRIMP') kindBonus = -4;
        else kindBonus = Math.abs(h.x - cx) < 34 ? 0 : -14;
        const score = gain + kindBonus + (i === top ? 1000 : 0) - Math.abs(h.x - e.body.sx) * 0.15;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      return best;
    }

    bestFoot(foot, higherThan) {
      const e = this.e;
      const holds = e.holds;
      const hipY = e.body.py;
      const candidates = e.reachableHolds(foot, 6).filter((i) => i !== e.problem.top && holds[i].y < higherThan && holds[i].y > hipY - 25);
      if (!candidates.length) return null;
      const aimX = e.body.px + LIMBS[foot].side * 22;
      let best = null, bestScore = -Infinity;
      for (const i of candidates) {
        const score = -holds[i].y - Math.abs(holds[i].x - aimX) * 0.6;
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      }
      return best;
    }

    fixBalance() {
      const e = this.e;
      const holds = e.holds;
      const cx = e.cogX();
      const hipY = e.body.py;
      const far = Math.abs(e.limbs[LF].x - cx) >= Math.abs(e.limbs[RF].x - cx) ? e.limbs[LF] : e.limbs[RF];
      let pick = null, bestD = Infinity;
      for (const i of e.reachableHolds(far.limb.id, 6)) {
        if (holds[i].y <= hipY - 25 || i === e.problem.top) continue;
        const d = Math.abs(holds[i].x - cx);
        if (d < bestD) {
          bestD = d;
          pick = i;
        }
      }
      if (pick === null || bestD >= Math.abs(far.x - cx)) return null;
      return { kind: 'move', limb: far.limb.id, hold: pick };
    }

    dynoTarget() {
      const e = this.e;
      if (e.limbs[LF].hold === null && e.limbs[RF].hold === null) return null;
      const highest = this.highestHandY();
      if (highest === Infinity) return null;
      let pick = null, bestGap = Infinity;
      e.holds.forEach((h, i) => {
        if (h.y < highest - 30 && Math.abs(h.x - e.body.sx) < 150 && highest - h.y < bestGap) {
          bestGap = highest - h.y;
          pick = i;
        }
      });
      return pick;
    }

    dynoVector(index) {
      const e = this.e;
      const h = e.holds[index];
      const cx = e.body.sx;
      const cy = e.body.sy - K.DYNO_REACH;
      const rise = Math.max(cy - h.y + 8, 10);
      const g = K.DYNO_GRAVITY;
      const v = Math.sqrt(2 * g * rise);
      const vx = (h.x - cx) / (v / g);
      const ux = 2 * vx / K.DYNO_POWER;
      const uy = -v / K.DYNO_POWER;
      const power = Math.sqrt(ux * ux + uy * uy);
      const dist = Math.max(Math.min(power, 1) * K.DYNO_CHARGE_MAX, 19);
      return [ux / power * dist, uy / power * dist];
    }
  }

  function trial(prob, kit, pace = 0.5, sloppiness = 0, seed = 7, limit = 150) {
    const engine = new Engine(prob, kit);
    const spotter = new Spotter(engine, pace, sloppiness, seed);
    const dt = 1 / 60;
    while (!engine.over && engine.time < limit) {
      spotter.update(dt);
      engine.step(dt);
    }
    if (!engine.over) engine.letGo();
    return engine;
  }

  return { KINDS, LIMBS, LH, RH, LF, RF, K, COACH, FALL_LINES, problem, Engine, Spotter, trial };
})();
