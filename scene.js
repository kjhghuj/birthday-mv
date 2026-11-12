// scene.js —— 生日快乐 · 相册 v2（纸片立体书，Canvas 2D 伪 3D）
// v1 的 1073 行拆成了 lib/：parts（零件和几何）、decor（纸艺）、cake、cover、pages、night、wall、ending、lyrics（字幕带）。
// 这里只做接线：镜头 → lib 的画法；camera / post / overlay / glyph 四个钩子。
// 画面分区（修复计划④）：y 0–850 画面区（相册、照片、纸艺），y 890–1080 字幕带——歌词全在字幕带，照片永远不进来。
// 金句的字牌歌词是 mode: 'scene'，由 lib/lyrics.js 的 drawHookPlaques 画并调 M.logLyric 登记在屏（审片用）。
MV.scene({
  bg: '#171009',
  setup(M) {
    // 卡点表先查一遍（照片号、零件名、模式名、必须的时刻），写错加载时就报错
    checkPageCues(M);
    checkWallCues(M);
    checkEndingCues(M);
    setupLyricSources(M);
    return loadPhotos();          // 32 张照片，任何一张失败都成为 MV_ERROR
  },
  camera(cam, M) {
    beginFrame(cam, M);           // 推近以页面底边为锚点 + 记录本帧镜头（布局登记用）
  },
  post(ctx, M) {
    captionBand(ctx, M);          // 字幕带的桌面渐暗，垫在歌词下面
  },
  overlay(ctx, M) {
    drawHookPlaques(ctx, M);      // 金句的红色剪纸字牌（mode: 'scene' 的句子，内部 M.logLyric）
    drawLyricSparkles(ctx, M);    // 字幕粒子：字落下迸金粉、整句常驻星光
    drawCredits(ctx, M);          // 开场右下角署名（编曲/歌词/演唱）
    drawEndTitle(ctx, M);         // 尾声「幸福到永远」烫金字
  },
  glyph: lyricGlyph,              // 普通歌词的字形（屏幕层的字顺手登记歌词框）
  shots: {
    intro(ctx, s, M) { drawIntroShot(ctx, s, M); },      // 冷开场：黑白老照片快闪 + 片名字牌 + 署名
    desk(ctx, s, M) { drawGiftOpening(ctx, s, M); },     // 开场：灯亮 → 红礼盒解结开盖 → 相册升起
    page(ctx, s, M) { drawPageShot(ctx, s, M); },        // 相册跨页：白边照片卡 + 纸艺零件（自绘翻页）
    cake(ctx, s, M) { drawCakeShot(ctx, s, M); },        // 蛋糕页：first / big / relight / blowout
    night(ctx, s, M) { drawNightShot(ctx, s, M); },      // 吹灭后的星空页
    montage(ctx, s, M) { drawMontageShot(ctx, s, M); },  // 间奏：桌面照片散开
    wall(ctx, s, M) { drawWallShot(ctx, s, M); },        // 终副歌：照片雨 / 折扇 / 心墙 / 收拢
    finale(ctx, s, M) { drawFinaleShot(ctx, s, M); },    // 最后一句：两张拍立得
    end(ctx, s, M) { drawEndShot(ctx, s, M); },          // 尾声：盖章 + 灯暗
  },
});
