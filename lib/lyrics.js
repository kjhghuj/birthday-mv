// lib/lyrics.js —— 字幕带里的歌词：普通句的字形钩子（登记歌词框）+ 金句的红色剪纸字牌。
// 由 scene.js 调用：glyph 钩子 → lyricGlyph；overlay 钩子 → drawHookPlaques。
// 依赖 lib/parts.js（registerLyricBox、RED、颜色常量）。画面只由 t 决定。
// 修复计划 ④：所有歌词都在字幕带（中心 y = LYRIC_Y），照片永远在它上面。

var LYRIC_X = 960, LYRIC_Y = 968;                         // 字幕带里歌词的中心
var GLYPH_HALF_K = 0.58;                                  // 一个字的半高 / 半宽（含描边）占字号的多少
var PLAQUE_W = 134, PLAQUE_H = 146, PLAQUE_GAP = 12, PLAQUE_GROUP_GAP = 44;
var PLAQUE_PX = 110, PLAQUE_FONT = 'QingKeHuangYou';
var PLAQUE_POP_S = 0.2, PLAQUE_DROP = 46, PLAQUE_EXIT_S = 0.25, PLAQUE_TILT = 0.07;
var PLAQUE_BEAT_BUMP = 0.035;                             // 字牌跟着拍子轻轻鼓一下
var PLAQUE_GOLD = '#f0b93a', PLAQUE_GOLD_EDGE = '#8a5a12', PLAQUE_RED_EDGE = '#7c1f1c', PLAQUE_INK = '#fff2dd';
var PLAQUE_TONES = {
  red: [{ fill: RED, edge: PLAQUE_RED_EDGE, ink: PLAQUE_INK }],
  // 终副歌升级：红金相间
  gold: [{ fill: RED, edge: PLAQUE_RED_EDGE, ink: PLAQUE_INK }, { fill: PLAQUE_GOLD, edge: PLAQUE_GOLD_EDGE, ink: '#7c1f1c' }],
};

// 将源句身份附在样式上，不能以“当前正在唱哪句”推断退场字的来源。
function setupLyricSources(M) {
  const lines = M.cues.lyrics.lines || (M.cues.lyrics.lines = {});
  for (const L of M.song.lines) {
    const key = 'line' + L.n;
    lines[key] = { ...(lines[key] || {}), lineN: L.n };
  }
}

// 普通歌词的每个字：照运行库的默认画法画出来；在屏幕层（字幕带）的字顺手登记歌词框。
// 注意：这里不能调 M.glyph —— 它会再回到这个钩子，无限递归。
function lyricGlyph(ctx, ch, x, y, px, st, M) {
  ctx.font = `${st.weight || ''} ${px}px "${st.font}", "NotoSansSC-900", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const hasStroke = st.stroke && st.strokeW;
  if (st.shadow) {
    const sx = x + st.shadowOff[0] * px, sy = y + st.shadowOff[1] * px;
    ctx.fillStyle = st.shadow; ctx.fillText(ch, sx, sy);
    if (hasStroke) { ctx.lineWidth = st.strokeW * px * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = st.shadow; ctx.strokeText(ch, sx, sy); }
  }
  if (st.glow) { ctx.shadowColor = st.glow; ctx.shadowBlur = px * 0.3; }
  if (hasStroke) { ctx.lineWidth = st.strokeW * px * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = st.stroke; ctx.strokeText(ch, x, y); }
  ctx.fillStyle = st.fillNow || st.fill; ctx.fillText(ch, x, y);
  if (st.glow) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
  if (st.layer === 'screen') {
    // 本项目的 pop/wave 只绘制已唱前缀，karaoke 按原文次序绘制整句；无 ghost 重绘。
    const n = st.lineN, index = GLYPH_COUNTS[n] || 0;
    GLYPH_COUNTS[n] = index + 1;
    if (ctx.globalAlpha > 0.02) registerLyricBox(glyphScreenBox(ctx, M, x, y, px), n, index);
  }
}

// 屏幕层的字不受镜头影响：当前变换除以 M.SC 就是 1920×1080 里的位置
function glyphScreenBox(ctx, M, x, y, px) {
  const m = ctx.getTransform();
  const cx = (m.a * x + m.c * y + m.e) / M.SC, cy = (m.b * x + m.d * y + m.f) / M.SC;
  const half = px * GLYPH_HALF_K * Math.hypot(m.a, m.b) / M.SC;
  return [cx - half, cy - half, cx + half, cy + half];
}

// 一句话里每个字牌的中心 x（相对整句中心）；空格 = 两组之间多留一点
function plaqueSlots(text) {
  const laid = [...text].reduce(
    (acc, ch) => (ch === ' '
      ? { xs: acc.xs, x: acc.x + PLAQUE_GROUP_GAP }
      : { xs: [...acc.xs, acc.x], x: acc.x + PLAQUE_W + PLAQUE_GAP }),
    { xs: [], x: 0 });
  const span = laid.x - PLAQUE_GAP;
  return laid.xs.map((x) => x - span / 2 + PLAQUE_W / 2);
}

// 一张剪纸字牌（画在当前变换的原点）
function plaqueCard(g, ch, tone) {
  const hw = PLAQUE_W / 2, hh = PLAQUE_H / 2;
  g.fillStyle = 'rgba(10,6,3,.45)'; g.beginPath(); g.roundRect(-hw + 5, -hh + 8, PLAQUE_W, PLAQUE_H, 14); g.fill();
  g.fillStyle = tone.fill; g.beginPath(); g.roundRect(-hw, -hh, PLAQUE_W, PLAQUE_H, 14); g.fill();
  g.strokeStyle = tone.edge; g.lineWidth = 4; g.stroke();
  g.strokeStyle = 'rgba(255,242,221,.55)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(-hw + 9, -hh + 9, PLAQUE_W - 18, PLAQUE_H - 18, 8); g.stroke();
  g.font = `${PLAQUE_PX}px "${PLAQUE_FONT}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = tone.ink; g.fillText(ch, 0, 4);
}

// 一句金句：唱到哪个字，哪张字牌从上面落下来弹一下；整句唱完一起淡出。返回这句此刻的最大不透明度。
function drawHookLine(g, M, L, toneName) {
  const tones = PLAQUE_TONES[toneName];
  if (!tones) throw new Error(`第 ${L.n} 句：没有 "${toneName}" 这种字牌配色`);
  const t = M.t, exit = 1 - M.clamp((t - L.t1) / PLAQUE_EXIT_S), slots = plaqueSlots(L.text);
  const bump = 1 + PLAQUE_BEAT_BUMP * M.pulse('beat', { decay: 0.15 });
  let shown = 0;
  M.chars(L, t, PLAQUE_POP_S).forEach((c) => {
    if (!c.sung || exit <= 0) return;
    const k = M.ease.outBack(c.on, 2.2), tilt = (M.hash(c.j, L.n) - 0.5) * PLAQUE_TILT;
    const y = LYRIC_Y - (1 - M.ease.out3(c.on)) * PLAQUE_DROP;
    g.save(); g.globalAlpha *= exit; g.translate(LYRIC_X + slots[c.j], y); g.rotate(tilt); g.scale(k * bump, k * bump);
    plaqueCard(g, c.c, tones[c.j % tones.length]);
    g.restore();
    const hw = PLAQUE_W / 2 * k * bump, hh = PLAQUE_H / 2 * k * bump + PLAQUE_W * Math.abs(tilt);
    registerLyricBox([LYRIC_X + slots[c.j] - hw, y - hh, LYRIC_X + slots[c.j] + hw, y + hh], L.n, c.j);
    shown += 1;
  });
  return shown ? exit : 0;
}

// 所有在卡点表里写了 mode: 'scene' 的句子都画成字牌（配色写在那一句的 plaque 字段，默认 red）。
// 每帧告诉审片这句在屏上（M.logLyric），不然审片会当它没上屏。
function drawHookPlaques(g, M) {
  const styles = (M.cues.lyrics && M.cues.lyrics.lines) || {};
  for (const [key, st] of Object.entries(styles)) {
    if (st.mode !== 'scene') continue;
    const L = M.lineN(Number(key.replace('line', '')));
    if (!L) throw new Error(`卡点表的 lyrics.lines 里写了 ${key}，但歌里没有这一句`);
    if (M.t < L.t0 || M.t > L.t1 + PLAQUE_EXIT_S) continue;
    const alpha = drawHookLine(g, M, L, st.plaque || 'red');
    if (alpha > 0) M.logLyric(L.n, PLAQUE_PX, alpha, L.text);
  }
}

// ── 字幕粒子（v3 计划）：每个字落下的那一刻迸一圈金粉星光，唱着的整句常有小星轻轻闪 ──
// 坐标用本帧登记的歌词框（window.MV_LAYOUT.lyrics，1920×1080 屏幕坐标），普通句和字牌句都适用。
var SPARK_BURST_S = 0.5, SPARK_BURST_N = 6, SPARK_BURST_R = 60;
var SPARK_AMBIENT_N = 9;
var SPARK_GOLD = '#f4d788', SPARK_CORE = '#fff3cf';
function drawGlint(g, M, x, y, r, alpha, rot) {
  g.save(); g.globalAlpha *= Math.max(0, Math.min(1, alpha)); g.translate(x, y); g.rotate(rot || 0);
  g.strokeStyle = SPARK_GOLD; g.lineWidth = Math.max(1.4, r * 0.2); g.lineCap = 'round';
  g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.stroke();
  g.fillStyle = SPARK_CORE; g.beginPath(); g.arc(0, 0, Math.max(1, r * 0.26), 0, Math.PI * 2); g.fill();
  g.restore();
}
function drawLyricSparkles(g, M) {
  const allBoxes = (window.MV_LAYOUT && window.MV_LAYOUT.lyrics) || [];
  if (!allBoxes.length) return;
  const L = M.line(M.t);
  if (!L || M.t < L.t0 - 0.05 || M.t > L.t1 + 0.3) return;
  // 只取当前句的框，过滤相邻句退场时留下的残留
  const boxes = allBoxes.filter(b => b.lineN === L.n);
  if (!boxes.length) return;
  const byChar = new Map(boxes.map(b => [b.charIndex, b.box]));
  g.save(); g.globalCompositeOperation = 'lighter';
  // 唱到的字落下时，围绕这个字的框迸一圈金粉
  L.chars.forEach((c, j) => {
    const age = M.t - c.t;
    const b = byChar.get(j);
    if (age < 0 || age > SPARK_BURST_S || !b) return;
    const k = 1 - age / SPARK_BURST_S;
    const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    for (let i = 0; i < SPARK_BURST_N; i++) {
      const h1 = M.hash(i, L.n * 31 + j), h2 = M.hash(i, L.n * 17 + j * 3);
      const ang = h1 * Math.PI * 2, d = (16 + h2 * 0.7 * SPARK_BURST_R) * (1.35 - k * 0.6);
      drawGlint(g, M, cx + Math.cos(ang) * d, cy + Math.sin(ang) * 0.7 * d - age * 46, 3 + h2 * 5, k * 0.85, h1 * 3);
    }
  });
  // 整句范围内常驻的小星光，亮度随拍子呼吸
  const beat = 0.75 + 0.25 * M.pulse('beat', { decay: 0.18 });
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const b of boxes) { x0 = Math.min(x0, b.box[0]); y0 = Math.min(y0, b.box[1]); x1 = Math.max(x1, b.box[2]); y1 = Math.max(y1, b.box[3]); }
  for (let i = 0; i < SPARK_AMBIENT_N; i++) {
    const h1 = M.hash(i, L.n * 7 + 5), h2 = M.hash(i, L.n * 13 + 3), h3 = M.hash(i, L.n * 3 + 9);
    const tw = 0.5 + 0.5 * Math.sin(M.t * (3 + h3 * 4) + h1 * 9);
    drawGlint(g, M, M.lerp(x0, x1, h1), M.lerp(y0, y1, 0.12 + h2 * 0.76) - 6, 2.5 + h3 * 4, (0.18 + 0.3 * tw) * beat, h2 * 3);
  }
  g.restore();
}
