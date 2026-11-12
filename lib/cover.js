// lib/cover.js —— 合着的相册封面 + 封面零件。
// 调用方：lib/intro.js（礼盒开场里升起的相册）、lib/wall.js（收回相册）、lib/ending.js（尾声封面 + 浮尘）。
// 依赖 lib/parts.js（paperRect、KRAFT、PAGE_* 几何）。画面只由 t 决定。
// 封面坐标：原点在封面中心，COVER_W×COVER_H；放到屏幕上和相册跨页同一个位置（PAGE_CX, PAGE_CY, PAGE_SCALE）。

var COVER_W = 1240, COVER_H = 900;
var COVER_EDGE = '#6b4e2c', COVER_GOLD = '#e9c87e', COVER_GOLD_EDGE = '#8a6a2c', COVER_TITLE_INK = '#5d4420';
var TITLE_W = 660, TITLE_H = 108, TITLE_Y = -286, TITLE_TILT = -0.017, TITLE_TEXT = '我 们 的 相 册', TITLE_FONT = 'QingKeHuangYou';

var DESK_LAMP_S = 0.5, DESK_LAMP_REST = 0.12, DESK_DARK = 0.58;
var DUST_N = 40;

function coverBoard(g, M) {
  const hw = COVER_W / 2, hh = COVER_H / 2;
  g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(0, hh + 20, hw * 1.06, 58, 0, 0, Math.PI * 2); g.fill();
  for (let i = 5; i >= 1; i--) { g.fillStyle = i % 2 ? '#e9dfc4' : '#d9cfb8'; g.fillRect(-hw, -hh - i * 4, COVER_W, COVER_H); }   // 书页的厚度
  paperRect(g, M, -hw, -hh, COVER_W, COVER_H, KRAFT);
  g.strokeStyle = COVER_EDGE; g.lineWidth = 8; g.strokeRect(-hw, -hh, COVER_W, COVER_H);
  g.strokeStyle = 'rgba(255,240,210,.35)'; g.lineWidth = 3; g.strokeRect(-hw + 28, -hh + 28, COVER_W - 56, COVER_H - 56);
}
// 烫金书名条（在封面上部）
function coverTitle(g) {
  g.save(); g.translate(0, TITLE_Y); g.rotate(TITLE_TILT);
  g.fillStyle = COVER_GOLD; g.fillRect(-TITLE_W / 2, -TITLE_H / 2, TITLE_W, TITLE_H);
  g.strokeStyle = COVER_GOLD_EDGE; g.lineWidth = 4; g.strokeRect(-TITLE_W / 2, -TITLE_H / 2, TITLE_W, TITLE_H);
  g.fillStyle = COVER_TITLE_INK; g.font = `64px "${TITLE_FONT}"`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(TITLE_TEXT, 0, 4);
  g.restore();
}

// 合着的相册，画在当前变换的原点。o: { lift（0–1 右下角翘起，wall 收回时不用） }
function albumCover(g, M, o) {
  coverBoard(g, M);
  coverTitle(g);
}

// 灯光里的浮尘（只在画面区里飘；靠近边缘淡出，绕回去时不会跳）
function dustMotes(g, M, t, alpha) {
  if (alpha <= 0.005) return;
  for (let i = 0; i < DUST_N; i++) {
    const h1 = M.hash(i, 91), h2 = M.hash(i, 93), h3 = M.hash(i, 95);
    const x = (h1 * M.W + t * (8 + h3 * 14)) % M.W;
    const y = STAGE_BOTTOM - (h2 * STAGE_BOTTOM + t * (6 + h3 * 10)) % STAGE_BOTTOM;
    const edge = Math.sin(Math.PI * x / M.W) * Math.sin(Math.PI * y / STAGE_BOTTOM);
    const twinkle = 0.5 + 0.5 * Math.sin(t * (1 + h3 * 2) + i);
    g.fillStyle = `rgba(255,220,168,${(alpha * edge * twinkle).toFixed(3)})`;
    g.beginPath(); g.arc(x + M.noise(t * 0.3 + i, i) * 30, y, 1.5 + h3 * 2.5, 0, Math.PI * 2); g.fill();
  }
}
