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
  const LOOKS = {
    tide: { bg: '#E9EDF0', contour: '#A9CBE6', seam: '#8DB4D6', rule: '#CFD6DD' },
    race: { bg: INK.wall, contour: INK.contour, seam: INK.seam, rule: INK.rule }
  };
  const TAPES = ['#C8683F', '#5980A6', '#7A8A5E', '#8C5E7A', '#2C455D', '#B0703A'];
  const STORE_URL = 'https://play.google.com/store/apps/details?id=com.kavri.sulden.crux';
  const ASSIST_DELAY = 0.9;
  const TIDE_AUTOSTART = 2.2;
  const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
  const BODY = 'Barlow, "Helvetica Neue", Arial, sans-serif';
  const PITCH = '40 problems across 5 crags. Tide, crumbling rock and night climbs.';

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
  const hash = location.hash;
  const demo = /demo/.test(hash);
  const MODE = /race/.test(hash) ? 'race' : /tide/.test(hash) ? 'tide' : (document.body.dataset.mode === 'race' ? 'race' : 'tide');
  const PROB = MODE === 'tide' ? TIDE_ROUTE : ROUTE;
  const PROB_KIT = MODE === 'tide' ? TIDE_KIT : KIT;
  const LOOK = LOOKS[MODE];
  const spacingSupported = 'letterSpacing' in ctx;
  const ART = loadArt();

  let W = 0, H = 0, DPR = 1, L = null;
  let engine, assist, spotter, rival;
  let attempt = 1;
  let bestHigh = 0;
  let state = 'play';
  let endTimer = 0;
  let endCard = null;
  let idle = 0;
  let touched = false;
  let grabs = 0;
  let hint = null;
  let hintClock = 0;
  let hintRefresh = 0;
  let flashes = [];
  let popups = [];
  let confetti = [];
  let buttons = [];
  let pressedButton = null;
  let activePointer = null;
  let tap = null;
  let running = false;
  let paused = false;
  let lastFrame = 0;
  let clock = 0;
  let playClock = 0;
  let shake = 0;
  let combo = 0;
  let lastGrab = -9;
  let meterMark = 0;
  let danger = false;
  let closest = Infinity;
  let midCta = null;
  let midCtaShown = false;
  let audio = null;
  let master = null;
  let musicGain = null;
  let musicSource = null;
  let muted = false;
  let mutedByHost = false;
  const MUSIC_LEVEL = 0.32;
  const MUSIC_DUCK = 0.16;
  const sfxBuffers = {};

  function loadArt() {
    const out = {};
    const node = document.getElementById('art');
    if (!node) return out;
    let data;
    try {
      data = JSON.parse(node.textContent);
    } catch (err) {
      return out;
    }
    for (const [name, src] of Object.entries(data)) {
      const img = new Image();
      img.src = src;
      out[name] = img;
    }
    return out;
  }

  function artReady(name) {
    const img = ART[name];
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }

  function newAttempt() {
    if (state === 'end') setMusicLevel(MUSIC_LEVEL, 0.8);
    engine = new Crux.Engine(PROB, PROB_KIT, L ? L.viewH : 560);
    assist = new FootAssist(engine, ASSIST_DELAY);
    spotter = demo ? new Crux.Spotter(engine, 0.9, 0.05, attempt) : null;
    rival = MODE === 'race' ? new Rival(ROUTE, 7 + attempt) : null;
    state = 'play';
    endTimer = 0;
    endCard = null;
    idle = 0;
    hint = null;
    hintClock = 0;
    flashes = [];
    popups = [];
    confetti = [];
    playClock = 0;
    combo = 0;
    lastGrab = -9;
    meterMark = Math.floor(engine.high / 100);
    danger = false;
    closest = Infinity;
    midCta = null;
    if (touched || demo) engine.tideRunning = true;
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
      const bottom = 92 * u;
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
    if (rival) rival.engine.setViewHeight(L.viewH);
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
    if (o.stroke) {
      ctx.lineWidth = o.strokeWidth || o.size * 0.18;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = o.stroke;
      ctx.strokeText(str, x, y);
    }
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
        ctx.save();
        ctx.strokeStyle = style.fill;
        ctx.globalAlpha *= 0.5 * (1 - pulse);
        ctx.lineWidth = 2;
        const g = 3 + pulse * 6 * L.u;
        ctx.strokeRect(x - g, y - g, w + g * 2, h + g * 2);
        ctx.restore();
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

  function progressOf(e) {
    const span = e.problem.ground - e.problem.holds[e.problem.top].y - 110;
    return Math.max(0, Math.min(1, (e.high - 110) / span));
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

  function drawHold(h, held, glow) {
    ctx.save();
    ctx.translate(h.x, h.y);
    if (glow) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 7);
      ctx.beginPath();
      ctx.arc(0, 2, 24 + pulse * 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200,104,63,${0.16 + pulse * 0.14})`;
      ctx.fill();
    }
    ctx.fillStyle = held ? INK.held : INK.paper;
    ctx.fill(HOLD_SHAPES[h.kind]);
    ctx.strokeStyle = glow ? INK.tape : INK.navy;
    ctx.lineWidth = glow ? 2.4 : 1.6;
    ctx.stroke(HOLD_SHAPES[h.kind]);
    ctx.strokeStyle = LOOK.seam;
    ctx.lineWidth = 1;
    ctx.stroke(HOLD_HATCH[h.kind]);
    ctx.restore();
  }

  function drawClimber(e, ghost) {
    const b = e.body;
    const K = Crux.K;
    const torsoFill = ghost ? INK.tape : INK.accentDeep;
    const lineInk = ghost ? '#8A4426' : INK.night;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const limb = (id, l1, l2, bend) => {
      const a = e.anchor(id);
      const s = e.limbs[id];
      const reach = Math.hypot(s.x - a[0], s.y - a[1]);
      let seg = Math.max(l1 * 0.45, Math.min(l1, reach * 0.6));
      if (seg * 2 < reach + 1) seg = reach / 2 + 1;
      const j = ik(a[0], a[1], s.x, s.y, seg, seg * (l2 / l1), bend);
      ctx.strokeStyle = lineInk;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(j[0], j[1]);
      ctx.lineTo(j[2], j[3]);
      ctx.stroke();
    };
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
    ctx.fillStyle = torsoFill;
    ctx.fill();
    ctx.strokeStyle = lineInk;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (!ghost) {
      const k = 0.3;
      ctx.strokeStyle = INK.contour;
      ctx.beginPath();
      ctx.moveTo(b.sx - nx * (sh - 2) + ax * k, b.sy - ny * (sh - 2) + ay * k);
      ctx.lineTo(b.sx + nx * (sh - 2) + ax * k, b.sy + ny * (sh - 2) + ay * k);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(e.headX, e.headY, 13, 0, Math.PI * 2);
    ctx.fillStyle = ghost ? '#B0573A' : INK.navy;
    ctx.fill();
    ctx.strokeStyle = lineInk;
    ctx.stroke();
    if (ghost) return;
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

  function drawWater(e, left, right, bottom) {
    const t = e.tideY;
    if (!isFinite(t) || t > bottom + 40) return;
    const wave = (x, phase, amp) => t + Math.sin(x / 22 + clock * 2.4 + phase) * amp + Math.sin(x / 9 - clock * 3.1) * 1.2;
    ctx.beginPath();
    ctx.moveTo(left, wave(left, 0, 3));
    for (let x = left; x <= right; x += 8) ctx.lineTo(x, wave(x, 0, 3));
    ctx.lineTo(right, bottom + 200);
    ctx.lineTo(left, bottom + 200);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, t, 0, t + 260);
    g.addColorStop(0, 'rgba(89,128,166,0.50)');
    g.addColorStop(1, 'rgba(44,69,93,0.82)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let x = left; x <= right; x += 8) {
      const y = wave(x, 0, 3);
      if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let x = left; x <= right; x += 8) {
      const y = wave(x, 1.7, 2.4) + 12;
      if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 14; i++) {
      const bx = left + ((i * 53.3 + clock * 9 * (i % 3 + 1)) % (right - left));
      const by = t + 20 + ((i * 37.1 - clock * 22 * (i % 2 + 1)) % 200 + 200) % 200;
      ctx.beginPath();
      ctx.arc(bx, by, 1.4 + (i % 3) * 0.6, 0, Math.PI * 2);
      ctx.fill();
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
    ctx.fillStyle = LOOK.bg;
    ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    ctx.setTransform(DPR * L.s, 0, 0, DPR * L.s, DPR * (wl.x - L.worldLeft * L.s + shakeX()), DPR * (wl.y - e.camera * L.s + shakeY()));
    const top = e.camera - 40;
    const bottom = e.camera + L.viewH + 40;
    const left = L.worldLeft - 12;
    const right = L.worldLeft + L.worldW + 12;

    ctx.strokeStyle = LOOK.contour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = Math.floor(top / 52) * 52; y < bottom; y += 52) {
      for (let x = Math.floor(left / 12) * 12, first = true; x <= right; x += 12, first = false) {
        const yy = y + Math.sin((x + y) / 74) * 9 + Math.sin(x / 31 + y / 120) * 3;
        if (first) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = LOOK.seam;
    ctx.beginPath();
    for (const x0 of [104, 262]) {
      for (let yy = top, first = true; yy < bottom; yy += 14, first = false) {
        const xx = x0 + Math.sin(yy / 96) * 11;
        if (first) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
      }
    }
    ctx.stroke();

    if (MODE === 'race') {
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
    }
    ctx.strokeStyle = LOOK.rule;
    ctx.lineWidth = 1.5;
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
      ctx.strokeStyle = LOOK.seam;
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

    const glowHold = hint && hint.kind === 'move' && state === 'play' ? hint.hold : -1;
    p.holds.forEach((h, i) => {
      if (h.y < top - 30 || h.y > bottom + 30) return;
      drawHold(h, e.heldBy(i), i === glowHold);
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

    if (rival) {
      ctx.globalAlpha = 0.5;
      drawClimber(rival.engine, true);
      ctx.globalAlpha = 1;
    }
    drawClimber(e, false);

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

    if (MODE === 'tide') drawWater(e, left, right, bottom);
    if (hint && state === 'play') drawHintWorld();
    drawPopupsWorld();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let m = p.ground - 100; m > p.wallTop; m -= 100) {
      const sp = toScreen(L.worldLeft, m);
      if (sp.y > wl.y - 20 && sp.y < wl.y + wl.h + 20) text(`${Math.round((p.ground - m) / 100)} m`, wl.x + 22 * L.s, sp.y + 3 * L.s, { size: 10 * L.s, color: INK.faint, spacing: 0.04 });
    }
    const topHold = p.holds[p.top];
    const tp = toScreen(topHold.x + 24, topHold.y + 4);
    text('TOP', tp.x, tp.y, { size: 11 * L.s, weight: 700, color: INK.navy, spacing: 0.06 });
    if (!e.bonus) {
      const bh = p.holds[p.bonus];
      const bp = toScreen(bh.x + 24, bh.y + 4);
      text('BONUS', bp.x, bp.y, { size: 10 * L.s, color: INK.tape, spacing: 0.06 });
    }
    if (rival) {
      const r = rival.engine;
      const rp = toScreen(r.headX, r.headY - 22);
      const o = { size: 10 * L.u, weight: 700, spacing: 0.1, color: INK.paper };
      const tw = measure(RIVAL.name, o) + 10 * L.u;
      rect(rp.x - tw / 2, rp.y - 13 * L.u, tw, 16 * L.u, INK.tape);
      text(RIVAL.name, rp.x, rp.y - 1 * L.u, Object.assign({ align: 'center' }, o));
    }
    drawDanger();
    drawProgressRail();
    drawHook();
    if (hint && state === 'play') drawHintCaption();
    drawMidCta();
    ctx.restore();
    muteButton();
  }

  function shakeX() {
    return shake > 0 ? Math.sin(clock * 90) * shake * 10 * L.u : 0;
  }

  function shakeY() {
    return shake > 0 ? Math.cos(clock * 77) * shake * 6 * L.u : 0;
  }

  function drawDanger() {
    if (MODE !== 'tide' || state !== 'play' || engine.phase !== 'CLIMB' || !engine.tideRunning) return;
    const gap = engine.tideGap;
    if (gap > 80) return;
    const k = Math.min(1, (80 - gap) / 50);
    const pulse = 0.6 + 0.4 * Math.sin(clock * 9);
    const wl = L.wall;
    const g = ctx.createLinearGradient(0, wl.y + wl.h, 0, wl.y + wl.h * 0.55);
    g.addColorStop(0, `rgba(200,104,63,${0.38 * k * pulse})`);
    g.addColorStop(1, 'rgba(200,104,63,0)');
    ctx.fillStyle = g;
    ctx.fillRect(wl.x, wl.y + wl.h * 0.55, wl.w, wl.h * 0.45);
  }

  function drawProgressRail() {
    const u = L.u;
    const wl = L.wall;
    const x = wl.x + wl.w - 14 * u;
    const y0 = wl.y + 62 * u, y1 = wl.y + wl.h - 70 * u;
    if (y1 - y0 < 60 * u) return;
    rect(x - 2 * u, y0, 4 * u, y1 - y0, 'rgba(44,69,93,0.18)');
    const py = y1 - (y1 - y0) * progressOf(engine);
    rect(x - 2 * u, py, 4 * u, y1 - py, INK.accent);
    rect(x - 1 * u, y0 - 18 * u, 2 * u, 18 * u, INK.night);
    ctx.fillStyle = INK.tape;
    ctx.beginPath();
    ctx.moveTo(x + 1 * u, y0 - 18 * u);
    ctx.lineTo(x + 12 * u, y0 - 13 * u);
    ctx.lineTo(x + 1 * u, y0 - 8 * u);
    ctx.closePath();
    ctx.fill();
    if (rival) {
      const ry = y1 - (y1 - y0) * progressOf(rival.engine);
      ctx.fillStyle = INK.tape;
      ctx.beginPath();
      ctx.arc(x, ry, 6 * u, 0, Math.PI * 2);
      ctx.fill();
      text('M', x, ry + 0.5 * u, { size: 8 * u, weight: 700, color: INK.paper, align: 'center', baseline: 'middle' });
    }
    ctx.fillStyle = INK.navy;
    ctx.beginPath();
    ctx.arc(x, py, 7 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = INK.paper;
    ctx.lineWidth = 2 * u;
    ctx.stroke();
  }

  function drawHook() {
    if (state !== 'play') return;
    const u = L.u;
    const wl = L.wall;
    const cx = wl.x + wl.w / 2;
    if (MODE === 'tide' && grabs === 0 && playClock < 6) {
      const pop = Math.min(1, playClock / 0.25);
      const wob = Math.sin(clock * 18) * 3 * u * (grabs === 0 ? 1 : 0);
      const size = 40 * u * (0.7 + 0.3 * pop);
      const y = wl.y + wl.h * 0.2;
      text("HE'S SLIPPING!", cx + wob, y, { size, weight: 700, color: INK.tape, align: 'center', stroke: INK.paper, strokeWidth: 7 * u, spacing: 0.02 });
      text('THE TIDE IS COMING IN', cx, y + 24 * u, { size: 14 * u, weight: 700, color: INK.navy, align: 'center', stroke: INK.paper, strokeWidth: 5 * u, spacing: 0.12 });
    }
    if (MODE === 'race' && playClock < 2.4) {
      const t = playClock;
      const label = t < 1.5 ? `BEAT ${RIVAL.name} TO THE TOP!` : 'GO!';
      const size = (t < 1.5 ? 32 : 64) * u * (t < 1.5 ? 1 : 1 + (2.4 - t) * 0.25);
      text(label, cx, wl.y + wl.h * 0.22, { size, weight: 700, color: t < 1.5 ? INK.navy : INK.tape, align: 'center', stroke: INK.paper, strokeWidth: 7 * u });
    }
  }

  function handHint() {
    const e = engine;
    const s = assist.spotter;
    const top = e.problem.top;
    const lh = e.limbs[Crux.LH], rh = e.limbs[Crux.RH];
    if (e.chalk > 0 && e.hands().some((h) => h.hold !== null && h.grip < 0.3)) return { kind: 'chalk' };
    if ((lh.hold === top) !== (rh.hold === top)) {
      const other = lh.hold === top ? Crux.RH : Crux.LH;
      if (e.canGrab(other, top) && e.inReach(other, top, 4)) return { kind: 'move', limb: other, hold: top };
    }
    for (const hand of [Crux.LH, Crux.RH]) {
      if (e.limbs[hand].hold !== null) continue;
      const pick = s.bestHand(hand, true);
      if (pick !== null) return { kind: 'move', limb: hand, hold: pick };
    }
    for (const hand of [lh, rh].sort((a, b) => b.y - a.y)) {
      const pick = s.bestHand(hand.limb.id, false);
      if (pick !== null) return { kind: 'move', limb: hand.limb.id, hold: pick };
    }
    return null;
  }

  function hintCopy(h) {
    if (h.kind === 'chalk') return 'GRIP LOW! TAP CHALK';
    if (h.hold === engine.problem.top) return 'GRAB THE TOP!';
    if (grabs === 0) return MODE === 'tide' ? 'TAP THE HOLD TO GRAB IT' : 'TAP A HOLD TO CLIMB';
    return 'TAP THE NEXT HOLD';
  }

  function drawHintWorld() {
    if (hint.kind !== 'move') return;
    const h = engine.holds[hint.hold];
    const s = engine.limbs[hint.limb];
    ctx.setLineDash([4, 5]);
    ctx.strokeStyle = 'rgba(200,104,63,0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const t = (hintClock % 1.1) / 1.1;
    const down = t > 0.35 && t < 0.6;
    const lift = down ? 0 : Math.sin(Math.min(1, Math.abs(t - 0.47) * 3) * Math.PI / 2) * 14;
    if (t > 0.45 && t < 0.95) {
      const r = (t - 0.45) / 0.5;
      ctx.globalAlpha = 1 - r;
      ctx.strokeStyle = INK.tape;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 10 + r * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawFinger(h.x, h.y + lift, down);
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
    const o = { size: 15 * u, weight: 700, spacing: 0.08, color: INK.paper };
    const lines = wrap(label, L.wall.w - 70 * u, o);
    const lh = 19 * u;
    const w = Math.max(...lines.map((l) => measure(l, o))) + 26 * u;
    const h = lines.length * lh + 14 * u;
    const x = L.wall.x + (L.wall.w - w) / 2;
    const y = L.wall.y + L.wall.h - h - 16 * u;
    rect(x, y, w, h, INK.navy);
    rect(x, y + h - 3 * u, w, 3 * u, INK.tape);
    lines.forEach((l, i) => text(l, x + w / 2, y + 7 * u + lh * (i + 0.75), Object.assign({ align: 'center' }, o)));
  }

  function addPopup(str, x, y, color, size) {
    popups.push({ str, x, y, color, size, age: 0, life: 1.0 });
  }

  function drawPopupsWorld() {
    for (const p of popups) {
      const t = p.age / p.life;
      const pop = t < 0.15 ? 0.6 + t / 0.15 * 0.6 : 1.2 - Math.min(0.2, (t - 0.15));
      ctx.globalAlpha = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      text(p.str, p.x, p.y - t * 46, { size: p.size * pop, weight: 700, color: p.color, align: 'center', stroke: INK.paper, strokeWidth: p.size * 0.22, spacing: 0.04 });
      ctx.globalAlpha = 1;
    }
  }

  function drawMidCta() {
    if (!midCta || state !== 'play') return;
    const u = L.u;
    const t = clock - midCta;
    if (t > 4.5) {
      midCta = null;
      return;
    }
    const k = Math.min(1, t / 0.3, (4.5 - t) / 0.3);
    const w = Math.min(L.wall.w - 70 * u, 300 * u), h = 44 * u;
    const x = L.wall.x + (L.wall.w - w) / 2 - 10 * u;
    const y = L.wall.y + 12 * u - (1 - k) * 60 * u;
    rect(x, y, w, h, INK.paper, INK.navy, 1);
    const icon = artReady('icon');
    let tx = x + 10 * u;
    if (icon) {
      ctx.drawImage(icon, x + 6 * u, y + 6 * u, h - 12 * u, h - 12 * u);
      tx = x + h;
    }
    text('LOVING IT?', tx, y + 18 * u, { size: 12 * u, weight: 700, spacing: 0.08, color: INK.tape });
    text('40 more climbs in Crux', tx, y + 34 * u, { size: 12 * u, family: BODY, weight: 400, color: INK.sub });
    button('cta-mid', x + w - 74 * u, y + 7 * u, 66 * u, h - 14 * u, 'PLAY', { fill: INK.navy, size: 13 * u }, openStore);
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
    const cx = x + w / 2, cy = y + h / 2 - 7 * u;
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
    for (const [dx, dy] of [[-3, -10], [2, -12], [5, -9]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * u, cy + dy * u, 1.4 * u, 0, Math.PI * 2);
      ctx.fillStyle = INK.faint;
      ctx.fill();
    }
    text(`CHALK ${engine.chalk}`, cx, y + h / 2 + 17 * u, { size: 13 * u, weight: 700, spacing: 0.1, align: 'center' });
    buttons.push({ id: 'chalk', x, y, w, h, action: () => engine.chalkUp() });
  }

  function titleBlock(x, y) {
    const u = L.u;
    rect(x, y + 3 * u, 4 * u, 30 * u, PROB.tape);
    const o = { size: 17 * u, weight: 700 };
    text(PROB.name.toUpperCase(), x + 12 * u, y + 17 * u, o);
    text(PROB.grade, x + 12 * u + measure(PROB.name.toUpperCase(), o) + 8 * u, y + 17 * u, { size: 17 * u, weight: 500, color: INK.faint });
    const sub = MODE === 'tide' ? `Beat the tide · Attempt ${attempt}` : `Race vs ${RIVAL.name[0]}${RIVAL.name.slice(1).toLowerCase()} · Attempt ${attempt}`;
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
    titleBlock(12 * u, topH / 2 - 19 * u);
    const ctaW = 82 * u, ctaH = 34 * u;
    button('cta-top', W - ctaW - 12 * u, (topH - ctaH) / 2, ctaW, ctaH, 'PLAY', { fill: INK.navy, size: 14 * u }, openStore);
    text(heightLabel(), W - ctaW - 24 * u, topH / 2 + 4 * u, { size: 13 * u, spacing: 0.12, color: INK.accentDeep, align: 'right' });

    const p = L.panel;
    rect(p.x, p.y, p.w, p.h, INK.paper);
    rect(p.x, p.y, p.w, 1, INK.frame);
    const pad = 12 * u;
    const chalkW = 92 * u;
    const mw = W - pad * 3 - chalkW;
    gripMeter(pad, p.y + 10 * u, mw, 'LEFT HAND', engine.limbs[0].grip);
    gripMeter(pad, p.y + 46 * u, mw, 'RIGHT HAND', engine.limbs[1].grip);
    chalkButton(W - pad - chalkW, p.y + 10 * u, chalkW, p.h - 20 * u);
  }

  function drawLandscapeHud() {
    const u = L.u;
    const lp = L.side.left, rp = L.side.right;
    rect(lp.x, lp.y, lp.w, lp.h, INK.paper);
    rect(lp.x + lp.w - 1, 0, 1, H, INK.frame);
    rect(rp.x, rp.y, rp.w, rp.h, INK.paper);
    rect(rp.x, 0, 1, H, INK.frame);
    const pad = 14 * u;
    titleBlock(pad, pad);
    text('HEIGHT', pad, pad + 66 * u, { size: 11 * u, spacing: 0.14, color: INK.sub });
    text(heightLabel(), pad, pad + 96 * u, { size: 30 * u, weight: 700, color: INK.accentDeep });
    const mw = lp.w - pad * 2;
    gripMeter(pad, pad + 116 * u, mw, 'LEFT HAND', engine.limbs[0].grip);
    gripMeter(pad, pad + 152 * u, mw, 'RIGHT HAND', engine.limbs[1].grip);
    const chalkH = Math.min(62 * u, H - (pad + 196 * u) - pad);
    chalkButton(pad, pad + 196 * u, mw, Math.max(44 * u, chalkH));

    const cx = rp.x + rp.w / 2;
    const y = H * 0.12;
    const icon = artReady('icon');
    if (icon) ctx.drawImage(icon, cx - 32 * u, y, 64 * u, 64 * u);
    text('CRUX', cx, y + 112 * u, { size: 46 * u, weight: 700, align: 'center', spacing: 0.04 });
    text('BOULDERING', cx, y + 132 * u, { size: 13 * u, spacing: 0.3, color: INK.tape, align: 'center' });
    const pitch = wrap(PITCH, rp.w - pad * 2, { size: 13 * u, family: BODY, weight: 400 });
    pitch.forEach((l, i) => text(l, cx, y + 160 * u + i * 17 * u, { size: 13 * u, family: BODY, weight: 400, color: INK.sub, align: 'center' }));
    const bw = rp.w - pad * 2, bh = 48 * u;
    button('cta-side', rp.x + pad, H - pad - bh, bw, bh, 'PLAY FREE', { fill: INK.navy, size: 16 * u, pulse: true }, openStore);
  }

  function prepareEndCard() {
    const e = engine;
    const won = MODE === 'race' ? e.phase === 'SENT' && !rival.sent : e.phase === 'SENT';
    const higher = !won && e.high > bestHigh + 30 && attempt > 1;
    bestHigh = Math.max(bestHigh, e.high);
    let headline, line, stats;
    const height = `${(e.high / 100).toFixed(1)} m`;
    if (MODE === 'tide') {
      const gapCm = Math.max(1, Math.round(closest));
      stats = [['TIME', fmtTime(e.time)], ['HEIGHT', height], ['CLOSEST', `${gapCm} cm`]];
      if (won) {
        headline = 'SAVED!';
        line = gapCm < 50 ? `The sea was ${gapCm} cm from your feet. Out in ${fmtTime(e.time)}.` : `You beat the tide in ${fmtTime(e.time)}.`;
      } else {
        headline = 'SPLASH!';
        const lead = higher ? 'Higher than last time. ' : '';
        line = lead + (e.cause === 'TIDE' ? 'The water caught you. Keep tapping, the next hold is closer than it looks.' : 'Your grip gave out. Keep moving and rest on the big holds.');
      }
    } else {
      const r = rival.engine;
      stats = [['YOU', height], [RIVAL.name, `${(r.high / 100).toFixed(1)} m`], ['TIME', fmtTime(e.time)]];
      if (won) {
        headline = 'YOU WON!';
        const behind = Math.max(0.1, (PROB.ground - PROB.holds[PROB.top].y - r.high) / 100);
        line = `${RIVAL.name[0]}${RIVAL.name.slice(1).toLowerCase()} was still ${behind.toFixed(1)} m below the top.`;
      } else {
        headline = `${RIVAL.name} WON`;
        line = e.phase === 'FELL' ? 'You came off the wall. Rematch?' : `${RIVAL.name[0]}${RIVAL.name.slice(1).toLowerCase()} topped out first. You were at ${height}. Rematch?`;
      }
    }
    endCard = { won, headline, line, stats, at: clock };
    document.body.dataset.phase = won ? 'sent' : 'fell';
  }

  function drawLock(x, y, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.arc(x, y - 3 * s, 4.5 * s, Math.PI, 0);
    ctx.stroke();
    rect(x - 7 * s, y - 3 * s, 14 * s, 11 * s, color);
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
    const slot = c.won ? 'hero' : 'fail';
    const hero = artReady(`${slot}_${MODE}`) || artReady(slot) || artReady(`hero_${MODE}`);
    const heroH = hero ? Math.min(140 * u, inner * hero.naturalHeight / hero.naturalWidth) : 0;
    const headSize = Math.min(52 * u, inner / Math.max(4, c.headline.length) * 1.9);
    const ch = pad + 40 * u + (heroH ? heroH + 12 * u : 0) + headSize + 8 * u + lines.length * 19 * u + 16 * u + 58 * u + 12 * u + 30 * u + 14 * u + 50 * u + 10 * u + 44 * u + pad;
    const cx = (W - cw) / 2;
    const cy = Math.max(12 * u, (H - ch) / 2) + (1 - t) * 30 * u;
    ctx.globalAlpha = t;
    rect(cx, cy, cw, ch, INK.paper, INK.navy, 1);
    cornerTicks(cx, cy, cw, ch, 5 * u, 9 * u, INK.navy);
    let y = cy + pad;
    const icon = artReady('icon');
    let bx = cx + pad;
    if (icon) {
      ctx.drawImage(icon, bx, y, 32 * u, 32 * u);
      bx += 40 * u;
    }
    text('CRUX', bx, y + 15 * u, { size: 17 * u, weight: 700, spacing: 0.06 });
    text(`${PROB.name.toUpperCase()} · ${PROB.grade}`, bx, y + 30 * u, { size: 11 * u, weight: 600, spacing: 0.14, color: INK.tape });
    y += 40 * u;
    if (hero) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx + pad, y, inner, heroH);
      ctx.clip();
      const scale = Math.max(inner / hero.naturalWidth, heroH / hero.naturalHeight);
      const iw = hero.naturalWidth * scale, ih = hero.naturalHeight * scale;
      ctx.drawImage(hero, cx + pad + (inner - iw) / 2, y + (heroH - ih) / 2, iw, ih);
      ctx.restore();
      rect(cx + pad, y, inner, heroH, null, INK.frame, 1);
      y += heroH + 12 * u;
    }
    y += headSize;
    text(c.headline, cx + pad, y, { size: headSize, weight: 700, color: c.won ? INK.tape : INK.navy });
    y += 8 * u;
    lines.forEach((l) => {
      y += 19 * u;
      text(l, cx + pad, y - 4 * u, Object.assign({ color: INK.body }, lineO));
    });
    y += 12 * u;
    rect(cx + pad, y, inner, 1, INK.divider);
    const sw = inner / 3;
    c.stats.forEach(([k, v], i) => {
      text(k, cx + pad + sw * i, y + 20 * u, { size: 11 * u, spacing: 0.14, color: INK.sub });
      text(v, cx + pad + sw * i, y + 44 * u, { size: 22 * u, weight: 700, color: INK.text });
    });
    y += 58 * u;
    rect(cx + pad, y, inner, 1, INK.divider);
    y += 12 * u;
    rect(cx + pad, y, inner, 30 * u, '#E7EBEF');
    drawLock(cx + pad + 16 * u, y + 14 * u, u, INK.navy);
    text('NEXT CRAG: NIGHT BOULDERS', cx + pad + 32 * u, y + 19.5 * u, { size: 12 * u, weight: 700, spacing: 0.1, color: INK.navy });
    y += 30 * u + 14 * u;
    const primaryCta = c.won || attempt >= 2;
    const retryLabel = c.won ? (MODE === 'race' ? 'RACE AGAIN' : 'CLIMB AGAIN') : (MODE === 'race' ? 'REMATCH' : 'TRY AGAIN');
    if (primaryCta) {
      button('cta-end', cx + pad, y, inner, 50 * u, c.won ? 'PLAY CRUX FREE' : 'GET CRUX, TRAIN HARDER', { fill: INK.navy, size: 16 * u, pulse: true }, openStore);
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
    LANDED: [MODE === 'tide' ? 'tide' : 'land', 1, 50],
    TIDE: ['tide', 0.7, 30]
  };

  function handleCues() {
    for (const cue of engine.drainCues()) {
      const fx = CUE_SFX[cue];
      if (fx) {
        play(fx[0], fx[1]);
        vibrate(fx[2]);
      }
      if (cue === 'GRAB_HAND') onHandGrab();
      if (cue === 'BONUS') {
        const b = engine.holds[engine.problem.bonus];
        flashes.push({ x: b.x, y: b.y, age: 0, life: 0.7, color: INK.tape });
        addPopup('BONUS!', b.x, b.y - 26, INK.tape, 26);
        shake = Math.max(shake, 0.35);
        if (!midCtaShown) {
          midCta = clock + 0.6;
          midCtaShown = true;
        }
      }
      if (cue === 'SENT') {
        spawnConfetti();
        shake = Math.max(shake, 0.4);
      }
      if (cue === 'FALL') shake = Math.max(shake, 0.5);
    }
  }

  function onHandGrab() {
    grabs++;
    combo = clock - lastGrab < 1.3 ? combo + 1 : 1;
    lastGrab = clock;
    const e = engine;
    const words = { 3: 'NICE!', 4: 'GREAT!', 5: 'AWESOME!' };
    if (combo >= 3) {
      const word = combo >= 6 ? 'ON FIRE!' : words[combo];
      addPopup(`${word} x${combo}`, e.headX, e.headY - 40, combo >= 5 ? INK.tape : INK.accentDeep, 22 + Math.min(combo, 6));
      shake = Math.max(shake, 0.12);
    }
  }

  function trackProgress() {
    const e = engine;
    const m = Math.floor(e.high / 100);
    if (m > meterMark && e.phase === 'CLIMB') {
      meterMark = m;
      addPopup(`${m} M`, e.headX + 34, e.headY, INK.navy, 18);
    }
    if (MODE !== 'tide' || e.phase !== 'CLIMB' || !e.tideRunning) return;
    const gap = e.tideGap;
    closest = Math.min(closest, Math.max(0, gap - 40));
    if (gap < 48) danger = true;
    if (danger && gap > 115) {
      danger = false;
      addPopup('CLOSE ONE!', e.headX, e.headY - 44, INK.tape, 26);
      shake = Math.max(shake, 0.3);
      vibrate(25);
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
    let best = -1, bestD = 44;
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
    const hands = [Crux.LH, Crux.RH].filter(valid).sort((a, b) => (e.limbs[a].hold === null ? -1 : 0) - (e.limbs[b].hold === null ? -1 : 0) || e.limbs[b].y - e.limbs[a].y);
    const feet = [Crux.LF, Crux.RF].filter(valid).sort((a, b) => e.limbs[b].y - e.limbs[a].y);
    const preferFeet = h.y > e.body.py - 10;
    const pick = preferFeet ? (feet[0] ?? hands[0]) : (hands[0] ?? feet[0]);
    if (pick === undefined) {
      flashes.push({ x: h.x, y: h.y, age: 0, life: 0.5, color: INK.border });
      addPopup('TOO FAR', h.x, h.y - 20, INK.faint, 14);
      return;
    }
    e.pressLimb(pick);
    e.move(h.x, h.y);
    e.release();
  }

  function point(ev) {
    return { x: ev.clientX, y: ev.clientY };
  }

  function firstTouch() {
    if (touched) return;
    touched = true;
    if (engine) engine.tideRunning = true;
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
    firstTouch();
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
    const wait = grabs === 0 ? (MODE === 'tide' ? 0.9 : 1.6) : 1.8;
    if (!pumped && idle < wait) {
      hint = null;
      return;
    }
    if (!hint || hintRefresh <= 0 || (pumped && hint.kind !== 'chalk')) {
      const next = handHint();
      if (!hint || !next || next.kind !== hint.kind || next.limb !== hint.limb || next.hold !== hint.hold) hintClock = 0;
      hint = next;
      hintRefresh = 0.4;
    }
  }

  function update(dt) {
    clock += dt;
    shake = Math.max(0, shake - dt * 1.6);
    if (state === 'play') {
      playClock += dt;
      idle += dt;
      if (MODE === 'tide' && !engine.tideRunning && playClock > TIDE_AUTOSTART) engine.tideRunning = true;
      if (spotter) spotter.update(dt);
      const assisted = assist.update(dt);
      if (assisted) {
        const h = engine.holds[assisted.hold];
        flashes.push({ x: h.x, y: h.y, age: 0, life: 0.6, color: INK.accent });
      }
      engine.step(dt);
      if (rival && playClock > 1.5) rival.update(dt, engine);
      handleCues();
      trackProgress();
      updateHint(dt);
      const raceLost = rival && rival.sent && engine.phase !== 'SENT';
      if (engine.over || raceLost) {
        endTimer += dt;
        if (endTimer > (engine.phase === 'SENT' ? 1.1 : raceLost ? 0.6 : 0.5)) {
          prepareEndCard();
          state = 'end';
          setMusicLevel(MUSIC_DUCK, 0.6);
        }
      }
    } else {
      engine.step(dt);
      if (rival) rival.update(dt, engine);
      handleCues();
      if (demo && clock - endCard.at > 2.5 && !endCard.won) retry();
    }
    if (MODE === 'tide' && engine.phase === 'SENT' && isFinite(engine.tideY)) engine.tideY += 90 * dt;
    flashes = flashes.filter((f) => (f.age += dt) < f.life);
    popups = popups.filter((p) => (p.age += dt) < p.life);
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
