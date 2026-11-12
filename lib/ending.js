// lib/ending.js —— 最后一句的两张拍立得（finale）和尾声的封面落款（end）。
// 调用方：scene.js 的 finale / end 镜头 → drawFinaleShot / drawEndShot；scene.js 的 overlay → drawEndTitle；setup → checkEndingCues。
// 依赖 lib/parts.js（照片、布局登记、桌 / 灯、纸屑）、lib/cover.js（albumCover、dustMotes、封面几何）、lib/night.js（softGlow）。
// 镜头参数：finale：photo、photo2（两张拍立得的照片号）；end：phase（stamp 盖章 / close 灯暗下来）。
// 修复计划 ⑤ 的两处结尾瑕疵：
//   一、印章缩到 300px 落在封面左下，书名条在上部，两张拍立得缩略图在右下，三者互不遮挡；不再画丝带、「礼」扣、「寿」小印、印泥点、绕圈星星。
//   二、「幸福到永远」的扫光 = 同一行字用亮色再画一遍，裁成一条移动的窄缝，高光只落在笔画上。

var POLAROID_PAPER = '#fdfaf2', POLAROID_EDGE = '#cbbfa2';
var POLAROID_MAX_W = 400, POLAROID_MAX_H = 520, POLAROID_PAD = 24, POLAROID_FOOT = 92, POLAROID_CAP_PX = 44;
var FINALE_Y = 415, FINALE_GAP_X = 235, FINALE_DROP = 320, FINALE_DROP_S = 0.5, FINALE_SECOND_BEATS = 1;
var FINALE_HEARTS = 12, FINALE_CONFETTI = { dur: 3, n: 60, seed: 83, x0: 80, x1: 1840 };

var END_PHASES = ['stamp', 'close'];
var END_HIT = '最后一闪';                                  // 卡点表里那个时刻的名字：灯最后亮一下，烫金字浮出来
var END_PUSH = 0.03, END_DIM = 0.22, END_DIM_S = 6.4;      // 尾声慢推；close：灯在这么多秒里暗到多少
var STAMP = { x: -330, y: 150, size: 300, tilt: -0.05, px: 100, delayS: 0.05, slamS: 0.22, from: 2.4 };
var STAMP_CONFETTI = { dur: 2.4, n: 40, seed: 77, x: STAMP.x, y: STAMP.y, spread: 900, up: 520 };
var END_THUMBS = [{ id: 25, x: 235, y: 150, rot: -0.06 }, { id: 32, x: 440, y: 168, rot: 0.05 }];
var END_THUMB_SCALE = 0.38, END_THUMB_POP_S = 0.4, END_THUMB_GAP_S = 0.15;
var END_TITLE = { text: '幸 福 到 永 远', x: 960, y: 946, px: 58, font: 'LXGWWenKai', color: '#e9c87e', shine: '#fff8e2',
  delayS: 0.7, inS: 1.4, sweepS: 1.6, slit: 70, slant: 18 };

// 卡点表写错了就在加载时报错
function checkEndingCues(M) {
  for (const sh of M.cues.shots) {
    const P = sh.params || {};
    if (sh.scene === 'finale' && !(isPhotoId(P.photo) && isPhotoId(P.photo2))) {
      throw new Error(`镜头 ${sh.at}：finale 的 photo 和 photo2 都要写 1–${PHOTO_COUNT} 的照片号`);
    }
    if (sh.scene === 'end' && !END_PHASES.includes(P.phase)) throw new Error(`镜头 ${sh.at}：尾声没有 "${P.phase}" 这个阶段`);
    if (sh.scene === 'end' && P.phase === 'close' && !M.moment(END_HIT)) {
      throw new Error(`尾声要用名叫「${END_HIT}」的时刻，卡点表的 moments 里没有`);
    }
  }
}

// 拍立得：粗白边 + 底部宽边写图注。画在当前变换的原点（原点 = 整张拍立得的中心），并登记进本帧布局。
function polaroid(g, M, id, options) {
  const img = PH[id];
  if (!img) throw new Error('没有这张照片：p' + id);
  const photo = photoSize(id, POLAROID_MAX_W, POLAROID_MAX_H);
  const w = photo.w + POLAROID_PAD * 2, h = photo.h + POLAROID_PAD + POLAROID_FOOT, x = -w / 2, y = -h / 2;
  if (!options || options.shadow !== false) {
    g.fillStyle = 'rgba(30,20,10,.3)'; g.beginPath(); g.ellipse(4, h / 2 + 8, w * 0.5, 18, 0, 0, M.TAU); g.fill();
  }
  g.fillStyle = POLAROID_PAPER; g.fillRect(x, y, w, h);
  g.strokeStyle = POLAROID_EDGE; g.lineWidth = 3; g.strokeRect(x, y, w, h);
  drawImgCover(g, img, x + POLAROID_PAD, y + POLAROID_PAD, photo.w, photo.h, FOCUS[id]);
  const text = CAP[id] || '', px = Math.min(POLAROID_CAP_PX, (w - 30) / Math.max(1, text.length));
  g.font = `${px}px "QingKeHuangYou"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = INK; g.fillText(text, 0, h / 2 - POLAROID_FOOT / 2);
  registerPhoto(g, M, id, x, y, w, h);
}

// 拍立得保持真实大小下落，接触桌面才轻弹；影子始终贴在桌面而不是跟着卡片飞。
function finalePolaroidPose(M, t, dropT, side) {
  const age = t - dropT, fall = M.clamp(age / FINALE_DROP_S);
  const landAge = Math.max(0, age - FINALE_DROP_S);
  const bounce = Math.sin(landAge * 19) * Math.exp(-landAge / 0.16);
  const settle = M.smooth(dropT + FINALE_DROP_S, dropT + FINALE_DROP_S + 0.4, t);
  return {
    x: PAGE_CX + side * FINALE_GAP_X,
    y: FINALE_Y - (1 - M.ease.in2(fall)) * FINALE_DROP - bounce * 9 + Math.sin(t * 1.4 + side) * 1.4 * settle,
    rot: side * M.lerp(0.13, 0.045, M.ease.out3(fall)) + side * bounce * 0.025 + Math.sin(t * 1.1 + side) * 0.006 * settle,
    scale: M.lerp(0.95, 1, fall) + bounce * 0.012,
    alpha: M.smooth(dropT, dropT + 0.12, t), contact: M.smooth(0.45, 1, fall),
  };
}
function finalePolaroid(g, M, t, id, dropT, side) {
  const p = finalePolaroidPose(M, t, dropT, side);
  if (p.alpha <= 0.001) return;
  const photo = photoSize(id, POLAROID_MAX_W, POLAROID_MAX_H);
  const width = photo.w + POLAROID_PAD * 2, height = photo.h + POLAROID_PAD + POLAROID_FOOT;
  g.save(); g.globalAlpha *= p.alpha;
  g.fillStyle = `rgba(20,12,5,${(0.08 + p.contact * 0.24).toFixed(3)})`;
  g.beginPath(); g.ellipse(p.x + 4, FINALE_Y + height / 2 + 9, width * (0.42 + 0.08 * p.contact), 8 + 16 * (1 - p.contact), 0, 0, M.TAU); g.fill();
  g.translate(p.x, p.y); g.rotate(p.rot); g.scale(p.scale, p.scale);
  polaroid(g, M, id, { shadow: false });
  g.restore();
}

// 小红心从桌面升起来（只在画面区里飘）
function finaleHearts(g, M, t) {
  for (let i = 0; i < FINALE_HEARTS; i++) {
    const h1 = M.hash(i, 81), h2 = M.hash(i, 83), u = (t * (0.12 + h1 * 0.1) + h2) % 1;
    g.save(); g.globalAlpha = 0.55 * M.clamp(u / 0.12) * M.clamp((1 - u) / 0.12);
    g.translate(PAGE_CX + (h1 - 0.5) * 1560 + Math.sin(t * 1.2 + i) * 26, M.lerp(CONFETTI_FLOOR, 0, u));
    g.rotate(Math.sin(t * 1.5 + i) * 0.3);
    heartPath(g, 0, 0, 18 + h2 * 15); g.fillStyle = i % 3 ? RED : '#f2a03c'; g.fill();
    g.strokeStyle = DECO_RED_DARK; g.lineWidth = 2; g.stroke();
    g.restore();
  }
}

// 最后一句「幸福到永远」：两张全家福拍立得先后落在桌上
function drawFinaleShot(ctx, s, M) {
  const t = s.t, P = s.params;
  drawDesk(ctx, M); lampGlow(ctx, M, 1);
  finaleHearts(ctx, M, t);
  finalePolaroid(ctx, M, t, P.photo, s.t0, -1);
  finalePolaroid(ctx, M, t, P.photo2, s.t0 + FINALE_SECOND_BEATS * M.song.beat, 1);
  paperConfetti(ctx, M, t, { ...FINALE_CONFETTI, t0: s.t0 });
  drift(ctx, M, t, 61); breathe(ctx, M, t, 0.03, 3.4);
}

// 「生日快乐」红印章（封面坐标）。age：盖章镜头开始后过了多久；Infinity = 早就盖好了
function birthdayStamp(g, M, age) {
  const k = M.ease.out3(M.clamp((age - STAMP.delayS) / STAMP.slamS));
  if (k <= 0) return;
  const landAge = age - STAMP.delayS - STAMP.slamS;
  const impact = Number.isFinite(landAge) && landAge >= 0 ? Math.exp(-landAge / 0.14) : 0;
  const jiggle = impact > 0 ? impact * Math.sin(landAge * 25) * 0.022 : 0;
  const size = M.lerp(STAMP.from, 1, k) + jiggle, half = STAMP.size / 2, q = STAMP.size * 0.26;
  g.save(); g.translate(STAMP.x, STAMP.y);
  // 悬空时投影略离开封面，落章后收成贴纸边缘，保留纸艺质感。
  g.fillStyle = `rgba(48,22,10,${(0.08 + 0.13 * k).toFixed(3)})`;
  g.beginPath(); g.roundRect(-half + 7 + (1 - k) * 14, -half + 10 + (1 - k) * 20, STAMP.size, STAMP.size, 22); g.fill();
  g.rotate(STAMP.tilt + jiggle * 0.4); g.scale(size * (1 + impact * 0.018), size * (1 - impact * 0.025)); g.globalAlpha *= M.clamp(k * 2);
  g.fillStyle = DECO_RED; g.beginPath(); g.roundRect(-half, -half, STAMP.size, STAMP.size, 22); g.fill();
  g.strokeStyle = '#8f2019'; g.lineWidth = 6; g.stroke();
  g.strokeStyle = 'rgba(255,240,220,.55)'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(-half + 14, -half + 14, STAMP.size - 28, STAMP.size - 28, 12); g.stroke();
  g.fillStyle = '#fff2dd'; g.font = `${STAMP.px}px "QingKeHuangYou"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['生', -q, -q], ['日', q, -q], ['快', -q, q], ['乐', q, q]].forEach(([ch, x, y]) => g.fillText(ch, x, y + 4));
  g.restore();
}

// 封面右下角贴着的两张拍立得缩略图（封面坐标）
function endThumbs(g, M, t, age) {
  END_THUMBS.forEach((th, i) => {
    const k = M.ease.outBack(M.clamp((age - i * END_THUMB_GAP_S) / END_THUMB_POP_S), 1.8);
    if (k <= 0) return;
    g.save(); g.translate(th.x, th.y); g.rotate(th.rot + Math.sin(t * 1.4 + i * 2) * 0.008);
    g.scale(END_THUMB_SCALE * k, END_THUMB_SCALE * k);
    polaroid(g, M, th.id);
    g.restore();
  });
}

// 最后一闪：书名条的角上亮一颗星
function coverGlint(g, M, flare) {
  if (flare <= 0.02) return;
  const x = TITLE_W / 2 - 8, y = TITLE_Y - TITLE_H / 2 + 4;
  softGlow(g, M, x, y, 120 + 260 * flare, 0.7 * flare);
  star(g, M, x, y, 18 + 44 * flare, 0, '#ffe3a0', '#fff8e2', M.clamp(flare * 1.6));
}

// 尾声：合上的相册盖上「生日快乐」印章（stamp）→ 灯慢慢暗下来，最后亮一下（close）
function drawEndShot(ctx, s, M) {
  const t = s.t, isClose = s.params.phase === 'close', age = isClose ? Infinity : s.lt;
  const flare = isClose ? M.hit(END_HIT, { decay: 0.5 }) : 0;
  const dim = isClose ? M.lerp(1, END_DIM, M.smooth(s.t0, s.t0 + END_DIM_S, t)) : 1;
  const light = Math.min(1, dim + 0.5 * flare), zoom = 1 + END_PUSH * (isClose ? 1 + s.p : s.p);
  ctx.save(); ctx.translate(PAGE_CX, PAGE_BOTTOM); ctx.scale(zoom, zoom); ctx.translate(-PAGE_CX, -PAGE_BOTTOM);
  drawDesk(ctx, M);
  ctx.save(); ctx.translate(PAGE_CX, PAGE_CY); ctx.scale(PAGE_SCALE, PAGE_SCALE);
  albumCover(ctx, M, {});
  endThumbs(ctx, M, t, age);
  birthdayStamp(ctx, M, age);
  if (!isClose) paperConfetti(ctx, M, t, { ...STAMP_CONFETTI, t0: s.t0 + STAMP.delayS + STAMP.slamS, floor: COVER_H / 2 });
  coverGlint(ctx, M, flare);
  ctx.restore();
  if (light < 1) { ctx.fillStyle = `rgba(8,5,3,${(1 - light).toFixed(3)})`; ctx.fillRect(-M.W, -M.H, M.W * 3, M.H * 3); }
  lampGlow(ctx, M, light * (0.94 + 0.06 * M.noise(t * 2.2, 9)));
  dustMotes(ctx, M, t, 0.32 * light);
  ctx.restore();
  drift(ctx, M, t, 41); breathe(ctx, M, t, 0.02 * light + 0.006, 4.2);
}

// 烫金字「幸福到永远」：画在字幕带里（这时已经没有歌词），所以由 overlay 调用，不会被字幕带的暗角压住。
function drawEndTitle(g, M) {
  const E = END_TITLE, age = M.after(END_HIT) - E.delayS;
  if (!(age > 0)) return;
  const alpha = M.smooth(0, E.inS, age), sweep = M.clamp(age / E.sweepS);
  g.save();
  g.font = `${E.px}px "${E.font}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.globalAlpha = alpha; g.fillStyle = E.color; g.fillText(E.text, E.x, E.y);
  if (sweep > 0 && sweep < 1) {                                    // 扫光：亮色的同一行字，只露出一条斜着的窄缝
    const w = g.measureText(E.text).width, sx = M.lerp(E.x - w / 2 - E.slit, E.x + w / 2, sweep);
    g.beginPath();
    g.moveTo(sx + E.slant, E.y - E.px); g.lineTo(sx + E.slant + E.slit, E.y - E.px);
    g.lineTo(sx - E.slant + E.slit, E.y + E.px); g.lineTo(sx - E.slant, E.y + E.px);
    g.closePath(); g.clip();
    g.globalAlpha = alpha * Math.sin(sweep * Math.PI); g.fillStyle = E.shine; g.fillText(E.text, E.x, E.y);
  }
  g.restore();
}
