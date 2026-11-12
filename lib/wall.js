// lib/wall.js —— 桌面上铺开的照片：间奏的「时光倒流」蒙太奇（montage）和终副歌的照片墙（wall）。
// 由 scene.js 的 montage / wall 镜头调用。依赖 lib/parts.js（photoCard、photoSize、paperConfetti、heartPath …）、
// lib/decor.js（yearRing）、lib/cover.js（albumCover）。
// 修复计划 ④：所有照片都在画面区里（下沿不过 PAGE_BOTTOM），推近以页面底边为锚点。
// 镜头参数：wall：mode（rain 照片雨 / fan 折扇 / heart 心形 / heart2 长大的心 + 年轮 / gather 收回相册）、
//           line（heart：唱到这句的「时光」心形轮廓亮起）

var WALL_CX = 960;
var WALL_MODES = ['rain', 'fan', 'heart', 'heart2', 'gather'];
// 新加的 7 张（p26–p32）排在最前面，保证每种排法里都有它们
var WALL_IDS = [26, 27, 28, 29, 30, 31, 32, 25, 1, 3, 7, 6, 12, 23, 2, 4, 5, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24];
var WALL_DESK_DIM = 0.5, WALL_GLOW_Y = 900, WALL_GLOW_R = 920;
var WALL_HIT = '心墙';                                     // 卡点表里那个大时刻的名字：折扇炸开、红心飞出

// 新照片（p26–p32 里的四张）混进间奏散照片：p29 在 bar39 单独一页，p32 留给结尾
var MONTAGE_IDS = [26, 6, 27, 12, 23, 19, 21, 14, 17, 31, 30, 5, 9, 8];
var MONTAGE_COLS = 7, MONTAGE_X0 = 200, MONTAGE_GAP_X = 253, MONTAGE_ROW_Y = [220, 630];
var MONTAGE_BOX = { w: 230, h: 290 }, MONTAGE_STAGGER_S = 0.18, MONTAGE_FADED_SAT = 0.25;
var OLD_PHOTO_FIRST = 13, OLD_PHOTO_LAST = 24;            // 这一段是老照片，永远做旧

var RAIN_N = 22, RAIN_ID_OFFSET = 10, RAIN_X0 = 130, RAIN_GAP_X = 166, RAIN_ROW_Y = [230, 560];
var RAIN_BOX = { w: 150, h: 190 }, RAIN_FALL_S = 0.55, RAIN_SPREAD_BEATS = 3, RAIN_START_Y = -240;
var RAIN_CONFETTI = { n: 70, seed: 61, x0: 60, x1: 1860 };

var FAN_N = 15, FAN_HALF_DEG = 76, FAN_PIVOT_Y = 810, FAN_R = 580, FAN_BOX = { w: 172, h: 220 };
var FAN_STAGGER_S = 0.045, FAN_BURST_R = 0.1, FAN_BURST_SCALE = 0.12;
var FAN_HEARTS = 13, FAN_HEARTS_S = 1.4;

var HEART = { n: 17, sc: 20, cy: 350, box: { w: 112, h: 140 } };
var HEART2 = { n: 21, sc: 21.5, cy: 356, box: { w: 100, h: 126 } };
var HEART_STRETCH = 1.2, HEART_OUTLINE_K = 1.2, HEART_OUTLINE_S = 0.9;
var WALL_MORPH_S = 0.8;
var GATHER_Y = 400, GATHER_ALBUM_AT = 0.58, GATHER_ALBUM_SCALE = 0.42, GATHER_HEARTS = 10;

// 卡点表写错了（模式名、缺少「心墙」时刻）就在加载时报错
function checkWallCues(M) {
  const walls = M.cues.shots.filter((sh) => sh.scene === 'wall');
  for (const sh of walls) {
    const mode = (sh.params || {}).mode;
    if (!WALL_MODES.includes(mode)) throw new Error(`镜头 ${sh.at}：照片墙没有 "${mode}" 这种排法`);
  }
  const hasFan = walls.some((sh) => sh.params.mode === 'fan');
  if (hasFan && !M.moment(WALL_HIT)) throw new Error(`照片墙的折扇要用名叫「${WALL_HIT}」的时刻，卡点表的 moments 里没有`);
}

// 一张墙上的照片卡：pose = { x, y, rot, k（缩放）, sat }
function wallCard(g, M, id, pose, box) {
  if (pose.k <= 0 || (pose.alpha !== undefined && pose.alpha <= 0.01)) return;
  const size = pose.w !== undefined ? { w: pose.w, h: pose.h } : photoSize(id, box.w, box.h);
  g.save(); g.globalAlpha *= pose.alpha === undefined ? 1 : pose.alpha; g.translate(pose.x, pose.y); g.rotate(pose.rot); g.scale(pose.k, pose.k);
  photoCard(g, M, id, { w: size.w, h: size.h, sat: pose.sat });
  g.restore();
}

// 间奏：照片一张张拍在桌面上，彩色的慢慢褪成旧照片 —— 时光往回走
function drawMontageShot(ctx, s, M) {
  const t = s.t, barK = M.pulse('bar', { decay: 0.4 });
  drawDesk(ctx, M); lampGlow(ctx, M, 1);
  softGlow(ctx, M, LAMP_X, LAMP_Y, 820, 0.22);   // 台灯补光，穿透照片卡间隙
  MONTAGE_IDS.forEach((id, i) => {
    const h1 = M.hash(i, 5), h2 = M.hash(i, 9), h3 = M.hash(i, 13);
    const k = M.ease.outBack(M.clamp((t - s.t0 - (i % MONTAGE_COLS) * MONTAGE_STAGGER_S) / 0.3), 2);
    const isOld = id >= OLD_PHOTO_FIRST && id <= OLD_PHOTO_LAST;
    // 后排（row 0）±5°以内随机旋转，视觉打散整齐感
    const baseRot = (h3 - 0.5) * 0.4;
    const extraRot = i < MONTAGE_COLS ? (M.hash(i, 44) - 0.5) * 0.17 : 0;
    wallCard(ctx, M, id, {
      x: MONTAGE_X0 + (i % MONTAGE_COLS) * MONTAGE_GAP_X + (h1 - 0.5) * 70,
      y: MONTAGE_ROW_Y[i < MONTAGE_COLS ? 0 : 1] + (h2 - 0.5) * 60 + Math.sin(t * 2 + i) * 6 * barK,
      rot: baseRot + extraRot, k: k * (1 + 0.03 * barK),
      sat: isOld ? 0 : M.lerp(1, MONTAGE_FADED_SAT, s.p),
    }, MONTAGE_BOX);
  });
  drift(ctx, M, t, 31); breathe(ctx, M, t, 0.016, 2.4);
}

function wallBackdrop(g, M) {
  drawDesk(g, M, WALL_DESK_DIM);
  const amp = 0.26 + 0.14 * M.pulse('kick', { decay: 0.28 });
  const gl = g.createRadialGradient(WALL_CX, WALL_GLOW_Y, 60, WALL_CX, WALL_GLOW_Y, WALL_GLOW_R);
  gl.addColorStop(0, `rgba(255,196,110,${amp.toFixed(3)})`); gl.addColorStop(1, 'rgba(255,196,110,0)');
  g.fillStyle = gl; g.fillRect(0, 0, M.W, M.H);
}

// 折扇上炸出来的红心纸片
function fanHearts(g, M) {
  const age = M.after(WALL_HIT);
  if (age < 0 || age >= FAN_HEARTS_S) return;
  const hk = age / FAN_HEARTS_S;
  for (let i = 0; i < FAN_HEARTS; i++) {
    const h1 = M.hash(i, 41), h2 = M.hash(i, 43);
    const size = (0.5 + h2 * 0.6) * Math.sin(Math.min(1, hk * 1.15) * Math.PI);
    if (size <= 0) continue;
    const x = WALL_CX + (h1 - 0.5) * 1500 * hk;
    const y = M.lerp(FAN_PIVOT_Y, 120 + h2 * 420, M.ease.out3(hk)) - Math.sin(hk * Math.PI) * 120;
    g.save(); g.translate(x, y); g.rotate((h1 - 0.5) * 2.4 * hk); g.scale(size, size);
    heartPath(g, 0, 0, 44); g.fillStyle = i % 3 ? RED : '#f2a03c'; g.fill();
    g.strokeStyle = DECO_RED_DARK; g.lineWidth = 3; g.stroke();
    g.restore();
  }
}

// 心形参数方程上的一点（单位心：宽 ±16，上 12，下 -17）
function heartPoint(th) {
  return [16 * Math.sin(th) ** 3, 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th)];
}
function heartSpot(i, n, shape) {
  const [hx, hy] = heartPoint(-Math.PI / 2 + Math.PI * 2 * i / n);
  return { x: WALL_CX + hx * shape.sc * HEART_STRETCH, y: shape.cy - hy * shape.sc };
}
// 两个心形之间的过渡（k 0→1）
function blendShape(M, k) {
  return { sc: M.lerp(HEART.sc, HEART2.sc, k), cy: M.lerp(HEART.cy, HEART2.cy, k),
    box: { w: M.lerp(HEART.box.w, HEART2.box.w, k), h: M.lerp(HEART.box.h, HEART2.box.h, k) } };
}
function heartOutline(g, M, t, shape, lit) {
  if (lit <= 0) return;
  g.save(); g.strokeStyle = RED; g.lineWidth = 7; g.globalAlpha = 0.85 * lit;
  g.setLineDash([12, 10]); g.lineDashOffset = -t * 60;
  g.beginPath();
  for (let j = 0; j <= 90; j++) {
    const [hx, hy] = heartPoint(-Math.PI / 2 + Math.PI * 2 * j / 90);
    const x = WALL_CX + hx * shape.sc * HEART_STRETCH * HEART_OUTLINE_K, y = shape.cy - hy * shape.sc * HEART_OUTLINE_K;
    if (j === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke(); g.restore();
}

// 收拢时从桌面升起来的小红心（只在画面区里飘）
function risingHearts(g, M, t) {
  for (let i = 0; i < GATHER_HEARTS; i++) {
    const h1 = M.hash(i, 71), h2 = M.hash(i, 73), u = (t * (0.1 + h1 * 0.08) + h2) % 1;
    const y = M.lerp(CONFETTI_FLOOR, -80, u);
    g.save(); g.globalAlpha = 0.5 * M.clamp(u / 0.12);
    g.translate(WALL_CX + (h1 - 0.5) * 1500 + Math.sin(t + i) * 24, y); g.rotate(Math.sin(t * 1.3 + i) * 0.3);
    heartPath(g, 0, 0, 16 + h2 * 14); g.fillStyle = i % 3 ? RED : '#f2a03c'; g.fill();
    g.strokeStyle = DECO_RED_DARK; g.lineWidth = 2; g.stroke();
    g.restore();
  }
}

// 照片墙姿态只依赖镜头、照片编号和时间，支持直接跳到任意帧。
// 所有模式用同一张照片卡：尺寸、位置、角度、透明度和层级一起变，不再在切镜时重新弹入。
function wallSequence(M) {
  return M.shots().filter((shot) => shot.scene === 'wall');
}
function wallPoseSize(id, pose, box) {
  const size = photoSize(id, box.w, box.h);
  return { ...pose, w: size.w, h: size.h, alpha: 1, sat: 1 };
}
function wallTargetPose(M, shot, id, t) {
  const mode = shot.params.mode, i = WALL_IDS.indexOf(id);
  const kick = M.pulse('kick', { t, decay: 0.25 }), bar = M.pulse('bar', { t, decay: 0.3 });
  if (mode === 'rain') {
    const j = i - RAIN_ID_OFFSET;
    if (j < 0 || j >= RAIN_N) return null;
    const h1 = M.hash(j, 3), h2 = M.hash(j, 8), h3 = M.hash(j, 15);
    const start = shot.t0 + Math.round(h3 * RAIN_SPREAD_BEATS) * M.song.beat;
    const land = start + RAIN_FALL_S, u = M.clamp((t - start) / RAIN_FALL_S);
    const fall = M.ease.out3(u), age = Math.max(0, t - land);
    const bounce = age > 0 ? Math.sin(age * 21) * Math.exp(-age / 0.16) : 0;
    const restY = RAIN_ROW_Y[j % 2] + (h2 - 0.5) * 110;
    const pose = wallPoseSize(id, {
      x: RAIN_X0 + Math.floor(j / 2) * RAIN_GAP_X + (h1 - 0.5) * 60 + Math.sin(u * Math.PI) * (h3 - 0.5) * 90,
      y: M.lerp(RAIN_START_Y, restY, fall) - bounce * 10 + Math.sin(t * 1.6 + j * 2.2) * 5 * M.smooth(land, land + 0.3, t),
      rot: (h2 - 0.5) * 0.45 * fall + Math.sin(t * 1.1 + j) * 0.025,
      k: 1 + 0.025 * bounce + 0.025 * kick, z: j,
    }, RAIN_BOX);
    pose.alpha = M.smooth(start, start + 0.1, t);
    return pose;
  }
  if (mode === 'fan') {
    if (i >= FAN_N) return null;
    const burst = M.hit(WALL_HIT, { t, decay: 0.5 });
    const r = FAN_R * (1 + burst * FAN_BURST_R), half = FAN_HALF_DEG * Math.PI / 180;
    const ang = M.lerp(-half, half, i / (FAN_N - 1));
    return wallPoseSize(id, {
      x: WALL_CX + Math.sin(ang) * r, y: FAN_PIVOT_Y - Math.cos(ang) * r,
      rot: ang, k: 1 + 0.025 * kick + burst * FAN_BURST_SCALE, z: i,
    }, FAN_BOX);
  }
  if (mode === 'heart' || mode === 'heart2') {
    const shape = mode === 'heart2' ? HEART2 : HEART;
    if (i >= shape.n) return null;
    const p = heartSpot(i, shape.n, shape);
    return wallPoseSize(id, {
      x: p.x, y: p.y + Math.sin(t * 2.1 + i * 1.3) * 3 + bar * 2,
      rot: (M.hash(i, 21) - 0.5) * 0.24 + Math.sin(t * 1.7 + i) * 0.025,
      k: 1 + 0.025 * bar, z: i,
    }, shape.box);
  }
  if (mode === 'gather') {
    if (i >= HEART2.n) return null;
    return wallPoseSize(id, {
      x: WALL_CX + (M.hash(i, 3) - 0.5) * 70, y: GATHER_Y + i * 2,
      rot: (M.hash(i, 8) - 0.5) * 0.08 + Math.sin(t * 1.3 + i) * 0.008,
      k: 0.82, z: i,
    }, HEART2.box);
  }
  throw new Error(`照片墙没有 "${mode}" 这种排法`);
}
function wallSpinePose(M, id, reference) {
  return { ...reference, x: WALL_CX + (M.hash(id, 81) - 0.5) * 84,
    y: GATHER_Y + 50, rot: (M.hash(id, 83) - 0.5) * 0.15,
    k: reference.k * 0.6, alpha: 0 };
}
function mixWallPose(M, from, to, u) {
  const k = M.ease.inOut3(M.clamp(u));
  const mixed = {};
  for (const key of ['x', 'y', 'rot', 'k', 'w', 'h', 'alpha', 'sat', 'z']) mixed[key] = M.lerp(from[key], to[key], k);
  // 从桌面轻轻提起再落下；曲线在起终点均为零，不改变边界姿态。
  mixed.y -= Math.sin(Math.PI * k) * Math.min(48, Math.hypot(to.x - from.x, to.y - from.y) * 0.065);
  return mixed;
}
// 对外可测接口：切镜 t0 处等于前镜头在同一时刻的姿态，绝不读取上一帧。
function getWallPose(M, shot, id, t, sequence) {
  const time = t === undefined ? shot.t : t, seq = sequence || wallSequence(M);
  const index = seq.findIndex((item) => item.id === shot.id || item.t0 === shot.t0);
  const target = wallTargetPose(M, shot, id, time);
  if (index <= 0) return target;
  const u = M.clamp((time - shot.t0) / WALL_MORPH_S);
  if (u >= 1) return target;
  const previous = getWallPose(M, seq[index - 1], id, shot.t0, seq);
  if (!target && !previous) return null;
  const from = previous || wallSpinePose(M, id, target);
  const to = target || wallSpinePose(M, id, previous);
  return mixWallPose(M, from, to, u);
}
function getWallPoses(M, shot, t) {
  const seq = wallSequence(M);
  return WALL_IDS.map((id) => ({ id, pose: getWallPose(M, shot, id, t, seq) }))
    .filter((item) => item.pose && item.pose.alpha > 0.01)
    .sort((a, b) => a.pose.z - b.pose.z || a.id - b.id);
}

function wallFanFrame(g, M, poses, alpha) {
  if (alpha <= 0.001) return;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = '#8a6a3a'; g.lineWidth = 4; g.lineCap = 'round';
  for (const item of poses) {
    if (WALL_IDS.indexOf(item.id) >= FAN_N) continue;
    g.beginPath(); g.moveTo(WALL_CX, FAN_PIVOT_Y); g.lineTo(item.pose.x, item.pose.y); g.stroke();
  }
  g.fillStyle = DECO_GOLD; g.beginPath(); g.arc(WALL_CX, FAN_PIVOT_Y, 11, 0, M.TAU); g.fill();
  g.restore();
}
function wallDecorations(g, M, shot, t, poses) {
  const seq = wallSequence(M), index = seq.findIndex((item) => item.id === shot.id);
  const prev = seq[index - 1], mode = shot.params.mode;
  const k = M.ease.inOut3(M.clamp((t - shot.t0) / WALL_MORPH_S));
  // 扇骨在照片飞向心墙时逐步退下，不在切点整面消失。
  const fanAlpha = mode === 'fan' ? k : prev && prev.params.mode === 'fan' ? 1 - k : 0;
  wallFanFrame(g, M, poses, fanAlpha);
  if (mode === 'fan') fanHearts(g, M);
  if (mode === 'heart' || mode === 'heart2' || (mode === 'gather' && k < 1)) {
    const grown = mode === 'heart2' ? k : mode === 'gather' ? 1 : 0;
    const shape = blendShape(M, grown);
    const lit = mode === 'heart' ? M.smooth(shot.t0, shot.t0 + HEART_OUTLINE_S, t) : mode === 'gather' ? 1 - k : 1;
    heartOutline(g, M, t, shape, lit);
    if (mode === 'heart2' || mode === 'gather') {
      g.save(); g.globalAlpha *= mode === 'gather' ? 1 - k : k;
      const growT = mode === 'heart2' ? shot.t0 + WALL_MORPH_S : prev.t0 + WALL_MORPH_S;
      yearRing(g, M, WALL_CX, shape.cy + 30, t, growT); g.restore();
    }
  }
}
function wallGatherCover(g, M, s) {
  // 照片归拢时相册同步接住它们，避免收成小摞后空等到镜头最后一秒。
  const k = M.ease.outBack(M.clamp((s.t - s.t0 - WALL_MORPH_S * 0.65) / 0.7), 1.25);
  if (k <= 0) return;
  g.save(); g.translate(WALL_CX, GATHER_Y + 30); g.scale(k * GATHER_ALBUM_SCALE, k * GATHER_ALBUM_SCALE);
  albumCover(g, M, {}); g.restore();
}
function drawWallShot(ctx, s, M) {
  const t = s.t, seq = wallSequence(M);
  const first = seq[0].t0, last = seq[seq.length - 1].t1;
  // 镜头沿整个终副歌缓推，避免每换排法就从 1 倍重置。
  const zoom = 1 + 0.028 * M.smooth(first, last, t) + 0.008 * M.pulse('bar', { t, decay: 0.3 });
  wallBackdrop(ctx, M);
  ctx.save(); ctx.translate(WALL_CX, PAGE_BOTTOM); ctx.scale(zoom, zoom); ctx.translate(-WALL_CX, -PAGE_BOTTOM);
  const poses = getWallPoses(M, s, t);
  if (s.params.mode === 'gather') risingHearts(ctx, M, t);
  wallDecorations(ctx, M, s, t, poses);
  for (const item of poses) wallCard(ctx, M, item.id, item.pose);
  if (s.params.mode === 'rain') paperConfetti(ctx, M, t, { ...RAIN_CONFETTI, t0: s.t0, dur: s.dur });
  if (s.params.mode === 'gather') wallGatherCover(ctx, M, s);
  ctx.restore();
  drift(ctx, M, t, 51); breathe(ctx, M, t, 0.018, 2.8);
}
