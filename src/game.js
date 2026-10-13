(() => {
  const INK = {
    paper: '#F2F2F3',
    wall: '#ECEEF0',
    contour: '#B5D9FD',
    seam: '#94BCE3',
    rule: '#CFD6DD',
    divider: '#D4D4D7',
    frame: '#B7B7BA',
    border: '#98989B',
    text: '#1D1F20',
    body: '#424244',
    sub: '#5D5D60',
    faint: '#7A7A7D',
    accent: '#5980A6',
    accentDeep: '#416180',
    navy: '#2C455D',
    night: '#1D2D3D',
    tape: '#C8683F',
    held: '#D6EBFF',
    mat: '#DDE3E9'
  };
  const TAPES = ['#C8683F', '#5980A6', '#7A8A5E', '#8C5E7A', '#2C455D', '#B0703A'];
  const STORE_URL = 'https://play.google.com/store/apps/details?id=com.kavri.sulden.crux';
  const ASSIST_DELAY = 2.2;
  const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const BODY = 'Barlow, "Helvetica Neue", Arial, sans-serif';

  const HOLD_SHAPES = {
    JUG: new Path2D('M-19 6C-15 -12 13 -13 19 1C23 9 14 14 0 14C-16 14 -24 12 -19 6Z'),
    CRIMP: new Path2D('M-20 -4L20 -4Q25 0 20 4L-20 4Q-25 0 -20 -4Z'),
    SLOPER: new Path2D('M-20 8C-20 -14 20 -14 20 8Z'),
    PINCH: new Path2D('M-11 12L-5 -10L5 -10L11 12Z')
  };
  const HOLD_HATCH = {
    JUG: new Path2D('M-10 8L-3 1M0 9L7 2'),
    CRIMP: new Path2D('M-18 0L18 0'),
    SLOPER: new Path2D('M-13 2C-6 -6 6 -6 13 2'),
    PINCH: new Path2D('M0 -8L0 10')
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const demo = /demo/.test(location.hash);
  const spacingSupported = 'letterSpacing' in ctx;

  let W = 0, H = 0, DPR = 1, L = null;
  let engine, assist, spotter;
  let attempt = 1;
  let bestHigh = 0;
  let state = 'play';
  let endTimer = 0;
  let endCard = null;
  let idle = 0;
  let firstMove = true;
  let hint = null;
  let hintClock = 0;
  let hintRefresh = 0;
  let flashes = [];
  let confetti = [];
  let buttons = [];
  let pressedButton = null;
  let activePointer = null;
  let tap = null;
  let running = false;
  let paused = false;
  let lastFrame = 0;
  let clock = 0;
  let audio = null;
  let master = null;
  let musicGain = null;
  let musicSource = null;
  let muted = false;
  let mutedByHost = false;
  const MUSIC_LEVEL = 0.32;
  const MUSIC_DUCK = 0.16;
  const sfxBuffers = {};

  function newAttempt() {
    engine = new Crux.Engine(ROUTE, KIT, L ? L.viewH : 560);
    assist = new FootAssist(engine, ASSIST_DELAY);
    spotter = demo ? new Crux.Spotter(engine, 0.9, 0.05, attempt) : null;
    if (state === 'end') setMusicLevel(MUSIC_LEVEL, 0.8);
    state = 'play';
    endTimer = 0;
    endCard = null;
    idle = 0;
    hint = null;
    hintClock = 0;
    flashes = [];
    confetti = [];
    document.body.dataset.phase = 'play';
  }

  function layout() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    const portrait = H >= W * 1.1;
    let u, wall, panel = null, side = null;
    if (portrait) {
      u = Math.max(0.75, Math.min(1.5, W / 390));
      const top = 56 * u;
      const bottom = 156 * u;
      wall = { x: 0, y: top, w: W, h: H - top - bottom };
      panel = { x: 0, y: H - bottom, w: W, h: bottom };
    } else {
      u = Math.max(0.7, Math.min(1.4, H / 430));
      const sideW = Math.min(W * 0.31, 300 * u);
      wall = { x: sideW, y: 0, w: W - sideW * 2, h: H };
      side = { left: { x: 0, y: 0, w: sideW, h: H }, right: { x: W - sideW, y: 0, w: sideW, h: H } };
    }
    const s = Math.min(wall.w / 300, wall.h / 430);
    const worldW = wall.w / s;
    L = { portrait, u, wall, panel, side, s, worldLeft: 180 - worldW / 2, worldW, viewH: wall.h / s };
    if (engine) engine.setViewHeight(L.viewH);
  }

  function setFont(size, weight, family) {
    ctx.font = `${weight} ${size}px ${family}`;
  }

  function spacing(px) {
    if (spacingSupported) ctx.letterSpacing = px + 'px';
  }

  function text(str, x, y, o) {
    setFont(o.size, o.weight || 500, o.family || COND);
    spacing(o.spacing ? o.spacing * o.size : 0);
    ctx.fillStyle = o.color || INK.text;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = o.baseline || 'alphabetic';
    ctx.fillText(str, x, y);
    spacing(0);
  }

  function measure(str, o) {
    setFont(o.size, o.weight || 500, o.family || COND);
    spacing(o.spacing ? o.spacing * o.size : 0);
    const w = ctx.measureText(str).width;
    spacing(0);
    return w;
  }

  function wrap(str, maxW, o) {
    const words = str.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? line + ' ' + w : w;
      if (measure(next, o) > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function rect(x, y, w, h, fill, stroke, lw) {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, w, h);
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 1;
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
    }
  }

  function cornerTicks(x, y, w, h, inset, len, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const pts = [[x + inset, y + inset, 1, 1], [x + w - inset, y + inset, -1, 1], [x + inset, y + h - inset, 1, -1], [x + w - inset, y + h - inset, -1, -1]];
    for (const [px, py, dx, dy] of pts) {
      ctx.moveTo(px + dx * len, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py + dy * len);
    }
    ctx.stroke();
  }

  function button(id, x, y, w, h, label, style, action) {
    const pressed = pressedButton && pressedButton.id === id;
    const pulse = style.pulse ? 0.5 + 0.5 * Math.sin(clock * 6) : 0;
    if (style.fill) {
      rect(x, y, w, h, pressed ? INK.night : style.fill);
      if (pulse) {
        ctx.strokeStyle = style.fill;
        ctx.globalAlpha = 0.5 * (1 - pulse);
        ctx.lineWidth = 2;
        const g = 3 + pulse * 6 * L.u;
        ctx.strokeRect(x - g, y - g, w + g * 2, h + g * 2);
        ctx.globalAlpha = 1;
      }
    } else {
      rect(x, y, w, h, pressed ? '#E7E7EA' : INK.paper, style.border || INK.navy, 1);
    }
    text(label, x + w / 2, y + h / 2 + 1, { size: style.size, weight: 700, spacing: 0.08, color: style.fill ? INK.paper : (style.color || INK.text), align: 'center', baseline: 'middle' });
    buttons.push({ id, x, y, w, h, action });
  }

  function hit(p) {
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b;
    }
    return null;
  }

  function toWorld(p) {
    return { x: (p.x - L.wall.x) / L.s + L.worldLeft, y: (p.y - L.wall.y) / L.s + engine.camera };
  }

  function toScreen(x, y) {
    return { x: L.wall.x + (x - L.worldLeft) * L.s, y: L.wall.y + (y - engine.camera) * L.s };
  }

  function inWall(p) {
    const w = L.wall;
    return p.x >= w.x && p.x <= w.x + w.w && p.y >= w.y && p.y <= w.y + w.h;
  }

  function ik(rx, ry, ex, ey, l1, l2, bend) {
    let dx = ex - rx, dy = ey - ry;
    let d = Math.hypot(dx, dy);
    const max = l1 + l2 - 0.5;
    if (d > max) {
      dx = dx / d * max;
      dy = dy / d * max;
      d = max;
    }
    if (d < 1) d = 1;
    const c = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const a = Math.acos(c) * bend;
    const base = Math.atan2(dy, dx) + a;
    return [rx + Math.cos(base) * l1, ry + Math.sin(base) * l1, rx + dx, ry + dy];
  }

  function drawHold(h, held) {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.fillStyle = held ? INK.held : INK.paper;
    ctx.fill(HOLD_SHAPES[h.kind]);
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 1.6;
    ctx.stroke(HOLD_SHAPES[h.kind]);
    ctx.strokeStyle = INK.seam;
    ctx.lineWidth = 1;
    ctx.stroke(HOLD_HATCH[h.kind]);
    ctx.restore();
  }

  function drawClimber(e) {
    const b = e.body;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const limb = (id, l1, l2, bend) => {
      const a = e.anchor(id);
      const s = e.limbs[id];
      const reach = Math.hypot(s.x - a[0], s.y - a[1]);
      let seg = Math.max(l1 * 0.45, Math.min(l1, reach * 0.6));
      if (seg * 2 < reach + 1) seg = reach / 2 + 1;
      const j = ik(a[0], a[1], s.x, s.y, seg, seg * (l2 / l1), bend);
      ctx.strokeStyle = INK.night;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(j[0], j[1]);
      ctx.lineTo(j[2], j[3]);
      ctx.stroke();
    };
    const K = Crux.K;
    limb(Crux.LF, K.THIGH, K.SHIN, 1);
    limb(Crux.RF, K.THIGH, K.SHIN, -1);
    limb(Crux.LH, K.UPPER_ARM, K.FOREARM, -1);
    limb(Crux.RH, K.UPPER_ARM, K.FOREARM, 1);

    const ax = b.px - b.sx, ay = b.py - b.sy;
    const len = Math.hypot(ax, ay) > 0.01 ? Math.hypot(ax, ay) : 1;
    const nx = -ay / len, ny = ax / len;
    const sh = K.SHOULDER_HALF + 3, hh = K.HIP_HALF;
    ctx.beginPath();
    ctx.moveTo(b.sx - nx * sh, b.sy - ny * sh);
    ctx.lineTo(b.sx + nx * sh, b.sy + ny * sh);
    ctx.lineTo(b.px + nx * hh, b.py + ny * hh);
    ctx.lineTo(b.px - nx * hh, b.py - ny * hh);
    ctx.closePath();
    ctx.fillStyle = INK.accentDeep;
    ctx.fill();
    ctx.strokeStyle = INK.night;
    ctx.lineWidth = 2;
    ctx.stroke();
    const k = 0.3;
    ctx.strokeStyle = INK.contour;
    ctx.beginPath();
    ctx.moveTo(b.sx - nx * (sh - 2) + ax * k, b.sy - ny * (sh - 2) + ay * k);
    ctx.lineTo(b.sx + nx * (sh - 2) + ax * k, b.sy + ny * (sh - 2) + ay * k);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e.headX, e.headY, 13, 0, Math.PI * 2);
    ctx.fillStyle = INK.navy;
    ctx.fill();
    ctx.strokeStyle = INK.night;
    ctx.stroke();
    const bx = b.px - nx * 15 + (ax / len) * 18, by = b.py - ny * 15 + (ay / len) * 18;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fillStyle = INK.paper;
    ctx.fill();
    ctx.strokeStyle = INK.navy;
    ctx.stroke();

    const dashed = (x, y) => {
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = INK.tape;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const id of [Crux.LH, Crux.RH]) {
      const s = e.limbs[id];
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = s.hold === null ? INK.tape : INK.accentDeep;
      ctx.fill();
      ctx.strokeStyle = INK.night;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (e.drag && e.drag.limb === id) dashed(s.x, s.y);
    }
    for (const id of [Crux.LF, Crux.RF]) {
      const s = e.limbs[id];
      ctx.fillStyle = s.hold === null ? INK.tape : INK.navy;
      ctx.fillRect(s.x - 7, s.y - 4, 14, 8);
      if (e.drag && e.drag.limb === id) dashed(s.x, s.y);
    }
  }

  function drawWall() {
    const e = engine;
    const p = e.problem;
    const wl = L.wall;
    ctx.save();
    ctx.beginPath();
    ctx.rect(wl.x, wl.y, wl.w, wl.h);
    ctx.clip();
    ctx.fillStyle = INK.wall;
    ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    ctx.setTransform(DPR * L.s, 0, 0, DPR * L.s, DPR * (wl.x - L.worldLeft * L.s), DPR * (wl.y - e.camera * L.s));
    const top = e.camera - 40;
    const bottom = e.camera + L.viewH + 40;
    const left = L.worldLeft - 12;
    const right = L.worldLeft + L.worldW + 12;

    ctx.strokeStyle = INK.contour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = Math.floor(top / 52) * 52; y < bottom; y += 52) {
      for (let x = Math.floor(left / 12) * 12, first = true; x <= right; x += 12, first = false) {
        const yy = y + Math.sin((x + y) / 74) * 9 + Math.sin(x / 31 + y / 120) * 3;
        if (first) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = INK.seam;
    ctx.beginPath();
    for (const x0 of [104, 262]) {
      for (let yy = top, first = true; yy < bottom; yy += 14, first = false) {
        const xx = x0 + Math.sin(yy / 96) * 11;
        if (first) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
    }
    ctx.stroke();

    const matL = L.worldLeft + 28, matW = L.worldW - 56;
    ctx.fillStyle = INK.mat;
    ctx.fillRect(matL, p.ground, matW, 22);
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 1;
    ctx.strokeRect(matL, p.ground, matW, 22);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, p.ground);
    ctx.lineTo(right, p.ground);
    ctx.stroke();
    ctx.strokeStyle = INK.rule;
    ctx.beginPath();
    for (let m = p.ground - 100; m > p.wallTop; m -= 100) {
      ctx.moveTo(L.worldLeft, m);
      ctx.lineTo(L.worldLeft + 18, m);
    }
    ctx.stroke();

    if (e.drag) {
      const a = e.anchor(e.drag.limb);
      const r = e.reachOf(e.drag.limb);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = INK.seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(a[0], a[1], r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = INK.tape;
      p.holds.forEach((h, i) => {
        if (!e.canGrab(e.drag.limb, i) || Math.hypot(h.x - a[0], h.y - a[1]) > r) return;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 15, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
    }

    p.holds.forEach((h, i) => {
      if (h.y < top - 30 || h.y > bottom + 30) return;
      drawHold(h, e.heldBy(i));
      ctx.fillStyle = i === p.top ? INK.night : p.tape;
      ctx.fillRect(h.x - 9, h.y + 16, 18, 3.5);
    });

    for (const f of flashes) {
      const t = f.age / f.life;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 14 + t * 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    drawClimber(e);

    if (e.aim) {
      const dx = e.aim.x0 - e.aim.x, dy = e.aim.y0 - e.aim.y;
      const dist = Math.min(Math.hypot(dx, dy), Crux.K.DYNO_CHARGE_MAX);
      const ang = Math.atan2(dy, dx);
      const b = e.body;
      ctx.strokeStyle = INK.tape;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.px, b.py);
      ctx.lineTo(b.px + Math.cos(ang) * dist * 1.6, b.py + Math.sin(ang) * dist * 1.6);
      ctx.stroke();
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(b.px, b.py, dist, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (hint && state === 'play') drawHintWorld();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let m = p.ground - 100; m > p.wallTop; m -= 100) {
      const sp = toScreen(L.worldLeft, m);
      if (sp.y > wl.y - 20 && sp.y < wl.y + wl.h + 20) text(`${Math.round((p.ground - m) / 100)} m`, wl.x + 22 * L.s, sp.y + 3 * L.s, { size: 10 * L.s, color: INK.faint, spacing: 0.04 });
    }
    const topHold = p.holds[p.top];
    const tp = toScreen(topHold.x + 24, topHold.y + 4);
    text('TOP', tp.x, tp.y, { size: 10 * L.s, color: INK.navy, spacing: 0.06 });
    if (!e.bonus) {
      const bh = p.holds[p.bonus];
      const bp = toScreen(bh.x + 24, bh.y + 4);
      text('BONUS', bp.x, bp.y, { size: 10 * L.s, color: INK.tape, spacing: 0.06 });
    }
    drawCoach();
    if (hint && state === 'play') drawHintCaption();
    ctx.restore();
    muteButton();
  }

  function drawCoach() {
    if (state !== 'play' || engine.phase === 'FALL') return;
    const u = L.u;
    const line = engine.coach.toUpperCase();
    const o = { size: 13 * u, weight: 500, spacing: 0.06, color: INK.text };
    const maxW = L.wall.w - 24 * u - 46 * u;
    const lines = wrap(line, maxW - 18 * u, o);
    const w = Math.min(maxW, Math.max(...lines.map((l) => measure(l, o))) + 18 * u);
    const lh = 16 * u;
    const h = lines.length * lh + 10 * u;
    const x = L.wall.x + 12 * u, y = L.wall.y + 12 * u;
    rect(x, y, w, h, INK.paper, INK.frame, 1);
    lines.forEach((l, i) => text(l, x + 9 * u, y + 5 * u + lh * (i + 0.78), o));
  }

  function hintCopy(h) {
    if (h.kind === 'chalk') return 'PUMPED! TAP CHALK';
    if (h.kind === 'dyno') return 'DRAG THE BODY DOWN, LET GO TO JUMP';
    if (h.hold === engine.problem.top) return 'MATCH THE TOP WITH BOTH HANDS';
    if (!Crux.LIMBS[h.limb].hand) return 'STEP A FOOT UP. FEET SAVE YOUR GRIP';
    return firstMove ? 'DRAG A HAND TO THE NEXT HOLD' : 'KEEP REACHING UP';
  }

  function hintPhase() {
    return (hintClock % 1.6) / 1.6;
  }

  function drawHintWorld() {
    if (hint.kind !== 'move' && hint.kind !== 'dyno') return;
    const e = engine;
    let fx, fy, tx, ty;
    if (hint.kind === 'move') {
      const s = e.limbs[hint.limb];
      const h = e.holds[hint.hold];
      fx = s.x; fy = s.y; tx = h.x; ty = h.y;
    } else {
      fx = e.body.px; fy = e.body.py; tx = fx; ty = fy + 70;
    }
    const t = hintPhase();
    const k = t < 0.15 ? 0 : t > 0.75 ? 1 : (t - 0.15) / 0.6;
    const ek = k * k * (3 - 2 * k);
    const x = fx + (tx - fx) * ek, y = fy + (ty - fy) * ek;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = INK.tape;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    const pulse = 0.5 + 0.5 * Math.sin(clock * 7);
    ctx.beginPath();
    ctx.arc(tx, ty, 18 + pulse * 5, 0, Math.PI * 2);
    ctx.strokeStyle = INK.tape;
    ctx.lineWidth = 2;
    ctx.stroke();
    const alpha = t > 0.88 ? 1 - (t - 0.88) / 0.12 : 1;
    ctx.globalAlpha = alpha;
    drawFinger(x, y, t > 0.12 && t < 0.8);
    ctx.globalAlpha = 1;
  }

  function drawFinger(x, y, down) {
    ctx.save();
    ctx.translate(x + 6, y + 8);
    ctx.rotate(-0.35);
    const sc = down ? 0.92 : 1;
    ctx.scale(sc, sc);
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.lineTo(-5, 22);
    ctx.quadraticCurveTo(-14, 16, -15, 24);
    ctx.quadraticCurveTo(-8, 38, 2, 50);
    ctx.lineTo(22, 50);
    ctx.quadraticCurveTo(28, 36, 27, 22);
    ctx.lineTo(27, 16);
    ctx.quadraticCurveTo(24, 10, 18, 13);
    ctx.quadraticCurveTo(15, 7, 9, 10);
    ctx.quadraticCurveTo(7, 5, 5, 6);
    ctx.lineTo(5, -6);
    ctx.quadraticCurveTo(0, -12, -5, -6);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.strokeStyle = INK.night;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    if (down) {
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200,104,63,0.35)';
      ctx.fill();
    }
  }

  function drawHintCaption() {
    const u = L.u;
    const label = hintCopy(hint);
    const o = { size: 14 * u, weight: 700, spacing: 0.08, color: INK.paper };
    const lines = wrap(label, L.wall.w - 56 * u, o);
    const lh = 18 * u;
    const w = Math.max(...lines.map((l) => measure(l, o))) + 24 * u;
    const h = lines.length * lh + 14 * u;
    const x = L.wall.x + (L.wall.w - w) / 2;
    const y = L.wall.y + L.wall.h - h - 14 * u;
    rect(x, y, w, h, INK.navy);
    rect(x, y + h - 3 * u, w, 3 * u, INK.tape);
    lines.forEach((l, i) => text(l, x + w / 2, y + 7 * u + lh * (i + 0.75), Object.assign({ align: 'center' }, o)));
  }

  function gripMeter(x, y, w, label, grip) {
    const u = L.u;
    const low = grip < 0.28;
    text(label, x, y + 11 * u, { size: 11 * u, spacing: 0.14, color: INK.sub });
    text(`${Math.round(Math.max(0, Math.min(1, grip)) * 100)}%`, x + w, y + 11 * u, { size: 11 * u, spacing: 0.14, color: low ? INK.tape : INK.sub, align: 'right' });
    const by = y + 15 * u, bh = 12 * u;
    rect(x, by, w, bh, null, INK.border, 1);
    rect(x + 2, by + 2, Math.max(0, (w - 4) * Math.max(0, Math.min(1, grip))), bh - 4, low ? INK.tape : INK.accent);
  }

  function chalkButton(x, y, w, h) {
    const u = L.u;
    const urgent = engine.chalk > 0 && engine.hands().some((s) => s.hold !== null && s.grip < 0.3);
    const pressed = pressedButton && pressedButton.id === 'chalk';
    rect(x, y, w, h, urgent ? '#FBE9E1' : pressed ? '#E7E7EA' : INK.paper, urgent ? INK.tape : INK.navy, urgent ? 2 : 1);
    if (urgent) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 8);
      ctx.globalAlpha = 0.6 * (1 - pulse);
      ctx.strokeStyle = INK.tape;
      ctx.lineWidth = 2;
      const g = 3 + pulse * 7 * u;
      ctx.strokeRect(x - g, y - g, w + g * 2, h + g * 2);
      ctx.globalAlpha = 1;
    }
    const cx = x + w / 2, cy = y + h / 2 - 8 * u;
    ctx.strokeStyle = INK.navy;
    ctx.lineWidth = 1.6 * u;
    ctx.beginPath();
    ctx.moveTo(cx - 8 * u, cy - 6 * u);
    ctx.lineTo(cx - 9 * u, cy + 7 * u);
    ctx.quadraticCurveTo(cx, cy + 11 * u, cx + 9 * u, cy + 7 * u);
    ctx.lineTo(cx + 8 * u, cy - 6 * u);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 10 * u, cy - 6 * u);
    ctx.lineTo(cx + 10 * u, cy - 6 * u);
    ctx.stroke();
    ctx.fillStyle = INK.paper;
    for (const [dx, dy] of [[-3, -10], [2, -12], [5, -9]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * u, cy + dy * u, 1.4 * u, 0, Math.PI * 2);
      ctx.fillStyle = INK.faint;
      ctx.fill();
    }
    text(`CHALK ${engine.chalk}`, cx, y + h / 2 + 17 * u, { size: 13 * u, weight: 700, spacing: 0.1, align: 'center' });
    buttons.push({ id: 'chalk', x, y, w, h, action: () => engine.chalkUp() });
  }

  function dynoHint(x, y, w, h) {
    const u = L.u;
    ctx.setLineDash([4 * u, 3 * u]);
    rect(x, y, w, h, null, INK.border, 1);
    ctx.setLineDash([]);
    const gx = x + 22 * u, gy = y + h / 2;
    ctx.strokeStyle = INK.tape;
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(gx, gy + 11 * u);
    ctx.lineTo(gx, gy - 11 * u);
    ctx.moveTo(gx - 7 * u, gy - 4 * u);
    ctx.lineTo(gx, gy - 11 * u);
    ctx.lineTo(gx + 7 * u, gy - 4 * u);
    ctx.stroke();
    const tx = x + 42 * u;
    text('DYNO', tx, y + h / 2 - 5 * u, { size: 14 * u, weight: 700, spacing: 0.08 });
    const lines = wrap('Drag the body down, then release to jump.', w - 50 * u, { size: 11 * u, family: BODY, weight: 400 });
    lines.slice(0, 2).forEach((l, i) => text(l, tx, y + h / 2 + 10 * u + i * 13 * u, { size: 11 * u, family: BODY, weight: 400, color: INK.sub }));
  }

  function legend(x, y, w) {
    const u = L.u;
    rect(x, y, w, 1, INK.divider);
    const items = ['JUG SLOW', 'CRIMP FAST', 'SLOPER HIPS IN', 'PINCH MEDIUM'];
    const cw = w / items.length;
    items.forEach((t, i) => text(t, x + cw * i, y + 16 * u, { size: 10 * u, spacing: 0.06, color: INK.faint }));
  }

  function titleBlock(x, y, maxW) {
    const u = L.u;
    rect(x, y + 3 * u, 4 * u, 30 * u, ROUTE.tape);
    const o = { size: 17 * u, weight: 700 };
    text(ROUTE.name.toUpperCase(), x + 12 * u, y + 17 * u, o);
    text(ROUTE.grade, x + 12 * u + measure(ROUTE.name.toUpperCase(), o) + 8 * u, y + 17 * u, { size: 17 * u, weight: 500, color: INK.faint });
    const sub = `Attempt ${attempt} · Bonus ${engine.bonus ? 'taken' : 'open'}`;
    text(sub, x + 12 * u, y + 33 * u, { size: 11 * u, family: BODY, weight: 400, color: INK.sub });
  }

  function heightLabel() {
    return `${(engine.high / 100).toFixed(1)} M`;
  }

  function drawPortraitHud() {
    const u = L.u;
    const topH = L.wall.y;
    rect(0, 0, W, topH, INK.paper);
    rect(0, topH - 1, W, 1, INK.frame);
    titleBlock(12 * u, topH / 2 - 19 * u, W * 0.5);
    const ctaW = 82 * u, ctaH = 34 * u;
    button('cta-top', W - ctaW - 12 * u, (topH - ctaH) / 2, ctaW, ctaH, 'PLAY', { fill: INK.navy, size: 14 * u }, openStore);
    text(heightLabel(), W - ctaW - 24 * u, topH / 2 + 4 * u, { size: 13 * u, spacing: 0.12, color: INK.accentDeep, align: 'right' });

    const p = L.panel;
    rect(p.x, p.y, p.w, p.h, INK.paper);
    rect(p.x, p.y, p.w, 1, INK.frame);
    const pad = 12 * u;
    const cw = (W - pad * 2 - 10 * u) / 2;
    gripMeter(pad, p.y + 10 * u, cw, 'LEFT HAND', engine.limbs[0].grip);
    gripMeter(pad + cw + 10 * u, p.y + 10 * u, cw, 'RIGHT HAND', engine.limbs[1].grip);
    const rowY = p.y + 48 * u, rowH = 62 * u;
    const chalkW = 96 * u;
    dynoHint(pad, rowY, W - pad * 2 - chalkW - 10 * u, rowH);
    chalkButton(W - pad - chalkW, rowY, chalkW, rowH);
    legend(pad, rowY + rowH + 10 * u, W - pad * 2);
  }

  function drawLandscapeHud() {
    const u = L.u;
    const lp = L.side.left, rp = L.side.right;
    rect(lp.x, lp.y, lp.w, lp.h, INK.paper);
    rect(lp.x + lp.w - 1, 0, 1, H, INK.frame);
    rect(rp.x, rp.y, rp.w, rp.h, INK.paper);
    rect(rp.x, 0, 1, H, INK.frame);
    const pad = 14 * u;
    titleBlock(pad, pad, lp.w - pad * 2);
    text('HEIGHT', pad, pad + 66 * u, { size: 11 * u, spacing: 0.14, color: INK.sub });
    text(heightLabel(), pad, pad + 96 * u, { size: 30 * u, weight: 700, color: INK.accentDeep });
    const mw = lp.w - pad * 2;
    gripMeter(pad, pad + 116 * u, mw, 'LEFT HAND', engine.limbs[0].grip);
    gripMeter(pad, pad + 152 * u, mw, 'RIGHT HAND', engine.limbs[1].grip);
    const chalkH = Math.min(62 * u, H - (pad + 196 * u) - pad);
    chalkButton(pad, pad + 196 * u, mw, Math.max(44 * u, chalkH));

    const cx = rp.x + rp.w / 2;
    let y = H * 0.2;
    text('CRUX', cx, y + 40 * u, { size: 54 * u, weight: 700, align: 'center', spacing: 0.04 });
    text('BOULDERING', cx, y + 62 * u, { size: 13 * u, spacing: 0.3, color: INK.tape, align: 'center' });
    const pitch = wrap('40 problems across 5 crags. Tide, crumbling rock and night climbs.', rp.w - pad * 2, { size: 13 * u, family: BODY, weight: 400 });
    pitch.forEach((l, i) => text(l, cx, y + 92 * u + i * 17 * u, { size: 13 * u, family: BODY, weight: 400, color: INK.sub, align: 'center' }));
    const bw = rp.w - pad * 2, bh = 48 * u;
    button('cta-side', rp.x + pad, H - pad - bh, bw, bh, 'PLAY FREE', { fill: INK.navy, size: 16 * u, pulse: true }, openStore);
  }

  function prepareEndCard() {
    const e = engine;
    const sent = e.phase === 'SENT';
    const higher = !sent && e.high > bestHigh + 30 && attempt > 1;
    bestHigh = Math.max(bestHigh, e.high);
    let headline, line;
    if (sent) {
      headline = 'SENT';
      if (attempt === 1) line = 'Flashed. You read it right the first time.';
      else if (attempt === 2) line = 'Second try. That foot change was the answer.';
      else line = `Attempt ${attempt}. Clean and steady.`;
    } else {
      headline = `FELL AT ${(e.high / 100).toFixed(1)} M`;
      const lead = higher ? 'Higher than last time. ' : '';
      const held = e.failX || e.failY ? e.holds.find((h) => h.x === e.failX && h.y === e.failY) : null;
      const kind = held ? Crux.KINDS[held.kind].label.toLowerCase() : 'jug';
      let body;
      if (e.cause === 'LEFT_HAND' || e.cause === 'RIGHT_HAND') body = `Get a foot under the ${kind} before you move.`;
      else if (e.cause === 'MISSED_DYNO') body = 'Pull the body lower before you jump. More power, less angle.';
      else body = 'Take a breath. Feet first, then reach.';
      line = lead + body;
    }
    endCard = {
      sent,
      headline,
      line,
      time: e.time,
      height: e.high / 100,
      bonus: e.bonus,
      cause: e.cause ? Crux.FALL_LINES[e.cause] : null,
      at: clock
    };
    document.body.dataset.phase = sent ? 'sent' : 'fell';
  }

  function drawEndCard() {
    const u = L.u;
    const c = endCard;
    const t = Math.min(1, (clock - c.at) / 0.35);
    ctx.fillStyle = `rgba(242,242,243,${0.86 * t})`;
    ctx.fillRect(0, 0, W, H);
    const cw = Math.min(W - 32 * u, 360 * u);
    const pad = 20 * u;
    const inner = cw - pad * 2;
    const lineO = { size: 14 * u, family: BODY, weight: 400 };
    const lines = wrap(c.line, inner, lineO);
    const pitchO = { size: 13 * u, family: BODY, weight: 400 };
    const pitch = wrap('40 problems across 5 crags. Tide, crumbling rock and night climbs.', inner, pitchO);
    const headSize = Math.min(52 * u, inner / Math.max(4, c.headline.length) * 1.9);
    const ch = pad + 18 * u + headSize + 8 * u + lines.length * 19 * u + 18 * u + 58 * u + 14 * u + pitch.length * 17 * u + 18 * u + 50 * u + 10 * u + 44 * u + pad;
    const cx = (W - cw) / 2;
    const cy = Math.max(12 * u, (H - ch) / 2) + (1 - t) * 30 * u;
    ctx.globalAlpha = t;
    rect(cx, cy, cw, ch, INK.paper, INK.navy, 1);
    cornerTicks(cx, cy, cw, ch, 5 * u, 9 * u, INK.navy);
    let y = cy + pad + 12 * u;
    text(`${ROUTE.name.toUpperCase()} · ${ROUTE.grade}`, cx + pad, y, { size: 12 * u, weight: 600, spacing: 0.14, color: INK.tape });
    y += 6 * u + headSize;
    text(c.headline, cx + pad, y, { size: headSize, weight: 700, color: c.sent ? INK.text : INK.navy });
    y += 8 * u;
    lines.forEach((l) => {
      y += 19 * u;
      text(l, cx + pad, y - 4 * u, Object.assign({ color: INK.body }, lineO));
    });
    y += 14 * u;
    rect(cx + pad, y, inner, 1, INK.divider);
    const stats = [['TIME', fmtTime(c.time)], ['HEIGHT', `${c.height.toFixed(1)} m`], ['BONUS', c.bonus ? 'Taken' : 'Open']];
    const sw = inner / 3;
    stats.forEach(([k, v], i) => {
      text(k, cx + pad + sw * i, y + 20 * u, { size: 11 * u, spacing: 0.14, color: INK.sub });
      text(v, cx + pad + sw * i, y + 44 * u, { size: 22 * u, weight: 700, color: k === 'BONUS' && c.bonus ? INK.tape : INK.text });
    });
    y += 58 * u;
    rect(cx + pad, y, inner, 1, INK.divider);
    y += 14 * u;
    pitch.forEach((l) => {
      y += 17 * u;
      text(l, cx + pad, y - 4 * u, Object.assign({ color: INK.sub }, pitchO));
    });
    y += 18 * u;
    const primaryCta = c.sent || attempt >= 2;
    const retryLabel = c.sent ? 'CLIMB AGAIN' : 'TRY AGAIN';
    if (primaryCta) {
      button('cta-end', cx + pad, y, inner, 50 * u, c.sent ? 'PLAY CRUX FREE' : 'GET CRUX, TRAIN HARDER', { fill: INK.navy, size: 16 * u, pulse: true }, openStore);
      button('retry', cx + pad, y + 60 * u, inner, 44 * u, retryLabel, { border: INK.sub, size: 14 * u }, retry);
    } else {
      button('retry', cx + pad, y, inner, 50 * u, retryLabel, { fill: INK.navy, size: 16 * u, pulse: true }, retry);
      button('cta-end', cx + pad, y + 60 * u, inner, 44 * u, 'GET CRUX', { border: INK.sub, size: 14 * u }, openStore);
    }
    ctx.globalAlpha = 1;
  }

  function fmtTime(t) {
    const s = Math.floor(t);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function retry() {
    attempt++;
    newAttempt();
  }

  function spawnConfetti() {
    for (let i = 0; i < 90; i++) {
      confetti.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.4,
        y: H * 0.35,
        vx: (Math.random() - 0.5) * 520,
        vy: -260 - Math.random() * 420,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 10,
        c: TAPES[i % TAPES.length],
        life: 2.4 + Math.random()
      });
    }
  }

  function drawConfetti(dt) {
    const u = L.u;
    confetti = confetti.filter((p) => (p.life -= dt) > 0);
    for (const p of confetti) {
      p.vy += 900 * dt;
      p.vx *= 0.99;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.c;
      ctx.fillRect(-9 * u, -2 * u, 18 * u, 4 * u);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const CUE_SFX = {
    GRAB_HAND: ['grab', 1, 12],
    GRAB_FOOT: ['foot', 0.8, 8],
    SLIP: ['slip', 1, 30],
    FOOT_OFF: ['slip', 0.6, 20],
    CHALK: ['chalk', 1, 10],
    EMPTY_BAG: ['tap', 1, 0],
    PUMP: ['pump', 1, 40],
    LAUNCH: ['launch', 1, 20],
    CATCH: ['deadpoint', 1, 30],
    BONUS: ['bonus', 1, 25],
    SENT: ['sent', 1, [30, 40, 30, 40, 80]],
    FALL: ['fall', 1, [40, 30, 60]],
    LANDED: ['land', 1, 50]
  };

  function handleCues() {
    for (const cue of engine.drainCues()) {
      const fx = CUE_SFX[cue];
      if (!fx) continue;
      play(fx[0], fx[1]);
      vibrate(fx[2]);
      if (cue === 'GRAB_HAND' || cue === 'GRAB_FOOT') {
        firstMove = cue === 'GRAB_HAND' ? false : firstMove;
      }
      if (cue === 'BONUS') {
        const b = engine.holds[engine.problem.bonus];
        flashes.push({ x: b.x, y: b.y, age: 0, life: 0.7, color: INK.tape });
      }
      if (cue === 'SENT') spawnConfetti();
    }
  }

  function vibrate(p) {
    if (!p || !navigator.vibrate) return;
    try {
      navigator.vibrate(p);
    } catch (err) {
      return;
    }
  }

  function unlockAudio() {
    if (audio) {
      if (audio.state === 'suspended') audio.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio = new AC();
    master = audio.createGain();
    master.gain.value = muted || mutedByHost ? 0 : 1;
    master.connect(audio.destination);
    musicGain = audio.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(master);
    const sfx = readJson('sfx');
    if (sfx) {
      for (const [name, b64] of Object.entries(sfx)) {
        audio.decodeAudioData(bytesOf(b64), (buf) => { sfxBuffers[name] = buf; }, () => {});
      }
    }
    const music = readJson('music');
    if (music) audio.decodeAudioData(bytesOf(music.data), (buf) => startMusic(buf, music), () => {});
  }

  function readJson(id) {
    const node = document.getElementById(id);
    if (!node) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (err) {
      return null;
    }
  }

  function bytesOf(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function startMusic(buf, meta) {
    if (musicSource) return;
    musicSource = audio.createBufferSource();
    musicSource.buffer = buf;
    musicSource.loop = true;
    musicSource.loopStart = meta.loopStart;
    musicSource.loopEnd = meta.loopEnd;
    musicSource.connect(musicGain);
    musicSource.start(0, meta.loopStart);
    setMusicLevel(state === 'end' ? MUSIC_DUCK : MUSIC_LEVEL, 1.5);
  }

  function setMusicLevel(level, seconds) {
    if (!musicGain) return;
    const now = audio.currentTime;
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setValueAtTime(musicGain.gain.value, now);
    musicGain.gain.linearRampToValueAtTime(level, now + seconds);
  }

  function applyMute() {
    if (!master) return;
    const now = audio.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(muted || mutedByHost ? 0 : 1, now + 0.12);
  }

  function toggleMute() {
    muted = !muted;
    unlockAudio();
    applyMute();
  }

  function muteButton() {
    const u = L.u;
    const size = 34 * u;
    const x = L.wall.x + L.wall.w - size - 12 * u, y = L.wall.y + 12 * u;
    rect(x, y, size, size, INK.paper, INK.frame, 1);
    const cx = x + size / 2 - 3 * u, cy = y + size / 2;
    ctx.fillStyle = INK.navy;
    ctx.beginPath();
    ctx.moveTo(cx - 8 * u, cy - 4 * u);
    ctx.lineTo(cx - 4 * u, cy - 4 * u);
    ctx.lineTo(cx + 2 * u, cy - 9 * u);
    ctx.lineTo(cx + 2 * u, cy + 9 * u);
    ctx.lineTo(cx - 4 * u, cy + 4 * u);
    ctx.lineTo(cx - 8 * u, cy + 4 * u);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = muted ? INK.tape : INK.navy;
    ctx.lineWidth = 1.8 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (muted) {
      ctx.moveTo(cx + 6 * u, cy - 5 * u);
      ctx.lineTo(cx + 14 * u, cy + 5 * u);
      ctx.moveTo(cx + 14 * u, cy - 5 * u);
      ctx.lineTo(cx + 6 * u, cy + 5 * u);
    } else {
      ctx.arc(cx + 3 * u, cy, 6 * u, -0.9, 0.9);
      ctx.moveTo(cx + 3 * u + Math.cos(-0.9) * 11 * u, cy + Math.sin(-0.9) * 11 * u);
      ctx.arc(cx + 3 * u, cy, 11 * u, -0.9, 0.9);
    }
    ctx.stroke();
    buttons.push({ id: 'mute', x, y, w: size, h: size, action: toggleMute });
  }

  function play(name, gain) {
    if (!audio || paused || !sfxBuffers[name]) return;
    const src = audio.createBufferSource();
    src.buffer = sfxBuffers[name];
    const g = audio.createGain();
    g.gain.value = gain;
    src.connect(g).connect(master);
    src.start();
  }

  function openStore() {
    play('tap', 1);
    if (window.FbPlayableAd && window.FbPlayableAd.onCTAClick) {
      window.FbPlayableAd.onCTAClick();
      return;
    }
    if (window.mraid && window.mraid.open) {
      window.mraid.open(STORE_URL);
      return;
    }
    if (window.ExitApi && window.ExitApi.exit) {
      window.ExitApi.exit();
      return;
    }
    window.open(STORE_URL, '_blank');
  }

  function tapGrab(wx, wy) {
    const e = engine;
    let best = -1, bestD = 36;
    e.holds.forEach((h, i) => {
      const d = Math.hypot(h.x - wx, h.y - wy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return;
    const h = e.holds[best];
    const valid = (id) => e.limbs[id].hold !== best && e.canGrab(id, best) && e.inReach(id, best);
    const hands = [Crux.LH, Crux.RH].filter(valid).sort((a, b) => e.limbs[b].y - e.limbs[a].y || Math.abs(e.limbs[a].x - h.x) - Math.abs(e.limbs[b].x - h.x));
    const feet = [Crux.LF, Crux.RF].filter(valid).sort((a, b) => e.limbs[b].y - e.limbs[a].y);
    const preferFeet = h.y > e.body.py - 10;
    const pick = preferFeet ? (feet[0] ?? hands[0]) : (hands[0] ?? feet[0]);
    if (pick === undefined) {
      flashes.push({ x: h.x, y: h.y, age: 0, life: 0.5, color: INK.border });
      return;
    }
    e.pressLimb(pick);
    e.move(h.x, h.y);
    e.release();
  }

  function point(ev) {
    return { x: ev.clientX, y: ev.clientY };
  }

  canvas.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    unlockAudio();
    idle = 0;
    const p = point(ev);
    const b = hit(p);
    if (b) {
      pressedButton = b;
      return;
    }
    if (state !== 'play' || !inWall(p) || activePointer !== null) return;
    activePointer = ev.pointerId;
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch (err) {
      activePointer = ev.pointerId;
    }
    const w = toWorld(p);
    const grabbed = engine.press(w.x, w.y);
    tap = grabbed ? null : { x: p.x, y: p.y, wx: w.x, wy: w.y };
  });

  canvas.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== activePointer) return;
    const p = point(ev);
    if (tap && Math.hypot(p.x - tap.x, p.y - tap.y) > 14) tap = null;
    const w = toWorld(p);
    engine.move(w.x, w.y);
    idle = 0;
  });

  function pointerEnd(ev) {
    const p = point(ev);
    if (pressedButton) {
      const b = hit(p);
      const action = b && b.id === pressedButton.id ? pressedButton.action : null;
      pressedButton = null;
      if (action) action();
      return;
    }
    if (ev.pointerId !== activePointer) return;
    activePointer = null;
    engine.release();
    if (tap && state === 'play') tapGrab(tap.wx, tap.wy);
    tap = null;
  }

  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);

  function updateHint(dt) {
    hintClock += dt;
    hintRefresh -= dt;
    const e = engine;
    if (state !== 'play' || e.phase !== 'CLIMB' || e.drag || e.aim) {
      hint = null;
      return;
    }
    const pumped = e.chalk > 0 && e.hands().some((s) => s.hold !== null && s.grip < 0.3);
    if (pumped) {
      if (!hint || hint.kind !== 'chalk') hintClock = 0;
      hint = { kind: 'chalk' };
      return;
    }
    const wait = firstMove ? 0.5 : 3.2;
    if (idle < wait) {
      hint = null;
      return;
    }
    if (!hint || hintRefresh <= 0) {
      const next = assist.spotter.decide(false);
      if (!hint || !next || next.kind !== hint.kind || next.limb !== hint.limb || next.hold !== hint.hold) hintClock = 0;
      hint = next;
      hintRefresh = 0.4;
    }
  }

  function update(dt) {
    clock += dt;
    if (state === 'play') {
      idle += dt;
      if (spotter) spotter.update(dt);
      const assisted = assist.update(dt);
      if (assisted) {
        const h = engine.holds[assisted.hold];
        flashes.push({ x: h.x, y: h.y, age: 0, life: 0.6, color: INK.accent });
      }
      engine.step(dt);
      handleCues();
      updateHint(dt);
      if (engine.over) {
        endTimer += dt;
        if (endTimer > (engine.phase === 'SENT' ? 1.1 : 0.5)) {
          prepareEndCard();
          state = 'end';
          setMusicLevel(MUSIC_DUCK, 0.6);
        }
      }
    } else {
      engine.step(dt);
      handleCues();
      if (demo && clock - endCard.at > 2.5 && !endCard.sent) retry();
    }
    flashes = flashes.filter((f) => (f.age += dt) < f.life);
  }

  function render(dt) {
    buttons = [];
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = INK.paper;
    ctx.fillRect(0, 0, W, H);
    drawWall();
    if (L.portrait) drawPortraitHud(); else drawLandscapeHud();
    if (state === 'end') {
      buttons = buttons.filter((b) => b.id.startsWith('cta') || b.id === 'mute');
      drawEndCard();
    }
    if (confetti.length) drawConfetti(dt);
  }

  function frame(now) {
    const dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (!paused) update(dt);
    render(paused ? 0 : dt);
    requestAnimationFrame(frame);
  }

  function setPaused(v) {
    paused = v;
    if (audio) {
      if (v && audio.state === 'running') audio.suspend();
      if (!v && audio.state === 'suspended') audio.resume();
    }
  }

  function start() {
    if (running) return;
    running = true;
    layout();
    newAttempt();
    window.addEventListener('resize', layout);
    document.addEventListener('visibilitychange', () => setPaused(document.hidden));
    requestAnimationFrame(frame);
  }

  function boot() {
    const m = window.mraid;
    if (!m) {
      start();
      return;
    }
    try {
      m.addEventListener('audioVolumeChange', (v) => {
        mutedByHost = v === 0;
        applyMute();
      });
    } catch (err) {
      mutedByHost = false;
    }
    const whenViewable = () => {
      if (m.isViewable()) start();
      m.addEventListener('viewableChange', (v) => {
        if (v) start();
        if (running) setPaused(!v);
      });
    };
    if (m.getState() === 'loading') m.addEventListener('ready', whenViewable);
    else whenViewable();
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();
