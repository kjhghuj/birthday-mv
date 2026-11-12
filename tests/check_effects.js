/* 在 index.html?render 的 READY 后加载，调用 runEffectsChecks()。
 * 只绘制浏览器帧和比较像素，不编码视频。
 * 像素比较环境：在页面脚本加载前，将所有 2D getContext 的 options 注入
 * willReadFrequently:true，固定回读后端；产品预览不注入此选项。 */
window.runEffectsChecks = function () {
  const M = MV.M, failures = [], checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok: !!ok });
    if (!ok) failures.push({ name, detail });
  };
  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d');
  const scratch = document.createElement('canvas'); scratch.width = 800; scratch.height = 600;
  const g = scratch.getContext('2d');
  function painted(draw) {
    g.resetTransform(); g.clearRect(0, 0, 800, 600); g.translate(400, 300); draw(g);
    const data = g.getImageData(0, 0, 800, 600).data;
    let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
    return count;
  }
  const bowT = M.ref('bar5');
  check('解结前蝴蝶结可见', painted(c => giftBow(c, M, bowT - 0.5, bowT)) > 100);
  check('解结等待阶段吊牌可见', painted(c => giftTag(c, M, bowT + 0.2, bowT)) > 100);

  const calendar = M.shots().find(s => s.params.deco === 'calendar');
  const s = shotAtTime(M, calendar, calendar.t1 - 0.05), timing = decoTiming(M, s), labels = [];
  const fillText = g.fillText;
  try {
    g.fillText = function (text, ...args) { labels.push(String(text)); return fillText.call(this, text, ...args); };
    DECOR.calendar(g, M, 0, 0, timing.pop, s.t, s, timing);
  } finally { g.fillText = fillText; }
  check('日历两张旧页离场', labels.includes('13') && !labels.includes('11') && !labels.includes('12'), labels);

  const walls = M.shots().filter(s => s.scene === 'wall');
  let boundaryChecks = 0, biggestJump = 0;
  for (let i = 1; i < walls.length; i++) {
    for (const id of WALL_IDS) {
      const before = getWallPose(M, walls[i - 1], id, walls[i].t0);
      const after = getWallPose(M, walls[i], id, walls[i].t0);
      // 新卡在切点透明；已有可见卡的姿态必须完全连续。
      if (before && before.alpha > 0.01) {
        const delta = after ? Math.max(...['x','y','rot','k','w','h','alpha'].map(k => Math.abs(before[k] - after[k]))) : Infinity;
        biggestJump = Math.max(biggestJump, delta); boundaryChecks++;
      }
    }
  }
  check('照片墙切点已有照片连续', biggestJump < 1e-6, { boundaryChecks, biggestJump });

  const sourceProblems = [];
  for (const line of M.song.lines) {
    for (const t of [line.t0 + 0.03, line.t1 - 0.02, Math.min(M.dur - 0.01, line.t1 + 0.08)]) {
      render(t); const keys = new Set();
      for (const b of MV_LAYOUT.lyrics) {
        const source = M.lineN(b.lineN), key = b.lineN + ':' + b.charIndex;
        if (!source || !source.chars[b.charIndex] || keys.has(key) || t < source.t0 - 0.11 || t > source.t1 + 0.26) {
          sourceProblems.push({ t, lineN: b.lineN, charIndex: b.charIndex });
        }
        keys.add(key);
      }
    }
  }
  check('字幕字符身份有效且不串句', sourceProblems.length === 0, sourceProblems.slice(0, 8));

  const blow = M.shots().find(s => s.scene === 'cake' && s.params.mode === 'blowout');
  const blowT = M.word(blow.params.line, blow.params.word), options = { mode: 'blowout', blowT };
  const flames = [0, 0.075, 0.16].map(age => candleLightState(M, blowT + age, blow, options, 0));
  check('吹灭压火后熄灭', flames[0].amount === 1 && flames[1].amount > 0 && flames[1].amount < 1 && !flames[2].lit);
  const relight = M.shots().find(s => s.scene === 'cake' && s.params.mode === 'relight');
  const ignition = Array.from({ length: 7 }, (_, i) => candleLightState(M, relight.t0, relight, { mode: 'relight' }, i).litAt);
  check('七支蜡烛按半拍重燃', ignition.every((t, i) => !i || Math.abs(t - ignition[i - 1] - M.song.beat * 0.5) < 1e-8));

  function fingerprint(t) {
    render(t); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 2166136261;
    for (let i = 0; i < data.length; i++) hash = Math.imul(hash ^ data[i], 16777619);
    return hash >>> 0;
  }
  const times = [M.ref('line4') + 0.22, 88.5, 140.2, 145.96, 170.88, 173.1, 184.24];
  // Chrome 会在反复回读后切换画布后端；先稳定该状态，避免比较 GPU/CPU 的采样舍入差异。
  for (let i = 0; i < 8; i++) fingerprint(times[i % times.length]);
  const hashes = times.map(fingerprint);
  // 先打乱访问次序并逐镜头使缓存换出，再验证同一时间相同像素。
  for (const shot of M.shots()) render(shot.t0 + Math.min(0.2, shot.dur / 2));
  const mismatches = [];
  for (let i = times.length - 1; i >= 0; i--) if (fingerprint(times[i]) !== hashes[i]) mismatches.push(times[i]);
  check('跳转与缓存换出后画面确定', !mismatches.length, mismatches);
  return { passed: !failures.length, checks, failures, boundaryChecks, hashes };
};
