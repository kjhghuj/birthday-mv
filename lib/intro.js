// lib/intro.js —— 开场两段（修复 v3 计划第一节）：
//   ① intro 镜头（0 → bar4）：冷开场——三张黑白老照片每小节一张快闪，bar3 起片名「生日快乐」剪纸字牌压上；
//   ② desk 镜头（bar4 → line1）：台灯亮起，桌上是系着蝴蝶结的红礼盒 → bar5 解结 → bar6 盒盖掀起翻到背后、
//     相册从盒里升起 → bar7 落定 → line1 翻开第一页（pages.js 接手）。
// 动作节拍参考 Behance「gift box animation」/ Shutterstock「untie ribbon」：解结 → 盖子掀起 → 提起翻走 → 内容物升起。
// 依赖 lib/parts.js（photoCard / photoSize / paperRect / 灯 / 桌 / 呼吸）、lib/cover.js（albumCover / dustMotes / 常量）。
// 画面只由 t 决定。

// ── 冷开场 ──
var TEASER_BG = '#0c0805';
var TEASER_IDS = [16, 18, 13];          // 手风琴年代 → 我们的乐队 → 年轻时的城墙
var TEASER_FADE_IN_S = 1.2;             // 0–1.2s 从黑里淡入（正好吃掉开头的静音）
var TEASER_DIM_S = 0.35;                // 片名出来前照片先压暗
var TEASER_HANDOFF_S = 0.22;            // 只让相邻两张照片在小节头短暂交接
var TITLE_PLAQUE_W = 208, TITLE_PLAQUE_H = 224, TITLE_GAP = 24, TITLE_PX = 164, TITLE_PLAQUE_Y = 430;
var TITLE_DROP_S = 0.3, TITLE_STAGGER_S = 0.13, TITLE_SUB_PX = 52, TITLE_EXIT_S = 0.4;
var TITLE_TONES = [
  { fill: '#c93a32', edge: '#7c1f1c', ink: '#fff2dd' },
  { fill: '#f0b93a', edge: '#8a5a12', ink: '#7c1f1c' },
];

function teaserPhoto(g, M, t, id, k0, slotDur, dim, alpha) {
  const size = photoSize(id, 660, 660);
  const inK = M.ease.outBack(M.clamp((t - k0) / 0.32), 2.2);
  if (inK <= 0) return;
  const push = 1 + 0.085 * M.clamp((t - k0) / slotDur);
  g.save();
  g.translate(960, 420 + Math.sin(t * 1.1 + id) * 5);
  g.rotate((M.hash(id, 9) - 0.5) * 0.055);
  g.scale(inK * push, inK * push);
  g.globalAlpha *= (1 - dim) * alpha;
  photoCard(g, M, id, { w: size.w, h: size.h, sat: 0, tape: true });
  g.restore();
}

// 片名的剪纸字牌（和金句字牌同一个词汇，但更大、红金相间、带小穗）
function titlePlaque(g, M, k, ch, x, i, alpha) {
  if (k <= 0) return;
  const tone = TITLE_TONES[i % 2], hw = TITLE_PLAQUE_W / 2, hh = TITLE_PLAQUE_H / 2;
  g.save(); g.globalAlpha *= alpha;
  g.translate(x, TITLE_PLAQUE_Y - (1 - M.ease.out3(M.clamp(k))) * 130);
  g.rotate((M.hash(i, 21) - 0.5) * 0.05);
  g.scale(k, k);
  g.fillStyle = 'rgba(10,6,3,.45)'; g.beginPath(); g.roundRect(-hw + 6, -hh + 10, TITLE_PLAQUE_W, TITLE_PLAQUE_H, 16); g.fill();
  g.fillStyle = tone.fill; g.beginPath(); g.roundRect(-hw, -hh, TITLE_PLAQUE_W, TITLE_PLAQUE_H, 16); g.fill();
  g.strokeStyle = tone.edge; g.lineWidth = 5; g.stroke();
  g.strokeStyle = 'rgba(255,242,221,.55)'; g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(-hw + 12, -hh + 12, TITLE_PLAQUE_W - 24, TITLE_PLAQUE_H - 24, 9); g.stroke();
  g.font = TITLE_PX + 'px "QingKeHuangYou"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = tone.ink; g.fillText(ch, 0, 6);
  g.restore();
}

function drawIntroShot(ctx, s, M) {
  const t = s.t, bar1 = M.ref('bar1'), bar2 = M.ref('bar2'), bar3 = M.ref('bar3'), bar4 = M.ref('bar4');
  const starts = [bar1, bar2, bar3];
  ctx.fillStyle = TEASER_BG; ctx.fillRect(0, 0, M.W, M.H);
  drawDesk(ctx, M, 0.42);
  softGlow(ctx, M, 960, 140, 760, 0.12);                        // 顶部一点冷光，衬黑白照
  // 旧片在下一小节头后 0.22s 内退出，不把三张照片一直叠到片名下。
  TEASER_IDS.forEach((id, i) => {
    const k0 = starts[i], next = starts[i + 1] || bar4;
    const alpha = i < TEASER_IDS.length - 1 ? 1 - M.smooth(next, next + TEASER_HANDOFF_S, t) : 1;
    if (t >= k0 && t < bar4 && alpha > 0.001) {
      teaserPhoto(ctx, M, t, id, k0, next - k0, M.smooth(bar3 - TEASER_DIM_S, bar3, t) * 0.5, alpha);
    }
  });
  // 片名「生日快乐」 + 副题「我们的相册」（bar3 落下，灯亮前退场）
  const exit = 1 - M.clamp((t - (bar4 - TITLE_EXIT_S)) / TITLE_EXIT_S);
  if (t >= bar3 && exit > 0) {
    const chars = [...'生日快乐'], total = chars.length * TITLE_PLAQUE_W + (chars.length - 1) * TITLE_GAP;
    chars.forEach((ch, i) => {
      const k = M.ease.outBack(M.clamp((t - bar3 - i * TITLE_STAGGER_S) / TITLE_DROP_S), 2.2);
      titlePlaque(ctx, M, k, ch, -total / 2 + TITLE_PLAQUE_W / 2 + i * (TITLE_PLAQUE_W + TITLE_GAP) + 960, i, exit);
    });
    const subK = M.ease.out3(M.clamp((t - bar3 - 0.5) / 0.4)) * exit;
    if (subK > 0) {
      ctx.save(); ctx.globalAlpha *= subK;
      ctx.font = TITLE_SUB_PX + 'px "LXGWWenKai"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(26,15,6,.6)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.strokeText('· 我 们 的 相 册 ·', 960, TITLE_PLAQUE_Y + 190);
      ctx.fillStyle = '#e9c87e'; ctx.fillText('· 我 们 的 相 册 ·', 960, TITLE_PLAQUE_Y + 190);
      ctx.restore();
    }
    // 片名下两颗小金星
    for (const dx of [-total / 2 - 70, total / 2 + 70]) {
      star(ctx, M, 960 + dx, TITLE_PLAQUE_Y - 120, 16 + 6 * Math.sin(t * 3), t * 0.4, '#f4d788', '#fff3cf', 0.8 * exit);
    }
  }
  // 开头从黑里淡入
  const fadeIn = 1 - M.clamp(t / TEASER_FADE_IN_S);
  if (fadeIn > 0) { ctx.fillStyle = `rgba(4,2,1,${fadeIn.toFixed(3)})`; ctx.fillRect(0, 0, M.W, M.H); }
  breathe(ctx, M, t, 0.008, 2.2);
}

// ── 红礼盒 ──
var GIFT_BODY_W = 1240, GIFT_BODY_H = 900;      // 盒身和合着的相册同一个位置（cover 坐标）
var GIFT_LIP_H = 240;                            // 前壁沿口（相册升起后从沿口里探出来）
var GIFT_RIM_EXTRA = 34;                         // 盒盖比盒身大一圈
var GIFT_RED = '#c93a32', GIFT_RED_DARK = '#8f2019', GIFT_RED_BODY = '#b02a22', GIFT_CREAM = '#f6e8d8';
var GIFT_LIFT_S = 0.45, GIFT_FLY_DELAY_S = 0.35, GIFT_FLY_S = 0.55;
var GIFT_RISE_DELAY_S = 0.45, GIFT_RISE_S = 0.75, GIFT_RISE_FROM = 92;
var TAG_W = 150, TAG_H = 96;

// 盒盖的姿势：盖着 → 掀起悬停 → 翻到盒身右后侧立着（画在盒身前面，形成前景遮挡的层次）
function giftLidPose(M, t, lidT) {
  const upK = M.ease.outBack(M.clamp((t - lidT) / GIFT_LIFT_S), 1.8);
  const flyK = M.ease.inOut3(M.clamp((t - lidT - GIFT_FLY_DELAY_S) / GIFT_FLY_S));
  if (flyK <= 0) return { x: 0, y: -330 * upK, rot: -0.09 * upK, sc: 1, away: false };
  return { x: M.lerp(0, 520, flyK), y: M.lerp(-330 * upK, -150, flyK), rot: M.lerp(-0.09 * upK, -1.28, flyK),
    sc: M.lerp(1, 0.9, flyK), away: true };
}

// 蝴蝶结：两个环 + 中心结 + 两条飘带尾；解开 = 环弹开放大转走、飘带被抽走滑出画面
var BOW_SCALE = 1.4, BOW_Y = -170;             // 结在盒盖内，避免两只环被画面上沿裁掉
function giftBow(g, M, t, bowT) {
  const off = M.clamp((t - bowT) / 0.8);
  if (off >= 1) return;
  const alpha = 1 - M.ease.in2(off);
  g.save(); g.globalAlpha *= alpha; g.scale(BOW_SCALE, BOW_SCALE);
  // 两条飘带尾（被抽走：向右上滑出 + 淡出）
  const slide = M.ease.in2(off) * 560;
  for (const sgn of [-1, 1]) {
    g.save(); g.translate(sgn * 60 + slide, 60 + off * -70); g.rotate(sgn * 0.35 + off * 0.8);
    g.strokeStyle = GIFT_CREAM; g.lineWidth = 34; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(sgn * 60, 90, sgn * 30, 190); g.stroke();
    g.strokeStyle = 'rgba(255,250,230,.65)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(0, -8); g.quadraticCurveTo(sgn * 60, 82, sgn * 30, 182); g.stroke();
    g.restore();
  }
  // 两个环
  const ringK = (1 + 0.12 * Math.sin(off * Math.PI)) * (1 - off * 0.5);
  for (const sgn of [-1, 1]) {
    g.save(); g.translate(sgn * 118 * (1 + off * 1.5), -44 - off * 190); g.rotate(sgn * (0.42 + off * 1.1));
    g.scale(Math.max(0.01, ringK), Math.max(0.01, ringK));
    g.strokeStyle = GIFT_CREAM; g.lineWidth = 40;
    g.beginPath(); g.ellipse(0, 0, 92, 58, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#ac7d3d'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, 112, 78, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,250,230,.75)'; g.lineWidth = 7;
    g.beginPath(); g.ellipse(-14, -10, 70, 40, 0, -2.4, 0.5); g.stroke();
    g.restore();
  }
  // 中心结（最后缩小弹开）
  const knotK = 1 - M.ease.in2(M.clamp((t - bowT - 0.42) / 0.3));
  if (knotK > 0) {
    g.save(); g.translate(0, -34 - off * 190); g.rotate(off * 1.4); g.scale(knotK, knotK);
    g.fillStyle = GIFT_CREAM; g.beginPath(); g.roundRect(-56, -44, 112, 88, 18); g.fill();
    g.strokeStyle = '#ac7d3d'; g.lineWidth = 5; g.stroke();
    g.fillStyle = 'rgba(255,242,221,.25)'; g.beginPath(); g.roundRect(-40, -32, 42, 26, 8); g.fill();
    g.restore();
  }
  g.restore();
}

// 挂在蝴蝶结上的小礼物签：解结前挂在结下轻轻晃，解结后掉到桌前落定
function giftTagPose(M, t, bowT) {
  const hang = Math.sin(t * 1.6) * 0.07, releaseT = bowT + 0.38;
  const fall = M.clamp((t - releaseT) / 0.62), e = M.ease.in2(fall);
  const restAge = Math.max(0, t - releaseT - 0.62);
  return {
    x: M.lerp(220, -140, M.ease.inOut2(fall)),
    y: M.lerp(24, 318, e),
    rot: M.lerp(hang, 0.15, M.ease.out3(fall)) + Math.sin(restAge * 15) * 0.08 * Math.exp(-restAge * 8) * fall,
    thread: t < releaseT ? [[164, BOW_Y - 14], [220, 24 - TAG_H / 2]] : null,
  };
}
function giftTag(g, M, t, bowT) {
  const { x, y, rot, thread } = giftTagPose(M, t, bowT);
  if (thread) {
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(thread[0][0], thread[0][1]); g.lineTo(thread[1][0], thread[1][1]); g.stroke();
  }
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = '#e6d5ac'; g.beginPath(); g.roundRect(-TAG_W / 2, -TAG_H / 2, TAG_W, TAG_H, 12); g.fill();
  g.strokeStyle = '#b9a87e'; g.lineWidth = 3; g.stroke();
  g.beginPath(); g.arc(0, -TAG_H / 2 + 16, 7, 0, Math.PI * 2); g.stroke();           // 穿绳孔
  g.fillStyle = '#5d4420'; g.font = '38px "LXGWWenKai"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('生日快乐', 0, 12);
  g.restore();
}

function drawGiftLid(g, M, pose, t, bowT, bowStillOn) {
  const w = GIFT_BODY_W + GIFT_RIM_EXTRA * 2, h = GIFT_BODY_H + GIFT_RIM_EXTRA * 2;
  g.save(); g.translate(pose.x, pose.y); g.rotate(pose.rot); g.scale(pose.sc, pose.sc);
  // 离盒越高，影子越宽越淡；盖板下沿留一道纸板厚度。
  const lift = M.clamp(-pose.y / 330);
  g.fillStyle = `rgba(0,0,0,${0.38 - lift * 0.16})`;
  g.beginPath(); g.roundRect(-w / 2 + 8, -h / 2 + 12 + lift * 14, w, h, 30); g.fill();
  paperRect(g, M, -w / 2, -h / 2, w, h, GIFT_RED);
  g.strokeStyle = GIFT_RED_DARK; g.lineWidth = 7; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 30); g.stroke();
  g.fillStyle = '#8f2019'; g.fillRect(-w / 2 + 8, h / 2 - 12, w - 16, 14);
  g.strokeStyle = 'rgba(255,229,196,.3)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-w / 2 + 24, -h / 2 + 10); g.lineTo(w / 2 - 24, -h / 2 + 10); g.stroke();
  g.fillStyle = 'rgba(246,232,216,.9)'; g.fillRect(-w / 2, -26, w, 52);              // 奶油腰封
  g.strokeStyle = 'rgba(143,32,25,.5)'; g.lineWidth = 3; g.strokeRect(-w / 2, -26, w, 52);
  if (bowStillOn) { g.save(); g.translate(0, BOW_Y); giftBow(g, M, t, bowT); g.restore(); }
  g.restore();
}

function drawGiftBox(g, M, t, T) {
  const hw = GIFT_BODY_W / 2, hh = GIFT_BODY_H / 2;
  const pose = giftLidPose(M, t, T.lidT);
  if (pose.away) drawGiftLid(g, M, pose, t, T.bowT, false);      // 盒盖已翻到背后：先画
  // 盒身：深一档的红（和盒盖拉开层次）+ 深色内腔 + 四边红沿
  g.fillStyle = '#3a1713'; g.beginPath(); g.roundRect(-hw, -hh, GIFT_BODY_W, GIFT_BODY_H, 22); g.fill();
  g.strokeStyle = GIFT_RED_BODY; g.lineWidth = 30;
  g.beginPath(); g.roundRect(-hw, -hh, GIFT_BODY_W, GIFT_BODY_H, 22); g.stroke();
  g.strokeStyle = GIFT_RED_DARK; g.lineWidth = 5;
  g.beginPath(); g.roundRect(-hw + 15, -hh + 15, GIFT_BODY_W - 30, GIFT_BODY_H - 30, 14); g.stroke();
  // 内腔衬纸（奶油色皱纹）
  g.save(); g.beginPath(); g.roundRect(-hw + 26, -hh + 26, GIFT_BODY_W - 52, GIFT_BODY_H - 52, 12); g.clip();
  g.fillStyle = '#cbb28a'; g.fillRect(-hw, -hh, GIFT_BODY_W, GIFT_BODY_H);
  for (let i = 0; i < 9; i++) {                                   // 皱纹竖条
    g.fillStyle = `rgba(90,60,30,${0.06 + M.hash(i, 3) * 0.05})`;
    g.fillRect(-hw + 40 + i * (GIFT_BODY_W - 80) / 8 - 14, -hh, 28, GIFT_BODY_H);
  }
  g.restore();
  // 相册从盒里升起（升到正好坐在沿口里）
  if (t >= T.riseT) {
    const k = M.ease.outBack(M.clamp((t - T.riseT) / GIFT_RISE_S), 1.4);
    g.save(); g.translate(0, M.lerp(GIFT_RISE_FROM, 0, k)); g.scale(M.lerp(0.96, 1, k), M.lerp(0.96, 1, k));
    albumCover(g, M, {});
    g.restore();
  }
  // 前壁沿口（盖在相册前面：相册像坐在盒里）
  g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(0, hh - GIFT_LIP_H / 2 + 14, hw * 0.96, 40, 0, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.roundRect(-hw, hh - GIFT_LIP_H, GIFT_BODY_W, GIFT_LIP_H, 22); g.clip();
  paperRect(g, M, -hw, hh - GIFT_LIP_H, GIFT_BODY_W, GIFT_LIP_H, GIFT_RED_BODY);
  g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(-hw, hh - GIFT_LIP_H, GIFT_BODY_W, 18);        // 沿口在相册前的投影
  g.fillStyle = 'rgba(246,232,216,.16)'; g.fillRect(-hw, hh - GIFT_LIP_H + 18, GIFT_BODY_W, 26);   // 沿口高光
  g.restore();
  g.strokeStyle = GIFT_RED_DARK; g.lineWidth = 5;
  g.beginPath(); g.moveTo(-hw + 8, hh - GIFT_LIP_H); g.lineTo(hw - 8, hh - GIFT_LIP_H); g.stroke();
  g.beginPath(); g.roundRect(-hw, hh - GIFT_LIP_H, GIFT_BODY_W, GIFT_LIP_H, 22); g.stroke();
  if (!pose.away) drawGiftLid(g, M, pose, t, T.bowT, true);      // 盒盖还盖着 / 掀起中：画在盒身前面
  giftTag(g, M, t, T.bowT);                                      // 礼物签挂在盖面上（画在盖子之后）
}

// 开场第二段：灯亮 → 红礼盒 → 解结 → 开盖 → 相册升起 → 落定等 line1
function drawGiftOpening(ctx, s, M) {
  const t = s.t;
  const lampT = M.ref('bar4'), bowT = M.ref('bar5'), lidT = M.ref('bar6'), settleT = M.ref('bar7');
  const riseT = lidT + GIFT_RISE_DELAY_S;
  const T = { lampT, bowT, lidT, riseT, settleT };
  const zoom = 1 + 0.045 * M.clamp((t - lampT) / 8.6) + 0.009 * M.pulse('bar', { decay: 0.5 });
  ctx.save(); ctx.translate(PAGE_CX, PAGE_BOTTOM); ctx.scale(zoom, zoom); ctx.translate(-PAGE_CX, -PAGE_BOTTOM);
  drawDesk(ctx, M);
  const lampOn = M.ease.outBack(M.clamp((t - lampT) / DESK_LAMP_S), 1.6);
  if (lampOn < 1) {
    const dark = DESK_DARK * (1 - lampOn);
    if (dark > 0) { ctx.fillStyle = `rgba(8,5,3,${dark.toFixed(3)})`; ctx.fillRect(-M.W, -M.H, M.W * 3, M.H * 3); }
  }
  lampGlow(ctx, M, Math.max(DESK_LAMP_REST, lampOn * (0.93 + 0.07 * M.noise(t * 2.2, 7))));
  ctx.save(); ctx.translate(PAGE_CX, PAGE_CY); ctx.scale(PAGE_SCALE, PAGE_SCALE);
  ctx.save(); ctx.translate(0, 26); drawGiftBox(ctx, M, t, T); ctx.restore();
  ctx.restore();
  dustMotes(ctx, M, t, 0.34 * M.clamp(lampOn));
  ctx.restore();
  drift(ctx, M, t, 11); breathe(ctx, M, t, 0.02 * M.clamp(lampOn) + 0.006, 2.6);
}
