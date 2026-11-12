// lib/night.js —— 吹灭蜡烛之后的星空页（night 镜头）：相册翻到一页深蓝色的纸，纸星星一颗颗亮起来。
// 调用方：scene.js 的 night 镜头 → drawNightShot。依赖 lib/parts.js（star、heartPath、drawDesk、lampGlow、PAGE_* 几何）。
// 镜头参数：line（「星星」「真心」所在的句号）。唱到「星星」小星星逐颗点亮，唱到「真心」最大的一颗里弹出红心。
// 修复计划 ④：v1 页面底部那行小字「星星记得每一个心愿」删掉了（它在字幕带里，和歌词打架）。

var NIGHT_PAPER = '#171226', NIGHT_PAPER_EDGE = 'rgba(246,239,221,.25)';
var NIGHT_DESK_DIM = 0.3, NIGHT_LAMP = 0.08, NIGHT_ZOOM = 0.035;
var NIGHT_STARS = 15, NIGHT_STAR_GAP_S = 0.095, NIGHT_STAR_POP_S = 0.4, NIGHT_STAR_MARGIN = 110;
var BIG_STAR = { x: 0, y: -40, r: 96, glow: 185, popS: 0.55, heartDelayS: 0.18, heart: 34 };
var METEORS = 2, METEOR_FIRST_S = 0.55, METEOR_GAP_S = 0.85, METEOR_S = 0.66;

function nightPage(g, M) {
  const hw = PAGE_W / 2, hh = PAGE_H / 2;
  g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(0, hh + 26, hw * 1.03, 52, 0, 0, M.TAU); g.fill();
  g.fillStyle = '#2a2238'; g.fillRect(-hw - 12, -hh - 10, PAGE_W + 24, PAGE_H + 36);
  g.fillStyle = NIGHT_PAPER; g.fillRect(-hw, -hh, PAGE_W, PAGE_H);
  // 静态的靛蓝纸面，不使用整页 blur 或高亮塑料光斑。
  const sky = M.cached('nightPaperSky', 384, 224, (c) => {
    const grad = c.createRadialGradient(204, 128, 10, 204, 128, 218);
    grad.addColorStop(0, 'rgba(99,87,130,.18)'); grad.addColorStop(1, 'rgba(48,48,83,0)');
    c.fillStyle = grad; c.fillRect(0, 0, 384, 224);
    const r = M.rng(231);
    for (let i = 0; i < 72; i++) {
      c.fillStyle = `rgba(231,218,184,${.08 + r() * .13})`;
      c.fillRect(r() * 384, r() * 224, .45 + r() * .55, .45 + r() * .55);
    }
  });
  g.drawImage(sky, -hw, -hh, PAGE_W, PAGE_H);
  paperPattern(g, M, -hw, -hh, PAGE_W, PAGE_H);
  g.strokeStyle = NIGHT_PAPER_EDGE; g.lineWidth = 3; g.strokeRect(-hw, -hh, PAGE_W, PAGE_H);
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-3, -hh, 6, PAGE_H);                 // 中缝
}

function softGlow(g, M, x, y, r, alpha) {
  if (r <= 0 || alpha <= 0) return;
  const tex = M.cached('softGlowWarm', 128, 128, (c) => {
    const gl = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gl.addColorStop(0, 'rgba(255,218,135,1)'); gl.addColorStop(.24, 'rgba(255,214,132,.44)');
    gl.addColorStop(.64, 'rgba(255,208,124,.08)'); gl.addColorStop(1, 'rgba(255,208,124,0)');
    c.fillStyle = gl; c.fillRect(0, 0, 128, 128);
  });
  g.save(); g.globalAlpha *= M.clamp(alpha);
  g.drawImage(tex, x - r, y - r, r * 2, r * 2); g.restore();
}

// 小星星：从 starT 起每隔一小会儿亮一颗，跟着拍子轻轻一胀
function smallStars(g, M, t, starT) {
  const spanX = PAGE_W - NIGHT_STAR_MARGIN * 2, spanY = PAGE_H - NIGHT_STAR_MARGIN * 2, beatK = M.pulse('beat', { t, decay: 0.25 });
  for (let i = 0; i < NIGHT_STARS; i++) {
    const lit = M.clamp((t - starT - i * NIGHT_STAR_GAP_S) / NIGHT_STAR_POP_S);
    if (lit <= 0) continue;
    const h1 = M.hash(i, 31), h2 = M.hash(i, 77);
    const y = (h2 - 0.5) * spanY;
    let x = (h1 - 0.5) * spanX;
    if (Math.abs(x) < 175 && Math.abs(y - BIG_STAR.y) < 145) x += x < 0 ? -190 : 190;
    const r = (14 + h1 * 12) * M.ease.outBack(lit, 1.35) * (1 + 0.045 * beatK);
    const twinkle = .78 + .14 * Math.sin(t * 2.4 + i * 1.7);
    softGlow(g, M, x, y, r * 2.9, 0.22 * lit * twinkle);
    star(g, M, x, y, r, i * .7 + Math.sin(t * .7 + i) * .07, '#e8c77c', '#fff0bd', twinkle);
    // 折纸中线以固定明暗表达厚度，不靠扩大光圈抢中央星星。
    g.save(); g.globalAlpha *= .32 * lit; g.strokeStyle = '#fff2ce'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x, y - r * .72); g.lineTo(x, y + r * .28); g.stroke(); g.restore();
  }
}

// 最大的一颗：唱到「真心」弹出来，里面跟着弹出一颗红心
function bigStar(g, M, t, heartT) {
  const B = BIG_STAR, k = M.ease.outBack(M.clamp((t - heartT) / B.popS), 1.3);
  if (k <= 0) return;
  softGlow(g, M, B.x, B.y, B.glow, 0.3 * M.clamp(k));
  g.save(); g.globalAlpha *= .2 * M.clamp(k);
  star(g, M, B.x + 5, B.y + 8, B.r * k, -0.16, '#090712', '#090712', 1); g.restore();
  star(g, M, B.x, B.y, B.r * k, -0.16, '#ffcf6e', '#fff6dc', 1);
  const hk = M.ease.outBack(M.clamp((t - heartT - B.heartDelayS) / 0.4), 1.45) * (1 + 0.025 * M.pulse('beat', { t, decay: 0.2 }));
  if (hk <= 0) return;
  g.save(); g.translate(B.x, B.y + 4); g.scale(hk, hk);
  heartPath(g, 0, 0, B.heart); g.fillStyle = RED; g.fill(); g.strokeStyle = DECO_RED_DARK; g.lineWidth = 3; g.stroke();
  g.restore();
}

// 流星：星星亮起来之后，隔一会儿划过一颗（只在纸页里）
function meteors(g, M, t, starT, heartT) {
  for (let j = 0; j < METEORS; j++) {
    const k = M.clamp((t - starT - METEOR_FIRST_S - j * METEOR_GAP_S) / METEOR_S);
    if (k <= 0 || k >= 1) continue;
    const h1 = M.hash(j, 53), len = 160 + h1 * 100;
    // 真心亮起后流星退到背景，避免和主星、红心争夺注意力。
    const focus = heartT === undefined ? 1 : 1 - .55 * M.smooth(heartT - .1, heartT + .3, t);
    const fade = Math.sin(k * Math.PI) * focus;
    const x1 = PAGE_W / 2 - 60 - h1 * 240, y1 = -PAGE_H / 2 + 70 + j * 150;
    const hx = M.lerp(x1, x1 - len * 1.9, k), hy = M.lerp(y1, y1 + len * 0.55, k), tx = hx + len * 0.85, ty = hy - len * 0.42;
    const tail = g.createLinearGradient(hx, hy, tx, ty);
    tail.addColorStop(0, `rgba(255,240,200,${(0.95 * fade).toFixed(3)})`); tail.addColorStop(1, 'rgba(255,240,200,0)');
    g.save(); g.strokeStyle = tail; g.lineWidth = 2.5 * fade + 1; g.lineCap = 'round';
    g.beginPath(); g.moveTo(hx, hy); g.lineTo(tx, ty); g.stroke();
    g.restore();
    softGlow(g, M, hx, hy, 20, .7 * fade);
  }
}

// 页内容可被相册翻页系统按镜头描述单独绘制，任意 seek 都可复现。
function drawNightContent(g, M, s) {
  const t = s.t, starT = wordTime(M, s, '星星'), heartT = wordTime(M, s, '真心');
  nightPage(g, M);
  g.save(); g.beginPath(); g.rect(-PAGE_W / 2, -PAGE_H / 2, PAGE_W, PAGE_H); g.clip();
  smallStars(g, M, t, starT);
  meteors(g, M, t, starT, heartT);
  bigStar(g, M, t, heartT);
  g.restore();
}

function drawNightShot(ctx, s, M) {
  pageWorld(ctx, M, s, (g) => drawNightContent(g, M, s), 'night');
}
