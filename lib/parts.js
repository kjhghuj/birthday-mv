// lib/parts.js —— 相册的基础零件：常量、照片加载、布局登记、纸 / 桌 / 灯、照片卡。
// 画风参考 LemoLab lemo-opuscar「Paper Pop-up Book」(MIT)：剪纸卡 + 白边、深棕描边、back() 过冲弹出、纸纹、暖台灯。
// 全是全局函数（非模块脚本）；运行库只通过参数 M 使用。画面只由 t 决定。

var PHOTO_COUNT = 32;
var STAGE_BOTTOM = 850;                                   // 画面区下沿，再往下是字幕带，照片不许进去
var PAGE_W = 1560, PAGE_H = 900;                          // 跨页的页内坐标（原点在跨页中心）
var PAGE_CX = 960, PAGE_CY = 436, PAGE_SCALE = 0.889;     // 跨页在屏幕上的中心和缩放 → 屏幕 y 36–836
var PAGE_BOTTOM = PAGE_CY + PAGE_H / 2 * PAGE_SCALE;      // 页面底边：镜头推近的锚点
var INK = '#4a3226', RED = '#e8483f', CREAM = '#f6efdd', KRAFT = '#a3814f';
var MIN_ASPECT = 0.56, MAX_ASPECT = 1.5;                  // 照片卡的宽高比范围，超出的按裁切重心裁
var PH = {};
var CAP = {
  1: '在家也要拍一张', 2: '湖边的大石头', 3: '陪小孙女写作业', 4: '桥头合影', 5: '坐车旅游', 6: '公园里的雕塑',
  7: '奶奶的彩扇', 8: '雕塑下合个影', 9: '老宅门口', 10: '拱廊下', 11: '彩色阶梯', 12: '城市新地标',
  13: '年轻时的城墙', 14: '河边的青年', 15: '纪念碑前', 16: '手风琴年代', 17: '登塔远眺', 18: '我们的乐队',
  19: '山前留影', 20: '那时候的我们', 21: '青春的样子', 22: '最年轻的脸', 23: '古塔下', 24: '琴声里的岁月',
  25: '我们这一家', 26: '在家忙活的爷爷', 27: '奶奶的红裙子', 28: '园子里歇歇脚', 29: '老宅的花窗',
  30: '亭子前的合影', 31: '奶奶挥挥手', 32: '围成一圈的全家福',
};
var FOCUS = { 28: [0.5, 0.7], 30: [0.5, 0.7] };           // 裁切重心（人在画面下部的长竖图）
var DEFAULT_FOCUS = [0.5, 0.5];
function isPhotoId(id) { return Number.isInteger(id) && id >= 1 && id <= PHOTO_COUNT; }

// ── 照片加载：任何一张失败都报错（成为 MV_ERROR），不静默放行 ──
function loadPhotos() {
  const loadOne = (id) => new Promise((resolve, reject) => {
    const el = document.createElement('img');
    const src = 'photos/p' + String(id).padStart(2, '0') + '.jpg';
    el.onload = () => resolve([id, el]);
    el.onerror = () => reject(new Error('照片加载失败：' + src));
    el.src = src;
  });
  const ids = Array.from({ length: PHOTO_COUNT }, (_, k) => k + 1);
  return Promise.all(ids.map(loadOne)).then((pairs) => {
    PH = Object.fromEntries(pairs);
    bakeAgedPhotos();
  });
}

// 预烘焙做旧照片：一次性把 CSS filter 烘到离屏 canvas，每帧直接 drawImage，不再重复 filter
// 缓存最多 16 张、最长边 960px：间奏的现代照片褪色也复用它，避免动态 filter。
var PH_AGED = {};
var AGED_ORDER = [], AGED_CACHE_LIMIT = 16;
function bakeAgedPhotos() {
  PH_AGED = {}; AGED_ORDER = [];
  for (let id = 13; id <= 24; id++) agedPhoto(id);
}
function agedPhoto(id) {
  if (PH_AGED[id]) {
    AGED_ORDER.splice(AGED_ORDER.indexOf(id), 1); AGED_ORDER.push(id);
    return PH_AGED[id];
  }
  const img = PH[id], scale = Math.min(1, 960 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  const cx = c.getContext('2d'); cx.filter = photoFilter(0); cx.drawImage(img, 0, 0, c.width, c.height);
  cx.filter = 'none'; cx.fillStyle = 'rgba(120,90,40,.16)'; cx.fillRect(0, 0, c.width, c.height);
  PH_AGED[id] = c; AGED_ORDER.push(id);
  if (AGED_ORDER.length > AGED_CACHE_LIMIT) delete PH_AGED[AGED_ORDER.shift()];
  return c;
}

// ── 布局登记：每帧记下照片和歌词在屏幕上的框，tests/check_layout.py 用它查「照片不挡字幕」 ──
var LAYOUT = { t: -1, photos: [], lyrics: [] };
var FRAME_CAM = { zoom: 1, x: 0, y: 0, rot: 0 };
var PHOTO_CAPTURE = null;
var GLYPH_COUNTS = {};

// 每帧最早调用（SCENE.camera）。运行库的约定是直接改 cam：这里让推近以页面底边为锚点，照片只往上长。
function beginFrame(cam, M) {
  cam.y += -(cam.zoom - 1) * (PAGE_BOTTOM - M.H / 2);
  const zoomNow = Math.max(cam.zoom, 1 + 2 * Math.max(Math.abs(cam.x) / M.W, Math.abs(cam.y) / M.H) + Math.abs(cam.rot) * 0.9);
  FRAME_CAM = { zoom: zoomNow, x: cam.x, y: cam.y, rot: cam.rot };
  // push 模式：直接清空数组，避免每帧 spread 创建新对象（高频 GC）
  LAYOUT.t = M.t;
  LAYOUT.photos.length = 0;
  LAYOUT.lyrics.length = 0;
  GLYPH_COUNTS = {};
  window.MV_LAYOUT = LAYOUT;
}

// 当前变换下的矩形 (x, y, w, h) → 合成之后的屏幕包围框 [x0, y0, x1, y1]（1920×1080 逻辑坐标）
function screenBox(g, M, x, y, w, h) {
  const m = g.getTransform(), c = FRAME_CAM, cos = Math.cos(c.rot), sin = Math.sin(c.rot);
  const toScreen = ([px, py]) => {
    const wx = (m.a * px + m.c * py + m.e) / M.SC - M.W / 2, wy = (m.b * px + m.d * py + m.f) / M.SC - M.H / 2;
    return [M.W / 2 + c.x + c.zoom * (cos * wx - sin * wy), M.H / 2 + c.y + c.zoom * (sin * wx + cos * wy)];
  };
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(toScreen);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function registerPhoto(g, M, id, x, y, w, h) {
  if (PHOTO_CAPTURE) {
    const m = g.getTransform();
    const pts = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py]) => [
      (m.a*px+m.c*py+m.e)/M.SC-PAGE_W/2, (m.b*px+m.d*py+m.f)/M.SC-PAGE_H/2]);
    PHOTO_CAPTURE.push({id, box:[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]});
    return;
  }
  if (g.globalAlpha < 0.02) return;
  LAYOUT.photos.push({ id, box: screenBox(g, M, x, y, w, h) });
  window.MV_LAYOUT = LAYOUT;
}
function registerLyricBox(box, lineN, charIndex) {
  LAYOUT.lyrics.push({ box, lineN: lineN !== undefined ? lineN : -1, charIndex });
  window.MV_LAYOUT = LAYOUT;
}

// 这个镜头对应句子里某个词的开唱时间（镜头参数里写 line: 句号）；写错了直接报错，不悄悄退回
function wordTime(M, s, word) {
  const n = s.params.line;
  if (!n) throw new Error(`镜头 ${s.id}（${s.scene}）要用「${word}」的时间，但 params 里没写 line`);
  return M.word(n, word);
}

// ── 纸、桌、灯 ──
var TEX_SIZE = 560;
// 纸纹只画半透明的点和纤维，不填底色：底色由调用方先铺好（v1 这里整块填奶油白，把牛皮纸封面盖掉了）
function paperPattern(g, M, x, y, w, h) {
  const tex = M.cached('paperGrain', TEX_SIZE, TEX_SIZE, (c) => {
    const r = M.rng(11);
    for (let i = 0; i < 2200; i++) { c.fillStyle = `rgba(120,100,70,${.02 + r() * .05})`; c.fillRect(r() * TEX_SIZE, r() * TEX_SIZE, 1 + r() * 2, 1 + r() * 2); }
    for (let i = 0; i < 60; i++) {
      c.strokeStyle = `rgba(150,130,95,${.03 + r() * .05})`; c.lineWidth = .6 + r();
      const yy = r() * TEX_SIZE;
      c.beginPath(); c.moveTo(r() * TEX_SIZE, yy); c.quadraticCurveTo(r() * TEX_SIZE, yy + r() * 24 - 12, r() * TEX_SIZE, yy + r() * 30 - 15); c.stroke();
    }
  });
  g.save(); g.fillStyle = g.createPattern(tex, 'repeat'); g.fillRect(x, y, w, h); g.restore();
}
function paperRect(g, M, x, y, w, h, color) {
  g.fillStyle = color; g.fillRect(x, y, w, h);
  paperPattern(g, M, x, y, w, h);
}

var DESK_W = 960, DESK_H = 540;
function drawDesk(g, M, dimK) {
  const k = dimK === undefined ? 1 : dimK;
  const wood = M.cached('wood', DESK_W, DESK_H, (c) => {
    c.fillStyle = '#241811'; c.fillRect(0, 0, DESK_W, DESK_H);
    const r = M.rng(23);
    for (let i = 0; i < 90; i++) {
      const y = r() * DESK_H; c.strokeStyle = `rgba(60,38,22,${.25 + r() * .3})`; c.lineWidth = 1 + r() * 3;
      c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(320, y + r() * 26 - 13, 640, y + r() * 26 - 13, DESK_W, y + r() * 20 - 10); c.stroke();
    }
    for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(255,205,140,.028)'; c.beginPath(); c.ellipse(r() * DESK_W, r() * DESK_H, 60 + r() * 120, 20 + r() * 30, 0, 0, M.TAU); c.fill(); }
  });
  g.save(); g.globalAlpha = k; g.drawImage(wood, 0, 0, M.W, M.H); g.restore();
}

var LAMP_X = 210, LAMP_Y = 108;
function lampGlow(g, M, k) {
  const gl = g.createRadialGradient(LAMP_X, LAMP_Y, 30, LAMP_X, LAMP_Y, 1200 * k + 200);
  gl.addColorStop(0, `rgba(255,214,150,${.5 * k})`); gl.addColorStop(.35, `rgba(255,196,120,${.16 * k})`); gl.addColorStop(1, 'rgba(255,196,120,0)');
  g.fillStyle = gl; g.fillRect(0, 0, M.W, M.H);
  g.fillStyle = `rgba(255,214,150,${.1 * k})`; g.beginPath(); g.ellipse(PAGE_CX, PAGE_CY, 900, 330, 0, 0, M.TAU); g.fill();
  g.fillStyle = '#2e2620'; g.beginPath();
  g.moveTo(LAMP_X - 120, LAMP_Y + 130); g.lineTo(LAMP_X - 54, LAMP_Y - 120); g.lineTo(LAMP_X + 54, LAMP_Y - 120); g.lineTo(LAMP_X + 120, LAMP_Y + 130);
  g.closePath(); g.fill();
  g.strokeStyle = '#4c4137'; g.lineWidth = 5; g.stroke();
  g.fillStyle = `rgba(255,228,170,${.9 * k})`; g.beginPath(); g.ellipse(LAMP_X, LAMP_Y + 132, 96, 20, 0, 0, M.TAU); g.fill();
}

// 字幕带：页面下方的桌面向下渐暗，保证任何时候字都清楚（画在世界层最上面、歌词下面）
// 用 M.W * 3 覆盖宽度，防止镜头水平平移时留缝
var BAND_TOP = 846;
function captionBand(g, M) {
  const gr = g.createLinearGradient(0, BAND_TOP, 0, M.H);
  gr.addColorStop(0, 'rgba(14,9,5,0)'); gr.addColorStop(.3, 'rgba(14,9,5,.62)'); gr.addColorStop(1, 'rgba(14,9,5,.86)');
  g.fillStyle = gr; g.fillRect(-M.W, BAND_TOP, M.W * 3, M.H);
}

// ── 光、小图形、纸屑 ──
// 灯光呼吸：整幅画面极缓的明暗起伏
function breathe(g, M, t, amp, hz) {
  const k = amp * (0.5 + 0.5 * Math.sin(t * hz + Math.sin(t * 0.37) * 1.4));
  if (k <= 0.001) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = `rgba(255,214,150,${k.toFixed(4)})`; g.fillRect(0, 0, M.W, M.H); g.restore();
}
// 缓慢游移的暖光斑（只在画面区里游）
var DRIFT_SPOTS = 4;
function drift(g, M, t, seed) {
  for (let i = 0; i < DRIFT_SPOTS; i++) {
    const h1 = M.hash(i, seed), h2 = M.hash(i, seed + 1), h3 = M.hash(i, seed + 2);
    const x = (M.noise(t * 0.24 + h1 * 8, i) * 0.5 + 0.5) * (M.W + 360) - 180;
    const y = (M.noise(t * 0.2 + h2 * 8, i + 30) * 0.5 + 0.5) * STAGE_BOTTOM;
    const r = 100 + h3 * 90;
    const m = g.createRadialGradient(x, y, 0, x, y, r);
    m.addColorStop(0, 'rgba(255,214,150,.11)'); m.addColorStop(1, 'rgba(255,214,150,0)');
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = m; g.beginPath(); g.arc(x, y, r, 0, M.TAU); g.fill(); g.restore();
  }
}
function heartPath(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y + s * .9);
  g.bezierCurveTo(x - s * 1.5, y - s * .2, x - s * .7, y - s * 1.1, x, y - s * .35);
  g.bezierCurveTo(x + s * .7, y - s * 1.1, x + s * 1.5, y - s * .2, x, y + s * .9);
  g.closePath();
}
// 剪纸五角星（双色渐变 + 深棕细边）
function star(g, M, x, y, r, rot, fill, fill2, alpha) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * .45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, fill2); gr.addColorStop(1, fill);
  g.fillStyle = gr; g.globalAlpha *= alpha === undefined ? 1 : alpha; g.fill();
  g.strokeStyle = 'rgba(120,70,20,.35)'; g.lineWidth = 2; g.stroke();
  g.restore();
}

// 自绘纸屑：小纸片翻着落下，位置只由 t 决定。
// o: { t0, dur, n, seed, x, y, spread, up }（从一点喷出）或 { t0, dur, n, seed, x0, x1 }（从顶上撒下）；o.floor 是落到哪条线淡出（默认屏幕坐标的页面底边，页内坐标里用时要自己给）
var CONFETTI_COLORS = ['#e8483f', '#f0b93a', '#f6efdd', '#7fb5a0', '#e58fa0'];
var CONFETTI_GRAVITY = 620, CONFETTI_FLOOR = 836, CONFETTI_FADE = 90;
function confettiPos(M, o, i, age) {
  const h1 = M.hash(i, o.seed), h2 = M.hash(i, o.seed + 1), h3 = M.hash(i, o.seed + 2);
  if (o.x0 === undefined) {
    return { x: o.x + (h1 - .5) * o.spread * age, y: o.y - (0.35 + h2 * 0.65) * o.up * age + 0.5 * CONFETTI_GRAVITY * age * age, a: 1 };
  }
  const local = age - h2 * o.dur * 0.45;
  return { x: o.x0 + h1 * (o.x1 - o.x0) + Math.sin(age * 1.3 + i) * 34, y: -30 + local * (150 + h3 * 130), a: local > 0 ? 1 : 0 };
}
function paperConfetti(g, M, t, o) {
  const age = t - o.t0;
  if (age < 0 || age > o.dur) return;
  const endFade = M.clamp((o.dur - age) / 0.5);
  for (let i = 0; i < o.n; i++) {
    const p = confettiPos(M, o, i, age);
    const alpha = p.a * endFade * M.clamp(((o.floor === undefined ? CONFETTI_FLOOR : o.floor) - p.y) / CONFETTI_FADE);
    if (alpha <= 0.01) continue;
    const h3 = M.hash(i, o.seed + 3), h4 = M.hash(i, o.seed + 4);
    g.save(); g.globalAlpha = alpha; g.translate(p.x, p.y); g.rotate(age * (2 + h3 * 3) + i);
    g.scale(1, Math.cos(age * (5 + h4 * 4) + i));                  // 纸片翻面
    g.fillStyle = CONFETTI_COLORS[i % CONFETTI_COLORS.length]; g.fillRect(-9, -6, 18, 12);
    g.restore();
  }
}

// ── 照片卡 ──
// 按裁切重心铺满 (x, y, w, h)；支持 HTMLImageElement 和离屏 HTMLCanvasElement
function drawImgCover(g, img, x, y, w, h, focus) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, f = focus || DEFAULT_FOCUS;
  const sc = Math.max(w / iw, h / ih), sw = w / sc, sh = h / sc;
  g.drawImage(img, (iw - sw) * f[0], (ih - sh) * f[1], sw, sh, x, y, w, h);
}
// 照片按真实长宽比（限制在 MIN_ASPECT–MAX_ASPECT）放进 maxW×maxH 的框里，返回 { w, h }
function photoSize(id, maxW, maxH) {
  const img = PH[id];
  if (!img) throw new Error('没有这张照片：p' + id);
  const aspect = Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, img.naturalWidth / img.naturalHeight));
  const w = Math.min(maxW, maxH * aspect);
  return { w, h: w / aspect };
}
var CARD_BORDER_K = 0.048, CARD_PAPER = '#fbf6e8', CARD_EDGE = '#c9bb98';
var CAPTION_PX = 31, CAPTION_GAP = 22;
function photoFilter(sat) {
  return `sepia(${(.55 * (1 - sat)).toFixed(3)}) saturate(${(.5 + .5 * sat).toFixed(3)}) contrast(.94) brightness(1.05)`;
}
function tapeCorners(g, w, h) {
  for (const sgn of [-1, 1]) {
    g.save(); g.translate(sgn * (w / 2 - 6), -h / 2 + 6); g.rotate(sgn * .7);
    g.fillStyle = 'rgba(238,226,190,.82)'; g.fillRect(-52, -16, 104, 32);
    g.strokeStyle = 'rgba(160,140,100,.4)'; g.lineWidth = 1.5; g.strokeRect(-52, -16, 104, 32);
    g.restore();
  }
}
// 白边照片卡，画在当前变换的原点（调用方先 translate / rotate / scale）。
// o: { w, h, sat（1 彩色 … 0 做旧，默认 1）, caption（写图注）, tape（贴胶带角） }
// 画的同时把整张卡（含白边和图注）登记进本帧布局。
function photoCard(g, M, id, o) {
  const img = PH[id];
  if (!img) throw new Error('没有这张照片：p' + id);
  const w = o.w, h = o.h, sat = o.sat === undefined ? 1 : o.sat, bw = Math.round(w * CARD_BORDER_K) + 4;
  g.fillStyle = 'rgba(20,12,4,.3)'; g.beginPath(); g.ellipse(4, h / 2 + bw + 6, w * .5, 14, 0, 0, M.TAU); g.fill();
  g.fillStyle = CARD_PAPER; g.fillRect(-w / 2 - bw, -h / 2 - bw, w + bw * 2, h + bw * 2);
  g.strokeStyle = CARD_EDGE; g.lineWidth = 2.5; g.strokeRect(-w / 2 - bw, -h / 2 - bw, w + bw * 2, h + bw * 2);
  g.save(); g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.clip();
  drawImgCover(g, img, -w / 2, -h / 2, w, h, FOCUS[id]);
  if (sat < 1) {
    g.save(); g.globalAlpha *= 1 - M.clamp(sat);
    drawImgCover(g, agedPhoto(id), -w / 2, -h / 2, w, h, FOCUS[id]); g.restore();
  }
  g.restore();
  if (o.tape) tapeCorners(g, w, h);
  const capH = o.caption ? CAPTION_GAP + CAPTION_PX : 0;
  if (o.caption) {
    g.font = CAPTION_PX + 'px "LXGWWenKai"'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillStyle = INK; g.fillText(CAP[id] || '', -w / 2, h / 2 + bw + CAPTION_GAP);
  }
  registerPhoto(g, M, id, -w / 2 - bw, -h / 2 - bw, w + bw * 2, h + bw * 2 + capH);
}

// ── 相册跨页（页内坐标：原点在跨页中心，PAGE_W×PAGE_H）──
var PAGE_TONES = { plain: '#f3ead2', old: '#e8d8ae', festive: '#f6ead0', night: '#171226' };
var KEN_BURNS = { normal: [1.0, 1.045, 'inOut2'], slow: [1.02, 1.07, 'inOut3'], closeup: [1.04, 1.1, 'inOut2'] };
var FLIP_BEATS = 0.9;          // 翻一页用多少拍
var FLIP_LIFT = 0.07;          // 翻到一半时纸页外沿看上去长出多少（近大远小）
var POP_AFTER_FLIP = 0.55;     // 纸页翻过这么多之后，左页的照片才弹起来

function flipDur(M) { return FLIP_BEATS * M.song.beat; }
function photoPopTime(M, s) { return s.t0 + flipDur(M) * POP_AFTER_FLIP; }

function bookBase(g, M, tone) {
  const hw = PAGE_W / 2, hh = PAGE_H / 2;
  g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(0, hh + 26, hw * 1.03, 52, 0, 0, M.TAU); g.fill();
  g.fillStyle = '#7c6b4d'; g.fillRect(-hw - 12, -hh - 10, PAGE_W + 24, PAGE_H + 36);
  for (let i = 4; i >= 1; i--) { g.fillStyle = i % 2 ? '#efe5c9' : '#ddd2b2'; g.fillRect(-hw, -hh - i * 3, PAGE_W, PAGE_H); }
  paperRect(g, M, -hw, -hh, PAGE_W, PAGE_H, PAGE_TONES[tone]);
  if (tone === 'old') {                                             // 老照片页的做旧斑点
    const r = M.rng(7);
    g.save(); g.globalAlpha = .1; g.fillStyle = '#8a6b3a';
    for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse((r() - .5) * PAGE_W, (r() - .5) * PAGE_H, 20 + r() * 60, 14 + r() * 30, r() * 3, 0, M.TAU); g.fill(); }
    g.restore();
    // 整页棕褐暖调 overlay：让白边照片卡也带上「老纸感」，强化时空切换的视觉信号
    g.save(); g.fillStyle = 'rgba(140,100,60,.12)';
    g.fillRect(-PAGE_W / 2, -PAGE_H / 2, PAGE_W, PAGE_H); g.restore();
  }
  const gutter = g.createLinearGradient(-46, 0, 46, 0);
  gutter.addColorStop(0, 'rgba(70,48,24,0)'); gutter.addColorStop(.5, 'rgba(70,48,24,.3)'); gutter.addColorStop(1, 'rgba(70,48,24,0)');
  g.fillStyle = gutter; g.fillRect(-46, -hh, 92, PAGE_H);
  g.strokeStyle = tone === 'old' ? 'rgba(70,48,24,.6)' : 'rgba(90,66,36,.4)'; g.lineWidth = 3; g.strokeRect(-hw, -hh, PAGE_W, PAGE_H);
}

// 页内容与世界分开：旧页由前镜头的描述确定，与访问/播放顺序无关。
var SPREAD_CACHE = new Map(), SPREAD_CACHE_LIMIT = 3, SPREAD_SCRATCH = null;
function isBookShot(s) { return !!s && ['page', 'cake', 'night'].includes(s.scene); }
function spreadTone(s) {
  if (s.scene === 'night') return 'night';
  if (s.scene === 'cake') return ['big', 'relight'].includes(s.params.mode) ? 'festive' : 'plain';
  return s.params.era === 'old' ? 'old' : 'plain';
}
function shotAtTime(M, shot, t) {
  return { ...shot, params: shot.params || {}, t, lt: Math.max(0,t-shot.t0), p:M.clamp((t-shot.t0)/shot.dur) };
}
function previousBookShot(M, s) { return M.shots()[s.i - 1] || null; }
function drawSpreadContent(g, M, s) {
  if (s.scene === 'page') drawPageContent(g, M, s);
  else if (s.scene === 'cake') drawCakeContent(g, M, s);
  else if (s.scene === 'night') drawNightContent(g, M, s);
}
function spreadDim(M, s) {
  return s.scene === 'cake' && s.params.mode === 'blowout'
    ? BLOWOUT_DIM * M.clamp((s.t - wordTime(M,s,s.params.word)) / BLOWOUT_DIM_S) : 0;
}
function finishSpreadLight(g, M, s) {
  if (s.scene !== 'night') {
    // 台灯在纸面上留下克制的暖光，照片和字形不经过整帧模糊。
    const glow = M.cached('pageLamplight', 384, 224, (c) => {
      const gr=c.createRadialGradient(20,0,0,20,0,400);
      gr.addColorStop(0,'rgba(255,220,154,.12)');gr.addColorStop(1,'rgba(255,220,154,0)');
      c.fillStyle=gr;c.fillRect(0,0,384,224);
    });
    g.drawImage(glow,-PAGE_W/2,-PAGE_H/2,PAGE_W,PAGE_H);
  }
  const dim=spreadDim(M,s);
  if(dim>0){g.fillStyle=`rgba(10,6,3,${dim})`;g.fillRect(-PAGE_W/2,-PAGE_H/2,PAGE_W,PAGE_H);}
}
function spreadSnapshot(M, shot, t, cache) {
  const key=shot.id+'|'+M.SC;
  if(cache && SPREAD_CACHE.has(key)) return SPREAD_CACHE.get(key);
  const c=cache?document.createElement('canvas'):(SPREAD_SCRATCH||(SPREAD_SCRATCH=document.createElement('canvas')));
  const w=Math.round(PAGE_W*M.SC),h=Math.round(PAGE_H*M.SC);
  if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;
  const g=c.getContext('2d'), records=[], oldCapture=PHOTO_CAPTURE, oldT=M.t, oldS=M.s;
  const at=shotAtTime(M,shot,t);
  g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,c.width,c.height);g.save();
  g.setTransform(M.SC,0,0,M.SC,PAGE_W/2*M.SC,PAGE_H/2*M.SC);
  try {
    PHOTO_CAPTURE=records;M.t=t;M.s=at;
    bookBase(g,M,spreadTone(at));drawSpreadContent(g,M,at);finishSpreadLight(g,M,at);
  } finally { PHOTO_CAPTURE=oldCapture;M.t=oldT;M.s=oldS;g.restore(); }
  const result={canvas:c,photos:records};
  if(cache){SPREAD_CACHE.set(key,result);if(SPREAD_CACHE.size>SPREAD_CACHE_LIMIT)SPREAD_CACHE.delete(SPREAD_CACHE.keys().next().value);}
  return result;
}
function registerSpreadPhotos(g,M,snap,side,map) {
  const hw=PAGE_W/2,hh=PAGE_H/2,lo=side<0?-hw:0,hi=side<0?0:hw;
  for(const ph of snap.photos){
    const b=ph.box,x0=Math.max(lo,b[0]),x1=Math.min(hi,b[2]),y0=Math.max(-hh,b[1]),y1=Math.min(hh,b[3]);
    if(x1<=x0||y1<=y0)continue;
    const pts=[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[(x0+x1)/2,y0],[(x0+x1)/2,y1]].map(p=>map?map(...p):p);
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),bx=Math.min(...xs),by=Math.min(...ys);
    registerPhoto(g,M,ph.id,bx,by,Math.max(...xs)-bx,Math.max(...ys)-by);
  }
}
function flatSpreadHalf(g,M,snap,side) {
  g.save();g.beginPath();g.rect(side<0?-PAGE_W/2:0,-PAGE_H/2,PAGE_W/2,PAGE_H);g.clip();
  g.drawImage(snap.canvas,-PAGE_W/2,-PAGE_H/2,PAGE_W,PAGE_H);
  registerSpreadPhotos(g,M,snap,side);g.restore();
}
// 24 条纸面切片逼近弯曲；底边向上抬，翻页不会伸入字幕带。
function leafPoint(M,x,y,k) {
  const theta=M.ease.inOut2(k)*Math.PI,c=Math.cos(theta),lift=Math.sin(theta),u=Math.abs(x)/(PAGE_W/2);
  return [Math.sign(x)*Math.abs(c)*Math.abs(x)+Math.sin(u*Math.PI)*18*lift,
    PAGE_H/2-(PAGE_H/2-y)*(1+0.035*lift*u)-26*lift*u];
}
function pageFlip(g,M,k,oldPage,newPage) {
  const front=k<0.5,side=front?1:-1,snap=front?oldPage:newPage;
  const hw=PAGE_W/2,hh=PAGE_H/2,n=24,sw=hw/n,scale=snap.canvas.width/PAGE_W;
  const lift=Math.sin(M.ease.inOut2(k)*Math.PI),edge=leafPoint(M,side*hw,0,k)[0];
  const shadow=g.createLinearGradient(edge-80,0,edge+140,0);
  shadow.addColorStop(0,'rgba(40,24,8,0)');shadow.addColorStop(.4,`rgba(40,24,8,${.22*lift})`);shadow.addColorStop(1,'rgba(40,24,8,0)');
  g.fillStyle=shadow;g.fillRect(edge-80,-hh,220,PAGE_H);
  for(let i=0;i<n;i++){
    const sx=(front?hw:0)+i*sw,x0=(front?0:-hw)+i*sw,x1=x0+sw;
    const a=leafPoint(M,x0,-hh,k),b=leafPoint(M,x1,-hh,k),d=leafPoint(M,x0,hh,k),e=leafPoint(M,x1,hh,k);
    const width=b[0]-a[0];if(width<0.01)continue;
    g.save();g.transform(width/sw,(b[1]-a[1])/sw,0,((d[1]-a[1])+(e[1]-b[1]))/(2*PAGE_H),a[0],a[1]);
    g.drawImage(snap.canvas,sx*scale,0,sw*scale,snap.canvas.height,0,0,sw+0.4,PAGE_H);
    g.fillStyle=`rgba(65,42,20,${lift*(front?.08:.14)})`;g.fillRect(0,0,sw+0.4,PAGE_H);g.restore();
  }
  registerSpreadPhotos(g,M,snap,side,(x,y)=>leafPoint(M,x,y,k));
  g.strokeStyle=`rgba(255,246,218,${.25+.5*lift})`;g.lineWidth=2;
  const top=leafPoint(M,side*hw,-hh,k),bottom=leafPoint(M,side*hw,hh,k);
  g.beginPath();g.moveTo(...top);g.lineTo(...bottom);g.stroke();
}

// 镜头内的推近以页面底边为锚点：照片只往上长，不会压进字幕带
function pageZoom(M, s) {
  const kb = KEN_BURNS[s.params.kb] || KEN_BURNS.normal;
  return M.lerp(kb[0], kb[1], M.ease[kb[2]](s.p)) * (1 + 0.012 * M.pulse('bar', { decay: 0.3 }));
}
// 跨页世界：桌面 + 台灯 + 相册页 + drawContent(g)（页内坐标）+ 翻页
function pageWorld(ctx, M, s, drawContent, tone) {
  const prev=previousBookShot(M,s),k=M.clamp(s.lt/flipDur(M)),blend=M.ease.inOut2(k);
  let zoom=pageZoom(M,s);
  if(isBookShot(prev)&&k<1){
    const oldT=M.t;M.t=prev.t1-1e-4;
    const fromZoom=pageZoom(M,shotAtTime(M,prev,prev.t1-1e-4));M.t=oldT;
    zoom=M.lerp(fromZoom,zoom,blend);
  }
  const ambient=(sh,t)=>sh&&sh.scene==='night'?{desk:0.3,lamp:0.08}:{desk:1-(isBookShot(sh)?spreadDim(M,shotAtTime(M,sh,t)):0),lamp:1-(isBookShot(sh)?spreadDim(M,shotAtTime(M,sh,t)):0)};
  const fromLight=ambient(prev,s.t0-1e-4),toLight=ambient(s,s.t);
  const light=M.lerp(fromLight.desk,toLight.desk,blend),lamp=M.lerp(fromLight.lamp,toLight.lamp,blend);
  ctx.save();ctx.translate(PAGE_CX,PAGE_BOTTOM);ctx.scale(zoom,zoom);ctx.translate(-PAGE_CX,-PAGE_BOTTOM);
  drawDesk(ctx,M,light);lampGlow(ctx,M,lamp);
  ctx.save();ctx.translate(PAGE_CX,PAGE_CY);ctx.scale(PAGE_SCALE,PAGE_SCALE);
  bookBase(ctx,M,tone);
  if(k<1&&isBookShot(prev)){
    const oldPage=spreadSnapshot(M,prev,prev.t1-1e-4,true),newPage=spreadSnapshot(M,s,s.t,false);
    if(s.scene==='cake'&&s.params.mode==='blowout'){
      // 吹灭动作只有150ms，先短交接让火焰可见，不以翻页遮住关键词。
      const fade=M.smooth(0,.1,s.lt);
      ctx.save();ctx.globalAlpha=1-fade;
      flatSpreadHalf(ctx,M,oldPage,-1);flatSpreadHalf(ctx,M,oldPage,1);ctx.restore();
      ctx.save();ctx.globalAlpha=fade;
      flatSpreadHalf(ctx,M,newPage,-1);flatSpreadHalf(ctx,M,newPage,1);ctx.restore();
    }else{
      flatSpreadHalf(ctx,M,oldPage,-1);flatSpreadHalf(ctx,M,newPage,1);
      pageFlip(ctx,M,k,oldPage,newPage);
    }
  }else{
    drawContent(ctx);finishSpreadLight(ctx,M,s);
    if(k<1&&prev&&prev.scene==='desk'){
      ctx.save();ctx.translate(-COVER_W/2,0);ctx.transform(Math.cos(blend*Math.PI/2),-.035*Math.sin(blend*Math.PI),0,1,0,0);ctx.translate(COVER_W/2,0);
      if(k<.999)albumCover(ctx,M,{});ctx.restore();
    }
  }
  ctx.restore();ctx.restore();
  drift(ctx,M,s.t,21);breathe(ctx,M,s.t,s.scene==='night'?.008:.008*light,2.2);
}

// 页面上的照片（左页为主）：翻页落下后弹起，带图注和胶带角。slot: 'main'（左，配右页零件）| 'left' | 'right'（双照片页）
var PAGE_SLOTS = { main: { x: -250, maxW: 760, maxH: 640 }, left: { x: -390, maxW: 560, maxH: 600 }, right: { x: 390, maxW: 560, maxH: 600 } };
var PAGE_PHOTO_Y = -44, MAIN_PORTRAIT_W = 480;
function pagePhoto(g, M, s, id, slotName, sat, delay) {
  const slot = PAGE_SLOTS[slotName], size = photoSize(id, slot.maxW, slot.maxH);
  const kIn = 0.97 + 0.03 * M.ease.out3(M.clamp((s.t - s.t0 - (delay || 0)) / 0.55));
  if (kIn <= 0) return;
  const shift = slotName === 'main' ? Math.max(0, size.w - MAIN_PORTRAIT_W) * 0.25 : 0;   // 横图往右挪一点，别顶出左页
  const rot = (M.hash(id, 55) - .5) * 0.05, bob = Math.sin(s.t * 1.8 + id) * 3;
  g.save(); g.translate(slot.x + shift, PAGE_PHOTO_Y + bob); g.rotate(rot); g.scale(kIn, kIn);
  photoCard(g, M, id, { w: size.w, h: size.h, sat, caption: true, tape: true });
  g.restore();
}
