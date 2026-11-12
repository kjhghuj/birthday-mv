// lib/credits.js —— 开场右下角的署名（v3 计划第四节）：编曲 / 歌词 / 演唱，展示约 5 秒。
// 由 scene.js 的 overlay 调用（画在字幕带里，开场那几句没有歌词，不挡任何东西）。
// 时间和文字写在 cues.json 顶层的 credits：{ t0, dur, lines: [...] }。画面只由 t 决定。

var CREDITS_X = 1700, CREDITS_Y0 = 936, CREDITS_LH = 56, CREDITS_PX = 38;
var CREDITS_FADE_IN_S = 0.8, CREDITS_FADE_OUT_S = 0.6;
var CREDITS_GOLD = '#e9c87e', CREDITS_INK = 'rgba(26,15,6,.55)';

function drawCredits(g, M) {
  const C = (M.cues && M.cues.credits) || {};
  if (!C.lines || !C.lines.length) throw new Error('cues.json 里没写 credits（{ t0, dur, lines: [...] }）');
  const t0 = typeof C.t0 === 'string' ? M.ref(C.t0) : (C.t0 === undefined ? 3.5 : C.t0);
  const dur = C.dur === undefined ? 5 : C.dur;
  const age = M.t - t0;
  if (age < 0 || age > dur) return;
  const a = Math.min(M.smooth(0, CREDITS_FADE_IN_S, age), 1 - M.smooth(dur - CREDITS_FADE_OUT_S, dur, age));
  if (a <= 0.01) return;
  g.save(); g.globalAlpha *= a;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  g.font = CREDITS_PX + 'px "LXGWWenKai"';
  // 署名上方一条细金线 + 一颗小星，像相册角落的藏书票
  const topY = CREDITS_Y0 - CREDITS_LH * 0.8;
  g.strokeStyle = 'rgba(233,200,126,.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(CREDITS_X - 300, topY); g.lineTo(CREDITS_X, topY); g.stroke();
  star(g, M, CREDITS_X - 322, topY, 11, M.t * 0.3, '#f4d788', '#fff3cf', 0.9);
  C.lines.forEach((line, i) => {
    const y = CREDITS_Y0 + i * CREDITS_LH;
    g.strokeStyle = CREDITS_INK; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeText(line, CREDITS_X, y);
    g.fillStyle = CREDITS_GOLD; g.fillText(line, CREDITS_X, y);
  });
  g.restore();
}
