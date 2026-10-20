/* Flappy Bird - a simple browser game.
 * Everything (bird, pipes, sky, ground, sound) is generated in code.
 */
(() => {
  'use strict';

  // ---------- Constants (logical game units) ----------
  const W = 400;              // logical width
  const H = 700;              // logical height
  const GROUND_H = 100;       // ground strip height
  const PLAY_H = H - GROUND_H;
  const GRAVITY = 1600;       // px / s^2
  const FLAP_V = -470;        // px / s
  const MAX_FALL = 720;       // terminal velocity
  const PIPE_W = 72;
  const PIPE_GAP = 165;
  const PIPE_SPACING = 230;   // horizontal distance between pipes
  const SPEED = 160;          // world scroll speed px / s
  const BIRD_X = 120;
  const BIRD_R = 15;          // collision radius
  const STEP = 1 / 120;       // fixed physics step
  const BEST_KEY = 'flappy-bird-2026-10-20:best';
  const MUTE_KEY = 'flappy-bird-2026-10-20:muted';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const muteBtn = document.getElementById('mute');

  // ---------- Storage helpers ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* ignore */ } },
  };

  // ---------- Audio (WebAudio synthesis) ----------
  const audio = {
    ctx: null,
    muted: store.get(MUTE_KEY, '0') === '1',
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
    },
    tone(type, f0, f1, dur, vol = 0.2, delay = 0) {
      if (this.muted || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.3) {
      if (this.muted || !this.ctx) return;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      const g = this.ctx.createGain();
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1400;
      g.gain.value = vol;
      src.buffer = buf;
      src.connect(f).connect(g).connect(this.ctx.destination);
      src.start();
    },
    flap() { this.tone('square', 420, 780, 0.09, 0.08); },
    score() { this.tone('sine', 880, 880, 0.08, 0.18); this.tone('sine', 1320, 1320, 0.14, 0.18, 0.08); },
    hit() { this.noise(0.18, 0.35); this.tone('triangle', 220, 90, 0.2, 0.25); },
    die() { this.tone('sawtooth', 520, 110, 0.55, 0.1, 0.15); },
    swoosh() { this.tone('sine', 300, 900, 0.18, 0.08); },
  };

  // ---------- Game state ----------
  const game = {
    state: 'start',          // 'start' | 'play' | 'over'
    score: 0,
    best: parseInt(store.get(BEST_KEY, '0'), 10) || 0,
    newBest: false,
    time: 0,
    overTime: 0,
    groundX: 0,
    dist: 0,
    flash: 0,
    shake: 0,
    bird: { y: PLAY_H * 0.45, vy: 0, rot: 0, wing: 0 },
    pipes: [],
    clouds: [],
    particles: [],
    flaps: 0,
  };

  function rand(a, b) { return a + Math.random() * (b - a); }

  function initClouds() {
    game.clouds = [];
    for (let i = 0; i < 6; i++) {
      game.clouds.push({ x: rand(0, W), y: rand(40, 260), s: rand(0.6, 1.3), v: rand(10, 25) });
    }
  }

  function resetRound() {
    game.score = 0;
    game.newBest = false;
    game.flaps = 0;
    game.bird.y = PLAY_H * 0.45;
    game.bird.vy = 0;
    game.bird.rot = 0;
    game.pipes = [];
    game.particles = [];
    let x = W + 120;
    for (let i = 0; i < 3; i++) { addPipe(x); x += PIPE_SPACING; }
  }

  function addPipe(x) {
    const minTop = 70;
    const maxTop = PLAY_H - PIPE_GAP - 70;
    game.pipes.push({ x, top: rand(minTop, maxTop), passed: false });
  }

  function startGame() {
    resetRound();
    game.state = 'play';
    flapBird();
  }

  function flapBird() {
    game.bird.vy = FLAP_V;
    game.flaps++;
    audio.flap();
    for (let i = 0; i < 4; i++) {
      game.particles.push({ x: BIRD_X - 12, y: game.bird.y + 6, vx: rand(-120, -40), vy: rand(-30, 60), life: 0.4, max: 0.4 });
    }
  }

  function gameOver() {
    if (game.state !== 'play') return;
    game.state = 'over';
    game.overTime = game.time;
    game.flash = 1;
    game.shake = 0.3;
    audio.hit();
    audio.die();
    if (game.score > game.best) {
      game.best = game.score;
      game.newBest = true;
      store.set(BEST_KEY, game.best);
    }
  }

  // ---------- Input ----------
  function press() {
    audio.ensure();
    if (game.state === 'start') { startGame(); }
    else if (game.state === 'play') { flapBird(); }
    else if (game.state === 'over') {
      // short delay prevents accidental instant restart
      if (game.time - game.overTime > 0.6) { audio.swoosh(); game.state = 'start'; resetRound(); }
    }
  }

  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) press();
    } else if (e.code === 'Enter' || e.code === 'KeyR') {
      if (game.state === 'over') press();
    } else if (e.code === 'KeyM') {
      toggleMute();
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function toggleMute() {
    audio.muted = !audio.muted;
    store.set(MUTE_KEY, audio.muted ? '1' : '0');
    updateMuteBtn();
  }
  function updateMuteBtn() {
    muteBtn.textContent = audio.muted ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', audio.muted ? 'Unmute sound' : 'Mute sound');
    muteBtn.setAttribute('aria-pressed', audio.muted ? 'true' : 'false');
  }
  muteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  muteBtn.addEventListener('click', (e) => { e.stopPropagation(); audio.ensure(); toggleMute(); muteBtn.blur(); });
  updateMuteBtn();

  // ---------- Resize / scaling ----------
  let scale = 1;
  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    scale = Math.min(vw / W, vh / H);
    const cssW = Math.floor(W * scale);
    const cssH = Math.floor(H * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    const left = (vw - cssW) / 2;
    const top = (vh - cssH) / 2;
    muteBtn.style.left = (left + cssW - 54) + 'px';
    muteBtn.style.top = (top + 10) + 'px';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  // ---------- Update ----------
  function circleRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  }

  function update(dt) {
    game.time += dt;
    const b = game.bird;
    b.wing += dt * (game.state === 'over' ? 0 : 14);

    for (const c of game.clouds) {
      c.x -= c.v * dt * (game.state === 'over' ? 0.2 : 1);
      if (c.x < -120 * c.s) { c.x = W + 60; c.y = rand(40, 260); c.s = rand(0.6, 1.3); }
    }

    if (game.state !== 'over') {
      game.groundX = (game.groundX - SPEED * dt) % 24;
      game.dist += SPEED * dt;
    }

    if (game.state === 'start') {
      b.y = PLAY_H * 0.45 + Math.sin(game.time * 3) * 10;
      b.rot = 0;
    } else if (game.state === 'play') {
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
      b.y += b.vy * dt;
      b.rot = Math.max(-0.45, Math.min(1.4, b.vy / 500));

      for (const p of game.pipes) {
        p.x -= SPEED * dt;
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          game.score++;
          audio.score();
        }
        if (circleRect(BIRD_X, b.y, BIRD_R, p.x, -1000, PIPE_W, p.top + 1000) ||
            circleRect(BIRD_X, b.y, BIRD_R, p.x, p.top + PIPE_GAP, PIPE_W, H)) {
          gameOver();
        }
      }
      if (game.pipes.length && game.pipes[0].x < -PIPE_W - 10) {
        game.pipes.shift();
        addPipe(game.pipes[game.pipes.length - 1].x + PIPE_SPACING);
      }
      if (b.y - BIRD_R < -40) { b.y = -40 + BIRD_R; b.vy = 0; }
      if (b.y + BIRD_R >= PLAY_H) { b.y = PLAY_H - BIRD_R; gameOver(); }
    } else if (game.state === 'over') {
      // let the bird fall to the ground
      if (b.y + BIRD_R < PLAY_H) {
        b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
        b.y = Math.min(PLAY_H - BIRD_R, b.y + b.vy * dt);
        b.rot = Math.min(1.57, b.rot + dt * 6);
      }
    }

    for (const p of game.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    game.particles = game.particles.filter((p) => p.life > 0);
    game.flash = Math.max(0, game.flash - dt * 3);
    game.shake = Math.max(0, game.shake - dt);
  }

  // ---------- Drawing ----------
  const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_H);
  skyGrad.addColorStop(0, '#4ec0ca');
  skyGrad.addColorStop(1, '#bfeff2');

  function drawCloud(x, y, s) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.arc(26, -10, 28, 0, Math.PI * 2);
    ctx.arc(56, 0, 22, 0, Math.PI * 2);
    ctx.arc(28, 8, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBackground() {
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, PLAY_H);
    for (const c of game.clouds) drawCloud(c.x, c.y, c.s);

    // distant city skyline (parallax)
    const off = -((game.dist * 0.4) % 60);
    const cityOffset = -((game.dist * 0.15) % 240);
    ctx.fillStyle = '#a3dfd0';
    for (let k = -1; k < 3; k++) {
      const bx = k * 240 + cityOffset;
      const hs = [60, 95, 75, 120, 55, 100, 80, 65];
      for (let i = 0; i < 8; i++) ctx.fillRect(bx + i * 30, PLAY_H - 40 - hs[i], 28, hs[i] + 40);
    }
    ctx.fillStyle = '#c9f0e4';
    for (let k = -1; k < 3; k++) {
      const bx = k * 240 + cityOffset;
      const hs = [60, 95, 75, 120, 55, 100, 80, 65];
      for (let i = 0; i < 8; i++) for (let w = PLAY_H - 30 - hs[i]; w < PLAY_H - 50; w += 14) ctx.fillRect(bx + i * 30 + 6, w, 5, 6);
    }
    // bushes
    ctx.fillStyle = '#5ec26a';
    for (let x = off; x < W + 60; x += 60) {
      ctx.beginPath(); ctx.arc(x, PLAY_H - 8, 34, Math.PI, 0); ctx.fill();
    }
  }

  function drawPipe(p) {
    const lip = 26;
    const grad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_W, 0);
    grad.addColorStop(0, '#5aa832');
    grad.addColorStop(0.3, '#9be15d');
    grad.addColorStop(1, '#3d7a1f');
    ctx.fillStyle = grad;
    ctx.strokeStyle = '#2b4a17';
    ctx.lineWidth = 3;
    // top pipe body
    ctx.fillRect(p.x + 4, -4, PIPE_W - 8, p.top - lip + 4);
    ctx.strokeRect(p.x + 4, -4, PIPE_W - 8, p.top - lip + 4);
    // top lip
    ctx.fillRect(p.x - 2, p.top - lip, PIPE_W + 4, lip);
    ctx.strokeRect(p.x - 2, p.top - lip, PIPE_W + 4, lip);
    // bottom pipe
    const by = p.top + PIPE_GAP;
    ctx.fillRect(p.x + 4, by + lip, PIPE_W - 8, PLAY_H - by - lip + 4);
    ctx.strokeRect(p.x + 4, by + lip, PIPE_W - 8, PLAY_H - by - lip + 4);
    ctx.fillRect(p.x - 2, by, PIPE_W + 4, lip);
    ctx.strokeRect(p.x - 2, by, PIPE_W + 4, lip);
    // highlights
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(p.x + 10, 0, 6, p.top - lip - 2);
    ctx.fillRect(p.x + 4, p.top - lip + 4, 6, lip - 8);
    ctx.fillRect(p.x + 10, by + lip + 2, 6, PLAY_H - by - lip);
    ctx.fillRect(p.x + 4, by + 4, 6, lip - 8);
  }

  function drawGround() {
    ctx.fillStyle = '#ded895';
    ctx.fillRect(0, PLAY_H, W, GROUND_H);
    ctx.fillStyle = '#73bf2e';
    ctx.fillRect(0, PLAY_H, W, 16);
    ctx.fillStyle = '#9be15d';
    for (let x = game.groundX - 24; x < W + 24; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, PLAY_H + 16); ctx.lineTo(x + 12, PLAY_H); ctx.lineTo(x + 24, PLAY_H); ctx.lineTo(x + 12, PLAY_H + 16);
      ctx.fill();
    }
    ctx.fillStyle = '#543847';
    ctx.fillRect(0, PLAY_H - 2, W, 3);
    ctx.fillStyle = '#c9c27a';
    ctx.fillRect(0, PLAY_H + 16, W, 4);
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let x = -((game.dist) % 48); x < W; x += 48) ctx.fillRect(x, PLAY_H + 40, 24, 6);
  }

  function drawBird() {
    const b = game.bird;
    ctx.save();
    ctx.translate(BIRD_X, b.y);
    ctx.rotate(b.rot);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#543847';
    // body
    ctx.fillStyle = '#f8d630';
    ctx.beginPath(); ctx.ellipse(0, 0, 20, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // belly
    ctx.fillStyle = '#fbeea0';
    ctx.beginPath(); ctx.ellipse(-2, 7, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
    // wing
    const wy = Math.sin(b.wing) * 6;
    ctx.fillStyle = '#fff6d0';
    ctx.beginPath(); ctx.ellipse(-8, 1 + wy * 0.5, 10, 6 + Math.abs(wy) * 0.3, -0.2 + wy * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(9, -6, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.arc(11, -6, 3, 0, Math.PI * 2); ctx.fill();
    // beak
    ctx.fillStyle = '#f0732b';
    ctx.beginPath(); ctx.moveTo(12, 1); ctx.lineTo(28, 4); ctx.lineTo(12, 10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(13, 5); ctx.lineTo(25, 5); ctx.stroke();
    ctx.restore();
  }

  function text(str, x, y, size, fill = '#fff', align = 'center', stroke = '#543847') {
    ctx.font = `900 ${size}px "Arial Black", system-ui, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size / 6);
    ctx.strokeStyle = stroke;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function medalColor(s) {
    if (s >= 40) return ['#e5e4e2', 'Platinum'];
    if (s >= 30) return ['#ffd700', 'Gold'];
    if (s >= 20) return ['#c0c0c0', 'Silver'];
    if (s >= 10) return ['#cd7f32', 'Bronze'];
    return null;
  }

  function drawUI() {
    if (game.state === 'play') {
      text(String(game.score), W / 2, 80, 56);
    } else if (game.state === 'start') {
      text('Flappy Bird', W / 2, 150, 50, '#f8d630');
      const pulse = 0.6 + 0.4 * Math.sin(game.time * 4);
      ctx.globalAlpha = pulse;
      text('Tap, click or press Space', W / 2, PLAY_H * 0.45 + 80, 20);
      ctx.globalAlpha = 1;
      text('to flap', W / 2, PLAY_H * 0.45 + 108, 20);
      if (game.best > 0) text('Best: ' + game.best, W / 2, PLAY_H - 40, 22, '#fff');
      text('M = mute', W / 2, H - 30, 14, '#543847', 'center', '#ded895');
    } else if (game.state === 'over') {
      const t = Math.min(1, (game.time - game.overTime) * 3);
      const ease = 1 - Math.pow(1 - t, 3);
      text('Game Over', W / 2, 160 - (1 - ease) * 40, 46, '#f0732b');
      const py = 220 + (1 - ease) * 300;
      ctx.fillStyle = '#ded895';
      ctx.strokeStyle = '#543847';
      ctx.lineWidth = 4;
      roundRect(W / 2 - 140, py, 280, 160, 14); ctx.fill(); ctx.stroke();
      text('SCORE', W / 2 + 70, py + 28, 16, '#f0732b', 'center', '#fff');
      text(String(game.score), W / 2 + 70, py + 62, 34);
      text('BEST', W / 2 + 70, py + 98, 16, '#f0732b', 'center', '#fff');
      text(String(game.best), W / 2 + 70, py + 132, 34);
      text('MEDAL', W / 2 - 70, py + 28, 16, '#f0732b', 'center', '#fff');
      const m = medalColor(game.score);
      ctx.beginPath(); ctx.arc(W / 2 - 70, py + 92, 34, 0, Math.PI * 2);
      ctx.fillStyle = m ? m[0] : '#cfc98a'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#543847'; ctx.stroke();
      if (m) text(m[1], W / 2 - 70, py + 92, 13, '#fff');
      if (game.newBest) {
        ctx.fillStyle = '#e8463c';
        roundRect(W / 2 + 4, py + 122, 40, 20, 5); ctx.fill();
        ctx.font = 'bold 11px system-ui, sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.textBaseline = 'middle'; ctx.fillText('NEW', W / 2 + 24, py + 132);
      }
      if (game.time - game.overTime > 0.6) {
        const pulse = 0.6 + 0.4 * Math.sin(game.time * 4);
        ctx.globalAlpha = pulse;
        text('Tap or press Space to restart', W / 2, py + 200, 19);
        ctx.globalAlpha = 1;
      }
    }
  }

  function draw() {
    ctx.save();
    if (game.shake > 0) {
      const s = game.shake * 20;
      ctx.translate(rand(-s, s), rand(-s, s));
    }
    drawBackground();
    for (const p of game.pipes) if (game.state !== 'start') drawPipe(p);
    drawGround();
    for (const p of game.particles) {
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawBird();
    ctx.restore();
    drawUI();
    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${game.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---------- Main loop (fixed-step physics, rAF rendering) ----------
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab was hidden; avoid a huge jump
    acc += dt;
    while (acc >= STEP) { update(STEP); acc -= STEP; }
    draw();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = performance.now(); acc = 0; });

  initClouds();
  resetRound();
  resize();
  requestAnimationFrame((t) => { last = t; frame(t); });

  // Small read-only hook used by automated tests.
  window.__flappy = {
    get state() { return game.state; },
    get score() { return game.score; },
    get best() { return game.best; },
    get birdY() { return game.bird.y; },
    get muted() { return audio.muted; },
    get nextPipe() {
      const p = game.pipes.find((q) => q.x + PIPE_W > BIRD_X - BIRD_R);
      return p ? { x: p.x, top: p.top, gap: PIPE_GAP } : null;
    },
  };
})();
