// lib/decor.js —— 右页的纸艺零件（DECOR）；蛋糕在 lib/cake.js。坐标都是页内坐标（原点在跨页中心，1560×900）。
// 每个零件：DECOR[name](g, M, cx, cy, k, t, s, timing)。k 只表示最终弹出姿态；
// timing = { start, elapsed, progress, pop }，分层动画一律从 elapsed（秒）计算，不能再次把 k 当时间。
// 依赖 lib/parts.js 的 star / heartPath / photoCard / wordTime。画面只由 t 决定。

var DECO_EDGE = '#a06a4f', DECO_RED = '#c93a32', DECO_RED_DARK = '#7c1f1c', DECO_GOLD = '#f2b04f', DECO_PINK = '#e88f9f', DECO_GREEN = '#7fae72';
var DECOR = {};

function popK(M, x, back) { return M.ease.outBack(M.clamp(x), back || 2); }
function decoElapsed(M, t, s, timing) {
  if (timing) return timing.elapsed;
  const P = s && s.params || {};
  const start = P.enterAt !== undefined ? M.ref(P.enterAt) : s ? s.t0 : 0;
  return t - start;
}
function decoStage(M, elapsed, delay, duration, back) {
  return popK(M, (elapsed - delay) / duration, back === undefined ? 1.15 : back);
}
// 一朵剪纸花：n 片花瓣 + 红花心
function paperFlower(g, M, r, n, color, spin) {
  g.save(); g.rotate(spin);
  g.fillStyle = color; g.strokeStyle = DECO_EDGE; g.lineWidth = 3;
  for (let j = 0; j < n; j++) {
    const a = j / n * M.TAU;
    g.beginPath(); g.ellipse(Math.cos(a) * r * .62, Math.sin(a) * r * .62, r * .52, r * .3, a, 0, M.TAU); g.fill(); g.stroke();
  }
  g.restore();
}
function giftBox(g, size, color, ribbon) {
  const h = size / 2;
  g.fillStyle = color; g.fillRect(-h, -h, size, size);
  g.strokeStyle = '#5d3a20'; g.lineWidth = 4; g.strokeRect(-h, -h, size, size);
  g.fillStyle = ribbon; g.fillRect(-size * .08, -h, size * .16, size); g.fillRect(-h, -size * .08, size, size * .16);
  g.beginPath(); g.ellipse(-size * .15, -h - size * .09, size * .17, size * .1, -.5, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(size * .15, -h - size * .09, size * .17, size * .1, .5, 0, Math.PI * 2); g.fill();
}

// 纸花一层层绽放（「笑容比花灿烂」）
DECOR.flower = (g, M, cx, cy, k, t, s, timing) => {
  const elapsed = decoElapsed(M, t, s, timing);
  const layers = [[1, DECO_PINK], [.68, '#f2b6b0'], [.4, '#f7dfae']];
  g.save(); g.translate(cx, cy + 120);
  layers.forEach(([scale, color], i) => {
    const kk = decoStage(M, elapsed, i * .13, .4);
    if (kk > 0) paperFlower(g, M, 120 * scale * kk, 7, color, t * .3 * (i - 1) + i);
  });
  g.fillStyle = DECO_RED; g.beginPath(); g.arc(0, 0, 34 * Math.max(0, k), 0, M.TAU); g.fill();
  g.strokeStyle = DECO_RED_DARK; g.lineWidth = 3; g.stroke();
  g.restore();
};
// 写着字的故事纸卡散出来（「故事还在续写」）
DECOR.stories = (g, M, cx, cy, k, t, s, timing) => {
  const elapsed = decoElapsed(M, t, s, timing);
  for (let i = 0; i < 7; i++) {
    const kk = decoStage(M, elapsed, i * .09, .42);
    if (kk <= 0) continue;
    const h1 = M.hash(i, 61), h2 = M.hash(i, 67);
    g.save(); g.translate(cx + (h1 - .5) * 480 * kk, cy + 60 + (h2 - .5) * 380 * kk); g.rotate((h2 - .5) * .7 * kk);
    g.fillStyle = '#f4ead0'; g.fillRect(-64, -46, 128, 92);
    g.strokeStyle = '#b9a87e'; g.lineWidth = 2; g.strokeRect(-64, -46, 128, 92);
    g.strokeStyle = 'rgba(90,70,40,.5)'; g.lineWidth = 3;
    for (let l = 0; l < 3; l++) { g.beginPath(); g.moveTo(-46, -22 + l * 20); g.lineTo(-46 + (60 + l * 26) * kk, -22 + l * 20); g.stroke(); }
    g.restore();
  }
};
// 一份礼物，唱到「加倍」再弹出第二份
DECOR.gifts = (g, M, cx, cy, k, t, s) => {
  const k2 = popK(M, (t - wordTime(M, s, '加倍')) / 0.45, 2.4);
  const boxes = [[cx - 110, cy + 150, DECO_RED, k, -.04], [cx + 130, cy + 220, DECO_GREEN, k2, .04]];
  for (const [x, y, color, kk, rot] of boxes) {
    if (kk <= 0) continue;
    g.save(); g.translate(x, y); g.scale(kk, kk); g.rotate(rot); giftBox(g, 172, color, '#f2d98e'); g.restore();
  }
};
// 三条纸胶带把时光贴住（「让幸福都停留」）
DECOR.tape = (g, M, cx, cy, k) => {
  if (k <= 0) return;
  for (const [dx, rot] of [[-300, .35], [300, -.35], [0, -.06]]) {
    g.save(); g.translate(cx + dx * .9, cy - 250); g.rotate(rot); g.scale(k, k);
    g.fillStyle = 'rgba(238,226,190,.92)'; g.fillRect(-92, -28, 184, 56);
    g.strokeStyle = 'rgba(160,140,100,.55)'; g.lineWidth = 2; g.strokeRect(-92, -28, 184, 56);
    g.restore();
  }
};
// 日历一页页翻（「每一天」）
DECOR.calendar = (g, M, cx, cy, k, t, s, timing) => {
  if (k <= 0) return;
  const elapsed = decoElapsed(M, t, s, timing);
  g.save(); g.translate(cx, cy + 140); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.scale(k, k);
  g.fillStyle = 'rgba(60,40,20,.16)'; g.fillRect(-89, -110, 192, 240);
  g.fillStyle = '#fbf6e8'; g.fillRect(-96, -120, 192, 240);
  g.strokeStyle = '#b9a87e'; g.lineWidth = 3; g.strokeRect(-96, -120, 192, 240);
  g.fillStyle = DECO_RED; g.fillRect(-96, -120, 192, 56);
  g.fillStyle = '#fff'; g.font = '34px "LXGWWenKai"'; g.fillText('十一月', 0, -92);
  g.fillStyle = '#5d4420'; g.font = '58px "QingKeHuangYou"'; g.fillText('13', 0, 18);
  g.font = '22px "LXGWWenKai"'; g.fillText('生日快乐', 0, 76);
  // 11、12 两张旧页由下往上绘制，分别翻完并离场，最后露出 13 日。
  for (let i = 1; i >= 0; i--) {
    const fk = M.ease.inOut3(M.clamp((elapsed - .14 - i * .4) / .4));
    if (fk >= 1) continue;
    g.save(); g.translate(0, -120 - fk * fk * 70); g.scale(1, Math.cos(fk * Math.PI));
    g.globalAlpha *= 1 - M.smooth(.62, 1, fk);
    g.fillStyle = '#f4ead0'; g.fillRect(-92, 0, 184, 230);
    g.strokeStyle = '#b9a87e'; g.lineWidth = 2; g.strokeRect(-92, 0, 184, 230);
    g.fillStyle = '#8a6a3a'; g.font = '44px "QingKeHuangYou"'; g.fillText(String(11 + i), 0, 110);
    g.restore();
  }
  g.restore();
};
// 红苹果，唱到「礼物」再弹出礼盒（「健康是最好的礼物」）
DECOR.apple = (g, M, cx, cy, k, t, s) => {
  const k2 = popK(M, (t - wordTime(M, s, '礼物')) / 0.4);
  if (k > 0) {
    g.save(); g.translate(cx - 60, cy + 150); g.scale(k, k);
    g.fillStyle = DECO_RED;
    g.beginPath(); g.arc(-38, 0, 52, 0, M.TAU); g.arc(38, 0, 52, 0, M.TAU); g.fill();
    g.strokeStyle = DECO_RED_DARK; g.lineWidth = 4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-40, -24, 14, 22, .4, 0, M.TAU); g.fill();
    g.strokeStyle = '#5d4420'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, -46); g.quadraticCurveTo(8, -84, -6, -104); g.stroke();
    g.fillStyle = DECO_GREEN; g.beginPath(); g.ellipse(26, -86, 34, 16, -.4, 0, M.TAU); g.fill();
    g.restore();
  }
  if (k2 > 0) { g.save(); g.translate(cx + 140, cy + 230); g.scale(k2, k2); giftBox(g, 140, '#f2d98e', RED); g.restore(); }
};
// 一颗红心带暖光（「在心头」）
DECOR.heart = (g, M, cx, cy, k, t) => {
  if (k <= 0) return;
  const gl = g.createRadialGradient(cx, cy + 60, 0, cx, cy + 60, 400 * k);
  gl.addColorStop(0, `rgba(255,180,120,${.4 * M.clamp(k)})`); gl.addColorStop(1, 'rgba(255,180,120,0)');
  g.fillStyle = gl; g.fillRect(cx - 340, cy - 380, 760, 800);
  g.save(); g.translate(cx, cy + 130); g.rotate(Math.sin(t * 1.6) * .05); g.scale(k, k);
  heartPath(g, 0, 0, 120); g.fillStyle = RED; g.fill(); g.strokeStyle = DECO_RED_DARK; g.lineWidth = 6; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(-40, -34, 22, 34, .5, 0, M.TAU); g.fill();
  g.restore();
};
// 纸艺向日葵：茎长出来，花盘转开（「笑口常开」，代替 v1 的笑脸徽章）
var SUNFLOWER_PETALS = 14, SUNFLOWER_STEM = 250;
DECOR.sunflower = (g, M, cx, cy, k, t, s, timing) => {
  if (k <= 0) return;
  const elapsed = decoElapsed(M, t, s, timing);
  const grow = M.ease.out3(M.clamp(elapsed / .36)), headY = cy + 300 - SUNFLOWER_STEM * grow, sway = Math.sin(t * 1.3) * .035;
  g.save(); g.translate(cx, cy + 300);
  g.strokeStyle = '#5f8f55'; g.lineWidth = 12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(26, -SUNFLOWER_STEM * grow * .5, 0, -SUNFLOWER_STEM * grow); g.stroke();
  for (const sgn of [-1, 1]) {
    g.fillStyle = DECO_GREEN; g.beginPath(); g.ellipse(sgn * 46 * grow, -80 - sgn * 26, 48 * grow, 20 * grow, sgn * -.5, 0, M.TAU); g.fill();
    g.strokeStyle = '#5f8f55'; g.lineWidth = 3; g.stroke();
  }
  g.restore();
  const open = decoStage(M, elapsed, .22, .4);
  if (open <= 0) return;
  g.save(); g.translate(cx, headY); g.rotate(sway); g.scale(open, open);
  for (const [r, color, offset] of [[104, '#f0b93a', 0], [84, '#f7d568', .5]]) {
    g.fillStyle = color; g.strokeStyle = '#b07a1e'; g.lineWidth = 2.5;
    for (let j = 0; j < SUNFLOWER_PETALS; j++) {
      const a = (j + offset) / SUNFLOWER_PETALS * M.TAU;
      g.beginPath(); g.ellipse(Math.cos(a) * r * .7, Math.sin(a) * r * .7, r * .42, r * .16, a, 0, M.TAU); g.fill(); g.stroke();
    }
  }
  g.fillStyle = '#7a4a22'; g.beginPath(); g.arc(0, 0, 50, 0, M.TAU); g.fill();
  g.strokeStyle = INK; g.lineWidth = 3; g.stroke();
  g.fillStyle = 'rgba(40,22,8,.45)';
  for (let j = 0; j < 22; j++) { const a = j * 2.4, r = 6 + Math.sqrt(j) * 8.6; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 3.2, 0, M.TAU); g.fill(); }
  g.restore();
};
// 挂绳上三颗纸星轻轻晃（「每一天都闪耀」；v1 的十字闪光去掉了）
DECOR.shine = (g, M, cx, cy, k, t, s, timing) => {
  if (k <= 0) return;
  const elapsed = decoElapsed(M, t, s, timing);
  g.save();
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx - 300, cy - 330); g.quadraticCurveTo(cx, cy - 270, cx + 300, cy - 330); g.stroke();
  for (let i = 0; i < 3; i++) {
    const kk = decoStage(M, elapsed, i * .14, .4);
    if (kk <= 0) continue;
    const u = .2 + i * .3, x = M.lerp(cx - 260, cx + 260, u), y = cy - 326 + Math.sin(u * Math.PI) * 50;
    const drop = (150 + i % 2 * 120) * kk, swing = Math.sin(t * 1.5 + i * 1.3) * .12;
    g.save(); g.translate(x, y); g.rotate(swing);
    g.strokeStyle = '#8a6a3a'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, drop); g.stroke();
    star(g, M, 0, drop + 50 * kk, (56 + i % 2 * 18) * kk, Math.sin(t + i) * .2, '#f2c94c', '#fff0c0', 1);
    g.restore();
  }
  g.restore();
};
// 一串彩旗拉开（金句页）；绳子收在右页里面
var BUNTING_HALF = 350, BUNTING_FLAGS = 8;
DECOR.bunting = (g, M, cx, cy, k, t) => {
  if (k <= 0) return;
  const cols = [RED, DECO_GOLD, DECO_GREEN, DECO_PINK, '#e9c87e'], top = cy - 380;
  g.save(); g.translate(cx, top); g.scale(k, k);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(-BUNTING_HALF, 0); g.quadraticCurveTo(0, 90, BUNTING_HALF, 0); g.stroke();
  for (let i = 0; i < BUNTING_FLAGS; i++) {
    const u = (i + .5) / BUNTING_FLAGS, x = M.lerp(-BUNTING_HALF + 15, BUNTING_HALF - 15, u), y = 2 * u * (1 - u) * 90;
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.8 + i) * .05);
    g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.lineTo(0, 56); g.closePath(); g.fill();
    g.strokeStyle = DECO_EDGE; g.lineWidth = 2.5; g.stroke();
    g.restore();
  }
  g.restore();
};
// 年轮：5 圈，到 growT 再长出一圈
var RING_COUNT = 5, RING_GAP = 26;
function yearRing(g, M, x, y, t, growT) {
  const extra = M.ease.outBack(M.clamp((t - growT) / 0.5), 2);
  g.save(); g.translate(x, y);
  for (let i = 1; i <= RING_COUNT + 1; i++) {
    const kk = i > RING_COUNT ? extra : 1;
    if (kk <= 0) break;
    g.strokeStyle = `rgba(190,140,70,${(.5 - i * .05).toFixed(2)})`; g.lineWidth = 7 - i * .7;
    g.beginPath(); g.arc(0, 0, i * RING_GAP * kk, t * .25 + i, t * .25 + i + M.TAU * .94); g.stroke();
  }
  g.fillStyle = '#8a5a2e'; g.beginPath(); g.arc(0, 0, 10, 0, M.TAU); g.fill();
  g.restore();
}
// 年轮 + 唱到触发词时两颗心牵在一起（默认「相伴」，可由 params.ringWord 覆盖）
DECOR.rings = (g, M, cx, cy, k, t, s) => {
  const heartWord = (s.params && s.params.ringWord) || '相伴';
  const t2 = wordTime(M, s, heartWord), k2 = popK(M, (t - t2) / 0.5, 2.2);
  if (k > 0) yearRing(g, M, cx - 40, cy + 110, t, t2);
  if (k2 <= 0) return;
  for (const [hx, color] of [[cx - 160, RED], [cx + 160, DECO_PINK]]) {
    g.save(); g.translate(hx, cy - 180); g.scale(k2, k2);
    heartPath(g, 0, 0, 56); g.fillStyle = color; g.fill(); g.strokeStyle = DECO_RED_DARK; g.lineWidth = 4; g.stroke();
    g.restore();
  }
  g.save(); g.strokeStyle = DECO_RED; g.lineWidth = 5; g.setLineDash([10, 8]);
  g.beginPath(); g.moveTo(cx - 110, cy - 150); g.quadraticCurveTo(cx, cy - 250, cx + 110, cy - 150); g.stroke();
  g.restore();
};
// 心形气球升起来
DECOR.balloon = (g, M, cx, cy, k, t) => {
  if (k <= 0) return;
  const rise = M.ease.out3(M.clamp(k)), y = cy + 240 - rise * 330, sway = Math.sin(t * 1.4) * 18;
  g.save(); g.translate(cx + 80 + sway, y);
  g.strokeStyle = '#8a6a3a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 90); g.quadraticCurveTo(-14, 190, 4, 300); g.stroke();
  heartPath(g, 0, 0, 86 * k); g.fillStyle = RED; g.fill(); g.strokeStyle = DECO_RED_DARK; g.lineWidth = 5; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(-26, -26, 16, 26, .5, 0, M.TAU); g.fill();
  g.restore();
};
// 四颗糖（「蛋糕甜蜜分享」）
DECOR.candy = (g, M, cx, cy, k, t, s, timing) => {
  const elapsed = decoElapsed(M, t, s, timing);
  const cols = [RED, DECO_GOLD, DECO_PINK, DECO_GREEN];
  for (let i = 0; i < cols.length; i++) {
    const kk = decoStage(M, elapsed, i * .12, .4);
    if (kk <= 0) continue;
    const h1 = M.hash(i, 71), h2 = M.hash(i, 73);
    g.save(); g.translate(cx - 220 + h1 * 440, cy + 60 + h2 * 260); g.rotate((h1 - .5) * 1.2); g.scale(kk, kk);
    g.strokeStyle = '#7c4f22'; g.lineWidth = 4; g.fillStyle = cols[i];
    for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(sgn * 48, -8); g.lineTo(sgn * 84, -26); g.lineTo(sgn * 80, 8); g.lineTo(sgn * 46, 14); g.closePath(); g.fill(); g.stroke(); }
    g.beginPath(); g.ellipse(0, 0, 52, 36, 0, 0, M.TAU); g.fill(); g.stroke();
    g.save(); g.clip(); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(-10, -36, 8, 72); g.fillRect(6, -36, 8, 72); g.restore();
    g.restore();
  }
};
// 暖光漫过左页的照片（「温暖了时光」），只铺在页面里；渐变预缓存，避免每帧 createRadialGradient
DECOR.warm = (g, M, cx, cy, k) => {
  if (k <= 0) return;
  const warm = M.cached('warmGlow', PAGE_W, PAGE_H, (c) => {
    const gl = c.createRadialGradient(PAGE_W / 2 - 220, PAGE_H / 2 - 40, 60,
                                      PAGE_W / 2 - 220, PAGE_H / 2 - 40, 900);
    gl.addColorStop(0, 'rgba(255,196,120,0.32)'); gl.addColorStop(1, 'rgba(255,196,120,0)');
    c.fillStyle = gl; c.fillRect(0, 0, PAGE_W, PAGE_H);
  });
  g.save(); g.globalAlpha *= M.clamp(k);
  g.drawImage(warm, -PAGE_W / 2, -PAGE_H / 2); g.restore();
};
// 纸飞机来回飞，唱到「绽放」三朵纸花开（「精彩等着绽放」）
var PLANE_LOOP_S = 3.4;
DECOR.plane = (g, M, cx, cy, k, t, s, timing) => {
  const elapsed = decoElapsed(M, t, s, timing);
  const t2 = wordTime(M, s, '绽放'), u = Math.max(0, elapsed % PLANE_LOOP_S) / PLANE_LOOP_S;
  if (k > 0) {
    g.save(); g.translate(M.lerp(cx - 300, cx + 400, u), cy - 250 - Math.sin(u * Math.PI) * 110); g.rotate(.2 + u * .5);
    g.globalAlpha *= M.clamp(u / .08) * M.clamp((1 - u) / .08);
    g.fillStyle = '#fbf6e8'; g.beginPath(); g.moveTo(66, 0); g.lineTo(-46, -26); g.lineTo(-20, 2); g.lineTo(-46, 26); g.closePath(); g.fill();
    g.strokeStyle = '#b9a87e'; g.lineWidth = 3; g.stroke();
    g.beginPath(); g.moveTo(66, 0); g.lineTo(-20, 2); g.strokeStyle = '#d9cfb8'; g.stroke();
    g.restore();
  }
  ['#e88f9f', '#f2b6b0', '#f7dfae'].forEach((color, i) => {
    const kk = popK(M, (t - t2 - i * .16) / .5, 2.2);
    if (kk <= 0) return;
    g.save(); g.translate(cx - 220 + i * 200, cy + 230);
    paperFlower(g, M, 70 * kk, 6, color, i * .8);
    g.fillStyle = DECO_RED; g.beginPath(); g.arc(0, 0, 18 * kk, 0, M.TAU); g.fill();
    g.restore();
  });
};
// 两条彩带飘着，唱到「烦恼」一个纸团被抛出页面（「忘掉所有烦恼」）
var TOSS_S = 1.1;
DECOR.ribbon2 = (g, M, cx, cy, k, t, s) => {
  if (k <= 0) return;
  [DECO_GOLD, RED].forEach((color, i) => {
    const ph = t * 2.2 + i * 2;
    g.save(); g.globalAlpha *= M.clamp(k); g.strokeStyle = color; g.lineWidth = 16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - 300, cy - 160 + Math.sin(ph) * 30);
    g.quadraticCurveTo(cx - 40, cy - 300 + Math.cos(ph) * 50, cx + 260, cy - 120 + Math.sin(ph + 2) * 40);
    g.stroke(); g.restore();
  });
  const tossT = wordTime(M, s, '烦恼');
  const duration = Math.min(TOSS_S, Math.max(.08, s.t1 - tossT - .06));
  const u = (t - tossT) / duration;
  if (u <= 0 || u >= 1) return;
  g.save(); g.translate(M.lerp(cx - 200, PAGE_W / 2 + 80, u), cy + 160 - Math.sin(u * Math.PI) * 420); g.rotate(u * 5);
  g.globalAlpha *= M.clamp((1 - u) / .25);
  g.fillStyle = '#b7ab90'; g.beginPath();
  for (let j = 0; j < 9; j++) { const a = j / 9 * M.TAU, r = 34 + M.hash(j, 5) * 14; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill(); g.strokeStyle = '#7c6f52'; g.lineWidth = 3; g.stroke();
  g.strokeStyle = '#5d5340'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-18, -8); g.lineTo(14, 10); g.moveTo(-10, 14); g.lineTo(12, -12); g.stroke();
  g.restore();
};
// 六个音符绕着圈
DECOR.note = (g, M, cx, cy, k, t, s, timing) => {
  const elapsed = decoElapsed(M, t, s, timing);
  for (let i = 0; i < 6; i++) {
    const kk = decoStage(M, elapsed, i * .08, .4);
    if (kk <= 0) continue;
    const a = t * .8 + i * M.TAU / 6;
    g.save(); g.translate(cx + Math.cos(a) * (210 + M.hash(i, 17) * 90), cy + Math.sin(a) * 190 - 20); g.rotate(Math.sin(a * 2) * .3); g.scale(kk * 1.3, kk * 1.3);
    g.fillStyle = i % 2 ? '#e9c87e' : RED; g.strokeStyle = '#7c4f22'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, 0, 17, 12, -.4, 0, M.TAU); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(14, -4); g.lineTo(14, -52); g.quadraticCurveTo(34, -46, 32, -26); g.stroke();
    g.restore();
  }
};
// 一条胶片拉开，里面是五张老照片（「岁岁又年年」）
var FILM_IDS = [13, 15, 16, 18, 20], FILM_W = 640, FILM_H = 150, FILM_HOLES = 12, FILM_PHOTO = 92;
DECOR.film = (g, M, cx, cy, k) => {
  if (k <= 0) return;
  const w = FILM_W * M.clamp(k);
  g.save(); g.translate(cx, cy + 60); g.rotate(-.04);
  g.fillStyle = '#2e2820'; g.fillRect(-FILM_W / 2, -FILM_H / 2, w, FILM_H);
  g.strokeStyle = '#171310'; g.lineWidth = 3; g.strokeRect(-FILM_W / 2, -FILM_H / 2, w, FILM_H);
  g.fillStyle = '#efe6cc';
  for (let j = 0; j < FILM_HOLES; j++) {
    const x = -FILM_W / 2 + 14 + j * (FILM_W - 46) / (FILM_HOLES - 1);
    if (x + 18 > -FILM_W / 2 + w) break;
    g.fillRect(x, -FILM_H / 2 + 8, 18, 12); g.fillRect(x, FILM_H / 2 - 20, 18, 12);
  }
  FILM_IDS.forEach((id, i) => {
    const x = M.lerp(-FILM_W / 2 + 64, FILM_W / 2 - 64, i / (FILM_IDS.length - 1));
    if (x + FILM_PHOTO / 2 > -FILM_W / 2 + w) return;
    g.save(); g.translate(x, 0); photoCard(g, M, id, { w: FILM_PHOTO, h: FILM_PHOTO, sat: 0 }); g.restore();
  });
  g.restore();
};
// 一道剪纸彩虹一条条长出来（老照片变回彩色；代替 v1 的米字闪光）
var RAINBOW = ['#e8483f', '#f0b93a', '#f7d568', '#7fae72', '#7fb5c9'], RAINBOW_R = 250, RAINBOW_BAND = 30;
DECOR.recolor = (g, M, cx, cy, k, t, s, timing) => {
  if (k <= 0) return;
  const elapsed = decoElapsed(M, t, s, timing);
  g.save(); g.translate(cx, cy + 220); g.lineCap = 'butt';
  RAINBOW.forEach((color, i) => {
    const kk = M.ease.out3(M.clamp((elapsed - i * .12) / .55));
    if (kk <= 0) return;
    g.strokeStyle = color; g.lineWidth = RAINBOW_BAND;
    g.beginPath(); g.arc(0, 0, RAINBOW_R - i * RAINBOW_BAND, Math.PI, Math.PI * (1 + kk)); g.stroke();
  });
  g.fillStyle = '#fbf6e8'; g.strokeStyle = '#c9bb98'; g.lineWidth = 3;
  for (const [x, r] of [[-RAINBOW_R + 60, 44], [-RAINBOW_R + 4, 34], [RAINBOW_R - 60, 44], [RAINBOW_R - 4, 34]]) {
    const kk = decoStage(M, elapsed, x > 0 ? .6 : 0, .4);
    if (kk > 0) { g.beginPath(); g.arc(x, 8, r * kk, 0, M.TAU); g.fill(); g.stroke(); }
  }
  g.restore();
};
// 中国结（「健康平安」）
DECOR.knot = (g, M, cx, cy, k, t) => {
  if (k <= 0) return;
  g.save(); g.translate(cx, cy + 40); g.scale(k, k);
  g.strokeStyle = DECO_RED; g.lineWidth = 8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -210); g.lineTo(0, -120); g.stroke();
  for (let i = 0; i < 3; i++) {
    const r = 60 + i * 42;
    for (const sgn of [-1, 1]) { g.beginPath(); g.moveTo(0, -120); g.quadraticCurveTo(sgn * r, -60, 0, 0); g.quadraticCurveTo(-sgn * r, 60, 0, 120); g.stroke(); }
  }
  g.fillStyle = DECO_RED; g.beginPath(); g.arc(0, 0, 16, 0, M.TAU); g.fill();
  for (const dx of [-22, 0, 22]) {
    const sway = Math.sin(t * 2 + dx) * 6;
    g.strokeStyle = '#a52a22'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(dx, 120); g.quadraticCurveTo(dx * 1.6, 190, dx * 1.2, 240 + sway); g.stroke();
    g.fillStyle = '#e9c87e'; g.beginPath(); g.arc(dx * 1.2, 250 + sway, 8, 0, M.TAU); g.fill();
  }
  g.restore();
};
// 三张愿望卡先弹出，唱到「祝愿」寿字剪纸展开（「这是最美的祝愿」）
var WISH_TEXTS = ['身体健康', '笑口常开', '岁岁平安'];
DECOR.wishes = (g, M, cx, cy, k, t, s, timing) => {
  const elapsed = decoElapsed(M, t, s, timing);
  const open = popK(M, (t - wordTime(M, s, '祝愿')) / 0.6, 1.9);
  if (open > 0) {
    g.save(); g.translate(cx - 90, cy - 40); g.scale(open, open); g.rotate(-.06);
    g.fillStyle = DECO_RED;
    for (let i = 0; i < 12; i++) { const a = i / 12 * M.TAU; g.beginPath(); g.arc(Math.cos(a) * 152, Math.sin(a) * 152, 13, 0, M.TAU); g.fill(); }
    g.beginPath(); g.roundRect(-150, -150, 300, 300, 20); g.fill();
    g.strokeStyle = '#8f2019'; g.lineWidth = 6; g.stroke();
    g.fillStyle = '#fff2dd'; g.font = '200px "QingKeHuangYou"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('寿', 0, 14);
    g.restore();
  }
  WISH_TEXTS.forEach((text, i) => {
    const kk = decoStage(M, elapsed, i * .16, .38);
    if (kk <= 0) return;
    const h1 = M.hash(i, 81);
    g.save(); g.translate(cx + 150 + (h1 - .5) * 120, cy + 190 + i * 84); g.rotate((h1 - .5) * .3); g.scale(kk, kk);
    g.fillStyle = '#fbf6e8'; g.fillRect(-110, -36, 220, 72);
    g.strokeStyle = '#b9a87e'; g.lineWidth = 2.5; g.strokeRect(-110, -36, 220, 72);
    g.fillStyle = '#5d4420'; g.font = '30px "LXGWWenKai"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 0, 2);
    g.restore();
  });
};
// 纸窗 + 阳光（L1）：唱到「阳光」光束从窗口长出来照向左页的照片，唱到「窗台」纸窗弹起
var WINDOW_W = 300, WINDOW_H = 360, WINDOW_Y = -40, BEAM_REACH = 620;
function windowBeam(g, M, cx, cy, grow) {
  if (grow <= 0) return;
  const reach = BEAM_REACH * grow, top = cy - WINDOW_H / 2 + 20, bottom = cy + WINDOW_H / 2 - 20;
  const gr = g.createLinearGradient(cx, 0, cx - reach, 0);
  gr.addColorStop(0, 'rgba(255,224,150,.5)'); gr.addColorStop(1, 'rgba(255,224,150,0)');
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr;
  g.beginPath(); g.moveTo(cx - WINDOW_W / 2, top); g.lineTo(cx + WINDOW_W / 2, top); g.lineTo(cx + WINDOW_W / 2 - reach * .25, bottom + reach * .32); g.lineTo(cx - WINDOW_W / 2 - reach, bottom + reach * .32); g.closePath(); g.fill();
  g.restore();
}
function windowFrame(g, M, t) {
  const hw = WINDOW_W / 2, hh = WINDOW_H / 2;
  const sky = g.createLinearGradient(0, -hh, 0, hh); sky.addColorStop(0, '#bfe0ee'); sky.addColorStop(1, '#fbe9b8');
  g.fillStyle = sky; g.fillRect(-hw, -hh, WINDOW_W, WINDOW_H);
  g.fillStyle = '#f7c948'; g.beginPath(); g.arc(hw * .35, -hh * .4, 44, 0, M.TAU); g.fill();
  g.strokeStyle = '#d99a1e'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 10; i++) { const a = i / 10 * M.TAU + t * .3; g.beginPath(); g.moveTo(hw * .35 + Math.cos(a) * 56, -hh * .4 + Math.sin(a) * 56); g.lineTo(hw * .35 + Math.cos(a) * 74, -hh * .4 + Math.sin(a) * 74); g.stroke(); }
  g.strokeStyle = '#8a5a2e'; g.lineWidth = 16; g.strokeRect(-hw, -hh, WINDOW_W, WINDOW_H);
  g.lineWidth = 9; g.beginPath(); g.moveTo(0, -hh); g.lineTo(0, hh); g.moveTo(-hw, 0); g.lineTo(hw, 0); g.stroke();
  g.fillStyle = '#a3713c'; g.fillRect(-hw - 34, hh, WINDOW_W + 68, 26);                       // 窗台
  g.strokeStyle = '#6b4320'; g.lineWidth = 3; g.strokeRect(-hw - 34, hh, WINDOW_W + 68, 26);
  g.fillStyle = '#c96a4a'; g.beginPath(); g.moveTo(-hw + 30, hh); g.lineTo(-hw + 40, hh - 46); g.lineTo(-hw + 96, hh - 46); g.lineTo(-hw + 106, hh); g.closePath(); g.fill();   // 花盆
  g.fillStyle = DECO_GREEN;
  for (const [dx, rot] of [[-16, -.5], [0, 0], [16, .5]]) { g.beginPath(); g.ellipse(-hw + 68 + dx, hh - 76, 14, 34, rot, 0, M.TAU); g.fill(); }
}
DECOR.window = (g, M, cx, cy, k, t, s) => {
  const beamT = wordTime(M, s, '阳光'), windowT = wordTime(M, s, '窗台');
  const up = popK(M, (t - windowT) / 0.45, 1.9), wy = cy + WINDOW_Y;
  windowBeam(g, M, cx, wy, M.ease.out3(M.clamp((t - beamT) / 0.9)) * (0.9 + 0.1 * Math.sin(t * 1.7)));
  if (up <= 0) return;
  g.save(); g.translate(cx, wy + WINDOW_H / 2 + 26); g.scale(1, up); g.translate(0, -WINDOW_H / 2 - 26);   // 从窗台往上立起来
  windowFrame(g, M, t);
  g.restore();
};
