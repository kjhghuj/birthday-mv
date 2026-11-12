// lib/cake.js —— 生日蛋糕（页内坐标，原点在跨页中心）。由 scene.js 的 cake 镜头调用。
// drawCake(g, M, t, s, o)：o = { mode, x, scale, candles, firstT, blowT }
//   mode：first（一层小蛋糕，firstT 点亮一支）| relight（每半拍点一支）| big（全亮 + 彩旗 + 火花）| blowout（压火 → 熄灭 → 细烟）
// 依赖 lib/parts.js 的常量。画面只由 t 决定。

var CAKE_BASE_Y = 260;                                   // 盘子所在的 y
var TIER_W = [0, 300, 430, 500], TIER_H = [0, 96, 120, 130];   // 下标 = 从上往下第几层
var TIER_COLORS = ['#f2b6b0', '#f7dfae', '#f2b6b0'];
var CREAM_R = 27;                                        // 奶油波浪的半径（CREAM 是 parts.js 里的颜色）
var CANDLE_SPAN = 240, CANDLE_W = 18, CANDLE_MIN_H = 92, CANDLE_VAR_H = 26, FLAME_SIZE = 15;
var SMOKE_S = 2.2, SMOKE_PUFFS = 3, BLOWOUT_PRESS_S = 0.15;
var CAKE_FLAGS = 12, CAKE_FLAG_HALF = 690, CAKE_FLAG_Y = -380;

function teardrop(g, x, y, w, h) {
  g.beginPath(); g.moveTo(x, y - h);
  g.bezierCurveTo(x + w, y - h * .45, x + w * .85, y + h * .25, x, y + h * .3);
  g.bezierCurveTo(x - w * .85, y + h * .25, x - w, y - h * .45, x, y - h);
  g.fill();
}
// 小贴图只包含光源自身的辉光，不模糊纸边、照片或字幕。
function candleGlow(g, M, x, y, radius, alpha) {
  if (alpha <= 0 || radius <= 0) return;
  const tex = M.cached('candleGlowWarm', 128, 128, (c) => {
    const gl = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gl.addColorStop(0, 'rgba(255,218,130,.7)'); gl.addColorStop(.2, 'rgba(255,180,64,.3)');
    gl.addColorStop(.55, 'rgba(249,139,44,.07)'); gl.addColorStop(1, 'rgba(249,139,44,0)');
    c.fillStyle = gl; c.fillRect(0, 0, 128, 128);
  });
  g.save(); g.globalAlpha *= M.clamp(alpha); g.globalCompositeOperation = 'screen';
  g.drawImage(tex, x - radius, y - radius, radius * 2, radius * 2); g.restore();
}
function flame(g, M, x, y, size, t, i, amount, wind) {
  const strength = amount === undefined ? 1 : M.clamp(amount);
  if (strength <= 0.001) return;
  const phase = i * 2.1, flicker = 1 + .09 * Math.sin(t * 7.3 + phase) + .035 * Math.sin(t * 17 + i);
  const lean = .10 * Math.sin(t * 4.4 + phase) + .04 * Math.sin(t * 9.2 + i) + (wind || 0);
  candleGlow(g, M, x, y - size, size * (4.1 + .3 * flicker), .78 * strength);
  g.save(); g.translate(x, y - 2); g.rotate(lean);
  g.scale(.78 + .22 * strength, (.13 + .87 * strength) * flicker);
  // 火尖、橙色外焰、奶油色内焰分开画，轮廓仍像三层剪纸。
  g.fillStyle = '#ed8426'; teardrop(g, 0, -size * .8, size * .55, size * 1.4);
  g.fillStyle = '#ffc85c'; teardrop(g, -size * .045, -size * .64, size * .39, size * 1.08);
  g.fillStyle = '#fff3c9'; teardrop(g, -size * .04, -size * .39, size * .22, size * .7);
  g.restore();
}
function smoke(g, M, x, y, t0, t, i) {
  const dt = t - t0;
  if (dt <= 0 || dt >= SMOKE_S) return;
  for (let j = 0; j < SMOKE_PUFFS; j++) {
    const age = dt - j * .12;
    if (age <= 0) continue;
    const life = M.clamp(age / (SMOKE_S - j * .12));
    const alpha = Math.sin(Math.PI * Math.min(1, age / .26) / 2) * (1 - life) ** 1.4 * (.31 - j * .055);
    const rise = 135 * age, bend = Math.sin(age * 2.8 + i * .8 + j * .7) * (5 + 12 * life);
    const driftX = 17 * age + bend, width = 1.7 + life * 4;
    g.save(); g.globalAlpha *= alpha; g.strokeStyle = '#c2bdb5'; g.lineWidth = width; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x + driftX * .4, y - 5 - rise * .45);
    g.bezierCurveTo(x - 6 + driftX, y - 18 - rise * .62, x + 12 + driftX, y - 26 - rise * .82, x + driftX, y - 30 - rise);
    g.stroke(); g.restore();
  }
}
var CAKE_MODES = ['first', 'relight', 'big', 'blowout'];
var RELIGHT_STEP_BEATS = 0.5;                            // relight：每隔多少拍点亮一支
var BIG_STAGGER_S = 0.05;                                // big：相邻两支蜡烛点亮的间隔

// 第 i 层（0 = 最底层）顶面的 y
function tierTop(tiers, i) {
  let h = 0;
  for (let j = 0; j <= i; j++) h += TIER_H[tiers - j];
  return CAKE_BASE_Y - h;
}
function candleLightState(M, t, s, o, i) {
  const visibleT = s.t0 + flipDur(M) * .7;
  const litAt = o.mode === 'first' ? o.firstT : o.mode === 'relight'
    ? visibleT + i * M.song.beat * RELIGHT_STEP_BEATS : visibleT + BIG_STAGGER_S * i;
  if (o.mode === 'blowout') {
    const press = M.clamp((t - o.blowT) / BLOWOUT_PRESS_S);
    return { lit: press < 1, amount: 1 - M.ease.in2(press), lean: .95 * press,
      litAt: -Infinity, extinguishAt: o.blowT + BLOWOUT_PRESS_S };
  }
  return { lit: t >= litAt, amount: M.ease.out3(M.clamp((t - litAt) / .12)), lean: 0, litAt, extinguishAt: Infinity };
}
function candleLit(M, t, s, o, i) {
  return candleLightState(M, t, s, o, i).lit;
}
function cakeTiers(g, M, tiers) {
  g.fillStyle = 'rgba(20,12,4,.32)'; g.beginPath(); g.ellipse(0, CAKE_BASE_Y + 30, 380, 30, 0, 0, M.TAU); g.fill();
  g.fillStyle = '#ece2c8'; g.beginPath(); g.ellipse(0, CAKE_BASE_Y + 16, 360, 40, 0, 0, M.TAU); g.fill();
  g.strokeStyle = '#b9ab86'; g.lineWidth = 4; g.stroke();
  for (let i = 0; i < tiers; i++) {
    const w = TIER_W[tiers - i], h = TIER_H[tiers - i], top = tierTop(tiers, i), n = Math.round(w / 56);
    g.fillStyle = TIER_COLORS[(tiers - i) % TIER_COLORS.length];
    g.beginPath(); g.roundRect(-w / 2, top, w, h, 16); g.fill();
    g.strokeStyle = '#a06a4f'; g.lineWidth = 5; g.stroke();
    // 纸板的薄侧边、底部压痕与上沿高光，让三层真正分开。
    g.fillStyle = 'rgba(125,71,49,.12)'; g.fillRect(-w / 2 + 8, top + h - 8, w - 16, 5);
    g.strokeStyle = 'rgba(255,249,225,.7)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-w / 2 + 18, top + 6); g.lineTo(w / 2 - 18, top + 6); g.stroke();
    g.fillStyle = '#fdf6e4'; g.strokeStyle = '#d9c9a0'; g.lineWidth = 2;
    for (let j = 0; j < n; j++) {
      g.beginPath(); g.arc(-w / 2 + CREAM_R + 1 + j * (w - 2 * CREAM_R - 2) / (n - 1), top + 12, CREAM_R, Math.PI, 0); g.fill(); g.stroke();
    }
  }
  const top = tierTop(tiers, tiers - 1);
  // 樱桃位于顶层前沿，中央也能插蜡烛，candles:7 实际显示七支。
  g.fillStyle = '#c93a32'; g.beginPath(); g.arc(0, top + 16, 15, 0, M.TAU); g.fill();
  g.strokeStyle = '#7c1f1c'; g.lineWidth = 3; g.stroke();
}
function cakeCandles(g, M, t, s, o, tiers, count) {
  const foot = tierTop(tiers, tiers - 1) - 8;
  for (let i = 0; i < count; i++) {
    const x = count === 1 ? 0 : -CANDLE_SPAN / 2 + CANDLE_SPAN * i / (count - 1);
    const h = CANDLE_MIN_H + M.hash(i, 3) * CANDLE_VAR_H, tip = foot - h - 4;
    g.fillStyle = i % 2 ? '#f2b04f' : '#e88f9f';
    g.fillRect(x - CANDLE_W / 2, foot - h, CANDLE_W, h);
    g.strokeStyle = '#a06a4f'; g.lineWidth = 3; g.strokeRect(x - CANDLE_W / 2, foot - h, CANDLE_W, h);
    g.save(); g.beginPath(); g.rect(x - CANDLE_W / 2, foot - h + 2, CANDLE_W, h - 4); g.clip();
    g.strokeStyle = '#fff0d8'; g.lineWidth = 6;
    for (let stripe = 0; stripe < 5; stripe++) {
      const yy = foot - h + 14 + stripe * 24;
      g.beginPath(); g.moveTo(x - CANDLE_W, yy + 10); g.lineTo(x + CANDLE_W, yy - 6); g.stroke();
    }
    g.restore();
    // 灯芯始终存在，熄灭后留下红褐色的余烬。
    const light = candleLightState(M, t, s, o, i);
    g.strokeStyle = light.lit ? '#6b3a24' : '#463328'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x, foot - h); g.lineTo(x + 1, tip - 2); g.stroke();
    if (light.lit) flame(g, M, x, tip, FLAME_SIZE, t, i, light.amount, light.lean);
    else if (o.mode === 'blowout') {
      const ember = 1 - M.clamp((t - light.extinguishAt) / .7);
      if (ember > 0) { g.save(); g.globalAlpha *= ember; g.fillStyle = '#d88c45'; g.beginPath(); g.arc(x + 1, tip - 2, 2, 0, M.TAU); g.fill(); g.restore(); }
      smoke(g, M, x, tip, light.extinguishAt, t, i);
    }
  }
}
function cakeBunting(g, M, t, s) {
  const k = M.ease.outBack(M.clamp((t - s.t0 - flipDur(M) * .55) / 0.6), 1.25), cols = ['#e8483f', '#f2b04f', '#7fae72', '#e88f9f'];
  if (k <= 0) return;
  g.save(); g.translate(0, CAKE_FLAG_Y); g.scale(k, k);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-CAKE_FLAG_HALF - 30, 0); g.quadraticCurveTo(0, 124, CAKE_FLAG_HALF + 30, 0); g.stroke();
  for (let i = 0; i < CAKE_FLAGS; i++) {
    const u = i / (CAKE_FLAGS - 1), x = M.lerp(-CAKE_FLAG_HALF, CAKE_FLAG_HALF, u), y = 3 + 2 * u * (1 - u) * 124;
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.8 + i) * .05);
    g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(-24, 0); g.lineTo(24, 0); g.lineTo(0, 46); g.closePath(); g.fill();
    g.strokeStyle = '#a06a4f'; g.lineWidth = 2; g.stroke();
    g.restore();
  }
  g.restore();
}
function drawCake(g, M, t, s, o) {
  if (!CAKE_MODES.includes(o.mode)) throw new Error(`镜头 ${s.id}：蛋糕没有 "${o.mode}" 这种模式`);
  const tiers = o.mode === 'first' ? 1 : 3, count = o.mode === 'first' ? 1 : (o.candles || 7), scale = o.scale || 1;
  if (o.mode === 'big' || o.mode === 'relight') cakeBunting(g, M, t, s);
  g.save(); g.translate(o.x || 0, CAKE_BASE_Y); g.scale(scale, scale); g.translate(0, -CAKE_BASE_Y);   // 以盘子为锚点缩放
  cakeTiers(g, M, tiers);
  cakeCandles(g, M, t, s, o, tiers, count);
  if (o.mode === 'big') M.particles(g, 'sparks', { at: s.t0 + flipDur(M) * .7, n: 24, r: 270, x: 0, y: tierTop(tiers, tiers - 1) - 120, color: '#ffcf6e', size: 2.8 });
  g.restore();
}
