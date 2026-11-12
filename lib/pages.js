// lib/pages.js —— 相册里的两种页面镜头：照片页（page）和蛋糕页（cake）。scene.js 的 shots 只是薄包装。
// 依赖 lib/parts.js（pageWorld / pagePhoto / wordTime / paperConfetti）、lib/decor.js（DECOR）、lib/cake.js（drawCake）。
// 镜头参数（cues.json 的 params）：
//   page：photo（左页照片）、photo2（有它就是双照片页）、sat2（第二张的饱和度）、deco（右页零件名）、
//         word（零件在唱到这个词时弹出）、line（word 和零件内部用词所在的句号）、era: 'old'（做旧页 + 黑白照片）、
//         kb（推近方式）、flip: 'cover'（翻开的是牛皮纸封面）
//   cake：mode（first / big / relight / blowout）、candles、word + line（first：点亮的词；blowout：吹灭的词）

var DECO_X = 348, DECO_Y = -10, DECO_Y_OLD = -30;         // 右页零件的中心（页内坐标）
var DECO_POP_S = 0.45, RECOLOR_S = 1.3;
var DECO_AFTER_FLIP = 0.6;                                // 纸页翻过这么多之后，右页零件才开始弹
var SECOND_PHOTO_DELAY_S = 0.22;                          // 双照片页：第二张晚这么久弹起
var CAKE_FIRST_SCALE = 1.2;
var CAKE_CONFETTI = { dur: 2.6, n: 46, seed: 5, x: 0, y: -160, spread: 760, up: 560 };
var BLOWOUT_DIM = 0.62, BLOWOUT_DIM_S = 0.6;              // 吹灭之后整页暗下来多少、用多久
var WISH_HEARTS = 3, WISH_HEART_GAP_S = 0.18, WISH_HEART_RISE = 200;

// 卡点表里照片页写错了（零件名、照片号）就在加载时报错，不等画到那一帧
function checkPageCues(M) {
  for (const sh of M.cues.shots) {
    const P = sh.params || {};
    if (sh.scene !== 'page') continue;
    if (!isPhotoId(P.photo)) throw new Error(`镜头 ${sh.at}：照片页的 photo 要写 1–${PHOTO_COUNT} 的照片号`);
    if (P.photo2 !== undefined && !isPhotoId(P.photo2)) throw new Error(`镜头 ${sh.at}：photo2 要写 1–${PHOTO_COUNT} 的照片号`);
    if (P.deco && !DECOR[P.deco]) throw new Error(`镜头 ${sh.at}：没有 "${P.deco}" 这个纸艺零件`);
    if (P.enterAt !== undefined && !Number.isFinite(M.ref(P.enterAt))) throw new Error(`镜头 ${sh.at}：enterAt 无效`);
  }
}

// 右页零件从什么时候开始弹：唱到 word 的那一刻，但不早于纸页翻开
function decoStart(M, s) {
  const afterFlip = s.t0 + flipDur(M) * DECO_AFTER_FLIP;
  const enter = s.params.enterAt !== undefined ? M.ref(s.params.enterAt)
    : s.params.word ? wordTime(M, s, s.params.word) : s.t0;
  return Math.max(afterFlip, enter);
}

function decoTiming(M, s) {
  const start = decoStart(M, s), elapsed = s.t - start;
  const progress = M.clamp(elapsed / DECO_POP_S);
  return { start, elapsed, progress, pop: M.ease.outBack(progress, 1.25) };
}

function drawPageContent(g, M, s) {
  const P = s.params, isOld = P.era === 'old';
    const timing = decoTiming(M, s), decoT = timing.start, k = timing.pop;
    const baseSat = isOld ? 0 : 1;
    const sat = P.deco === 'recolor' ? M.clamp((s.t - decoT) / RECOLOR_S) : baseSat;   // recolor：黑白慢慢变回彩色
    if (P.photo2) {
      pagePhoto(g, M, s, P.photo, 'left', sat, 0);
      pagePhoto(g, M, s, P.photo2, 'right', P.sat2 === undefined ? sat : P.sat2, SECOND_PHOTO_DELAY_S);
    } else {
      pagePhoto(g, M, s, P.photo, 'main', sat, 0);
    }
    if (P.deco) DECOR[P.deco](g, M, DECO_X, isOld ? DECO_Y_OLD : DECO_Y, k, s.t, s, timing);
}
function drawPageShot(ctx, s, M) {
  pageWorld(ctx, M, s, (g) => drawPageContent(g, M, s), spreadTone(s));
}

// 第一支蜡烛点着之后，唱到「心愿」几颗小红心从火苗旁飘起来
function wishHearts(g, M, t, t0) {
  for (let i = 0; i < WISH_HEARTS; i++) {
    const age = t - t0 - i * WISH_HEART_GAP_S;
    if (age <= 0) continue;
    const rise = M.ease.out3(M.clamp(age / 1.4)), size = 18 * M.ease.outBack(M.clamp(age / 0.25), 2);
    g.save(); g.globalAlpha *= 1 - M.clamp((age - 1.0) / 0.6);
    heartPath(g, (i - 1) * 76 + Math.sin(age * 3 + i) * 12, -50 - rise * WISH_HEART_RISE, size);
    g.fillStyle = RED; g.fill(); g.strokeStyle = DECO_RED_DARK; g.lineWidth = 2.5; g.stroke();
    g.restore();
  }
}

function drawCakeContent(g, M, s) {
  const P = s.params, t = s.t, mode = P.mode;
  const cueT = P.word ? wordTime(M, s, P.word) : s.t0;
    drawCake(g, M, t, s, { mode, candles: P.candles, x: 0, scale: mode === 'first' ? CAKE_FIRST_SCALE : 1, firstT: cueT, blowT: cueT });
    if (mode === 'first') wishHearts(g, M, t, wordTime(M, s, '心愿'));
    if (mode === 'big') paperConfetti(g, M, t, { ...CAKE_CONFETTI, t0: s.t0 + flipDur(M), floor: PAGE_H / 2 - 30 });
}
function drawCakeShot(ctx, s, M) {
  pageWorld(ctx, M, s, (g) => drawCakeContent(g, M, s), spreadTone(s));
}
