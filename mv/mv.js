/* mv-director · mv.js —— MV 画面运行库（MIT · 亚里 2026）
 *
 * 一条铁规矩：画面只由时间 t 决定。同一个 t 画两遍必须一模一样（不许用 Math.random、Date、上一帧的状态）。
 * 这样渲染才能多进程并行、逐帧精确卡点；要随机就用 M.rng(种子) / M.hash(i)。
 *
 * 页面加载顺序：mv/mv.js → 画风要用的库（可选）→ scene.js（里面调用 MV.scene({...})）。
 * mv.js 读 song.json（听歌拆解）和 cues.json（卡点表），把节拍、歌词、镜头、大时刻变成函数交给 scene.js。
 * 普通打开 = 带声音的预览播放器（空格播放、←→ 跳小节、D 显示节拍信息）；?render = 给 render.py 逐帧截图用。
 * 说明书：references/画面库.md
 */
(() => {
'use strict';
const W = 1920, H = 1080, TAU = Math.PI * 2;
const Q = new URLSearchParams(location.search);
const RENDER = Q.has('render');
let DEBUG = Q.has('debug');
const SC = Math.max(0.25, Math.min(1, +(Q.get('scale') || 1)));

// ---------------- 数学 ----------------
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = {
  lin: t => t,
  in2: t => t * t, out2: t => 1 - (1 - t) ** 2, inOut2: t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  in3: t => t ** 3, out3: t => 1 - (1 - t) ** 3, inOut3: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  out5: t => 1 - (1 - t) ** 5, inOut5: t => t < .5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2,
  outExpo: t => t >= 1 ? 1 : 1 - 2 ** (-10 * t), inExpo: t => t <= 0 ? 0 : 2 ** (10 * t - 10),
  outBack: (t, s = 1.70158) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  outElastic: t => t <= 0 ? 0 : t >= 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * TAU / 3) + 1,
};
const E = (name) => typeof name === 'function' ? name : (ease[name] || ease.inOut3);
const hash = (i, j = 0) => { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const rng = (seed) => { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
const noise = (x, y = 0) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v) * 2 - 1;
};
const lastIdx = (arr, t, key) => { let lo = 0, hi = arr.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; const v = key ? arr[m][key] : arr[m]; if (v <= t) { r = m; lo = m + 1; } else hi = m - 1; } return r; };

// ---------------- 画布 ----------------
const mk = (w = W, h = H) => { const c = document.createElement('canvas'); c.width = Math.round(w * SC); c.height = Math.round(h * SC); return c; };
const LAYERS = {};
const layer = (k) => LAYERS[k] || (LAYERS[k] = mk());
const CACHE = {};
const cached = (key, w, h, fn) => { if (!CACHE[key]) { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), c); CACHE[key] = c; } return CACHE[key]; };
const begin = (c, bg) => { const x = c.getContext('2d'); x.setTransform(SC, 0, 0, SC, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.shadowBlur = 0; x.shadowColor = 'transparent';
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); } else x.clearRect(0, 0, W, H); return x; };

// ---------------- 状态 ----------------
let S = null, C = null, SCENE = null;
const M = { W, H, TAU, SC, clamp, lerp, smooth, ease, hash, rng, noise, layer, cached, t: 0, img: {}, fonts: {}, resetTransform: (ctx) => ctx.setTransform(SC, 0, 0, SC, 0, 0) };
const MV = window.MV = { M };
MV.scene = (def) => { SCENE = def; };

// ---------------- 时间引用：'bar9' 'bar9.3' 'line4' 'beat12' 'end' 数字，后面可加 '+0.5b' '-0.1s' '+1bar' ----------------
let DB0 = 0;   // first_downbeat 在 downbeats 里的下标
const barT = (n, beat = 1) => {
  const i = DB0 + n - 1, db = S.downbeats;
  let t = (i >= 0 && i < db.length) ? db[i] : S.first_downbeat + (n - 1) * S.bar;
  if (beat !== 1) { const bi = S.beats.findIndex(b => Math.abs(b - t) < 0.03); t = (bi >= 0 && bi + beat - 1 < S.beats.length) ? S.beats[bi + beat - 1] : t + (beat - 1) * S.beat; }
  return t;
};
const ref = (r) => {
  if (r === undefined || r === null) return NaN;
  if (typeof r === 'number') return r;
  const s = String(r).replace(/\s+/g, '');
  const m = s.match(/^(bar-?\d+(?:\.\d+)?|line\d+(?:@[^+\-]+)?|beat\d+|end|start|-?\d*\.?\d+)((?:[+-]\d*\.?\d+(?:b|s|bar)?)*)$/);
  if (!m) throw new Error('看不懂的时间：' + r + '（写 bar9 / bar9.3 / line4 / line4@某个词 / line4@end / 12.5，可加 +0.5b / -0.1s）');
  let t, base = m[1];
  if (base.startsWith('bar')) { const [n, b] = base.slice(3).split('.'); t = barT(+n, b ? +b : 1); }
  else if (base.startsWith('line')) {
    const [ln, word] = base.slice(4).split('@'); const L = S.lines.find(l => l.n === +ln); if (!L) throw new Error('没有这一句：line' + ln);
    if (!word) t = L.t0; else if (word === 'end') t = L.sung_end; else t = wordT(L, word);
  }
  else if (base.startsWith('beat')) t = S.beats[+base.slice(4) - 1] ?? NaN;
  else if (base === 'end') t = S.dur; else if (base === 'start') t = 0;
  else t = +base;
  for (const o of (m[2].match(/[+-]\d*\.?\d+(?:b|s|bar)?/g) || [])) {
    const v = parseFloat(o); t += o.endsWith('bar') ? v * S.bar : o.endsWith('b') ? v * S.beat : v;
  }
  return t;
};
M.ref = ref;
// 某句里某个词开唱的时刻（逐字时间来自强制对齐）：wordT(第 5 句, '灯火')
function wordT(L, word) {
  const txt = L.chars.map(c => c.c).join(''), k = txt.indexOf(word.replace(/\s+/g, ''));
  if (k < 0) throw new Error(`第 ${L.n} 句「${L.text}」里没有「${word}」`);
  return L.chars[k].t;
}
M.word = (n, word) => wordT(M.lineN(n), word);

// ---------------- 事件与包络 ----------------
const EV = {};
const evTimes = (kind) => {
  if (Array.isArray(kind)) return kind.map(ref).sort((a, b) => a - b);
  if (EV[kind]) return EV[kind];
  throw new Error('没有这种事件：' + kind + '（beat bar kick snare hat line char shot big moment）');
};
M.events = (kind) => evTimes(kind);
M.since = (kind = 'beat', t = M.t) => { const a = evTimes(kind), i = lastIdx(a, t); return i < 0 ? Infinity : t - a[i]; };
M.until = (kind = 'beat', t = M.t) => { const a = evTimes(kind), i = lastIdx(a, t); return i + 1 < a.length ? a[i + 1] - t : Infinity; };
M.count = (kind = 'beat', t = M.t) => lastIdx(evTimes(kind), t) + 1;
// 打点包络：事件那一刻 = 1，之后按 decay（秒）指数回落；pre > 0 时事件前 pre 秒开始往上蓄力
M.pulse = (kind = 'beat', o = {}) => {
  const t = o.t ?? M.t, a = evTimes(kind), i = lastIdx(a, t), d = o.decay ?? 0.18;
  let v = i < 0 ? 0 : Math.exp(-(t - a[i]) / d);
  if (o.weight && i >= 0 && STR[kind]) v *= STR[kind][i];
  if (o.pre && i + 1 < a.length) { const k = 1 - (a[i + 1] - t) / o.pre; if (k > 0) v = Math.max(v, k * k * (o.preAmt ?? 0.6)); }
  return v;
};
const STR = {};
M.beat = (t = M.t) => { const b = S.beats, i = lastIdx(b, t); if (i < 0) return { i: -1, p: 0, t0: 0, len: S.beat }; const len = (b[i + 1] ?? b[i] + S.beat) - b[i]; return { i, p: clamp((t - b[i]) / len), t0: b[i], len }; };
M.bar = (t = M.t) => {
  const d = S.downbeats, i = lastIdx(d, t);
  const t0 = i < 0 ? S.first_downbeat - S.bar : d[i], len = i < 0 ? S.bar : (d[i + 1] ?? d[i] + S.bar) - d[i];
  const n = i - DB0 + 1;
  return { n, i, p: clamp((t - t0) / len), beat: Math.min(S.meter, Math.floor((t - t0) / (len / S.meter)) + 1), t0, len };
};
M.env = (name = 'energy', t = M.t) => { const a = S.env[name]; if (!a) return 0; const f = clamp(t * S.env.fps, 0, a.length - 1), i = Math.floor(f); return lerp(a[i], a[Math.min(a.length - 1, i + 1)], f - i); };
M.section = (t = M.t) => { const s = S.sections; let i = s.findIndex(x => t >= x.t0 && t < x.t1); if (i < 0) i = t < (s[0]?.t0 ?? 0) ? 0 : s.length - 1; const x = s[i]; return { ...x, i, p: clamp((t - x.t0) / (x.t1 - x.t0)) }; };
M.intensity = (t = M.t) => {
  const a = ARC; if (!a.length) return M.env('energy', t);
  if (t <= a[0][0]) return a[0][1]; if (t >= a[a.length - 1][0]) return a[a.length - 1][1];
  const i = lastIdx(a.map(x => x[0]), t); const [t0, v0] = a[i], [t1, v1] = a[i + 1]; return lerp(v0, v1, ease.inOut2((t - t0) / (t1 - t0)));
};
let ARC = [];

// ---------------- 歌词 ----------------
M.line = (t = M.t, lead = 0) => { const L = S.lines; for (let i = L.length - 1; i >= 0; i--) if (t >= L[i].t0 - lead && t < L[i].t1) return L[i]; return null; };   // lead：想提前几秒拿到下一句（默认 0，正好开唱那一刻换）
M.lineN = (n) => S.lines.find(l => l.n === n);
M.chars = (line, t = M.t, dur = 0.16) => { const L = typeof line === 'number' ? M.lineN(line) : line; if (!L) return [];
  return L.chars.map((c, j) => ({ c: c.c, t: c.t, j, age: t - c.t, on: clamp((t - c.t) / dur), sung: t >= c.t })); };
M.sungText = (line, t = M.t) => M.chars(line, t).filter(c => c.sung).map(c => c.c).join('');

// ---------------- 卡点表：镜头、大时刻、规则 ----------------
let SHOTS = [], MOMENTS = [], FXEV = [];
const TDUR = { cut: 0, fade: 1, flash: .5, whip: .5, 'whip-left': .5, 'whip-right': .5, 'whip-up': .5, 'whip-down': .5, zoom: .75, iris: 1, wipe: .75, glitch: .5, smash: .25, push: 1, 'push-left': 1, 'push-right': 1, 'push-up': 1, 'push-down': 1 };
const FXDEF = {
  flash: { amt: .85, decay: .14, color: '#ffffff' }, punch: { amt: .08, decay: .32 }, shake: { amt: 22, decay: .4 }, rgb: { amt: 16, decay: .3 },
  invert: { dur: .06 }, blackout: { dur: 1 }, strobe: { dur: 1, rate: .125 }, zoomblur: { amt: .14, decay: .32 }, glitch: { amt: 60, dur: .5 },
  tilt: { amt: .06, decay: .5 }, ring: { decay: .6, color: '#ffffff' }, speedlines: { decay: .5, color: '#000000' },
  stutter: { dur: 1, slice: .25 }, freeze: { dur: 1 }, slowmo: { dur: 2, k: .3 }, drift: { amt: .03, decay: 2 },
};
const normFx = (f) => { const o = typeof f === 'string' ? { fx: f } : { ...f }; const d = FXDEF[o.fx]; if (!d) throw new Error('没有这种特效：' + o.fx + '（' + Object.keys(FXDEF).join(' ') + '）'); return { ...d, ...o }; };
const beatsOr = (v) => typeof v === 'string' && /b$/.test(v) ? parseFloat(v) * S.beat : v;   // 'dur' 写 '2b' = 两拍；写数字 = 拍数（stutter/freeze/blackout/strobe/glitch/slowmo）

function buildCues() {
  C.shots = C.shots || [{ at: 0, scene: Object.keys(SCENE.shots || {})[0] || 'main' }];
  SHOTS = C.shots.map((s, i) => ({ ...s, i, t0: Math.max(0, ref(s.at)), in: s.in || 'cut' })).sort((a, b) => a.t0 - b.t0);
  SHOTS.forEach((s, i) => { s.t1 = i + 1 < SHOTS.length ? SHOTS[i + 1].t0 : S.dur; s.dur = s.t1 - s.t0; s.td = (s.inDur ?? TDUR[s.in] ?? 0.5) * S.beat; s.id = s.id || ('s' + (i + 1)); });
  MOMENTS = (C.moments || []).map((m, i) => ({ ...m, i, t: ref(m.at), name: m.name || ('m' + (i + 1)), fx: (m.fx || []).map(normFx) }));
  FXEV = [];
  for (const m of MOMENTS) for (const f of m.fx) FXEV.push({ ...f, t: m.t, big: !!m.big });
  for (const r of (C.rules || [])) {
    const t0 = r.from ? ref(r.from) : 0, t1 = r.to ? ref(r.to) : S.dur, every = r.every || 1, f = normFx(r);
    const ts = evTimes(r.on).filter(t => t >= t0 - 1e-3 && t < t1 - 1e-3);
    ts.forEach((t, k) => { if (k % every === (r.offset || 0)) FXEV.push({ ...f, t, rule: true, scaleArc: r.scale !== false }); });
  }
  FXEV.sort((a, b) => a.t - b.t);
  ARC = (C.arc || []).map(([r, v]) => [ref(r), v]).sort((a, b) => a[0] - b[0]);
  EV.shot = SHOTS.map(s => s.t0); EV.moment = MOMENTS.map(m => m.t).sort((a, b) => a - b); EV.big = MOMENTS.filter(m => m.big).map(m => m.t).sort((a, b) => a - b);
}
M.shot = (t = M.t) => { const i = Math.max(0, lastIdx(SHOTS, t, 't0')); const s = SHOTS[i]; return { ...s, lt: t - s.t0, p: clamp((t - s.t0) / s.dur) }; };
M.shots = () => SHOTS;
M.moment = (name) => MOMENTS.find(m => m.name === name);
M.hit = (name, o = {}) => { const m = M.moment(name); if (!m) return 0; const dt = (o.t ?? M.t) - m.t; if (dt < 0) return o.pre ? Math.max(0, 1 + dt / o.pre) ** 2 * (o.preAmt ?? .6) : 0; return Math.exp(-dt / (o.decay ?? .4)); };
M.after = (name, t = M.t) => { const m = M.moment(name); return m ? t - m.t : -Infinity; };

// 当前帧的特效强度（纯函数）
function fxAt(t) {
  const o = { flash: 0, flashColor: '#fff', punch: 0, shake: 0, rgb: 0, invert: false, blackout: false, strobe: 0, zoomblur: 0, glitch: 0, tilt: 0, ring: [], speed: 0, speedColor: '#000', warp: null };
  const i1 = lastIdx(FXEV, t + 1e-6, 't');
  for (let i = i1; i >= 0; i--) {
    const e = FXEV[i], dt = t - e.t; if (dt > 6) break;
    const k = e.scaleArc ? (0.35 + 0.65 * M.intensity(e.t)) : 1;
    const dec = (d) => Math.exp(-dt / d) * k;
    switch (e.fx) {
      case 'flash': { const v = e.amt * dec(e.decay); if (v > o.flash) { o.flash = v; o.flashColor = e.color; } break; }
      case 'punch': o.punch += e.amt * dec(e.decay) * (dt < 0.03 ? dt / 0.03 : 1); break;
      case 'shake': o.shake += e.amt * dec(e.decay); break;
      case 'rgb': o.rgb += e.amt * dec(e.decay); break;
      case 'zoomblur': o.zoomblur += e.amt * dec(e.decay); break;
      case 'tilt': o.tilt += e.amt * dec(e.decay) * (hash(e.t * 1000 | 0) > .5 ? 1 : -1); break;
      case 'drift': o.punch += e.amt * (1 - Math.exp(-dt / e.decay)); break;
      case 'invert': if (dt < e.dur) o.invert = true; break;
      case 'blackout': if (dt < beatsOr(e.dur) * (typeof e.dur === 'number' ? S.beat : 1)) o.blackout = true; break;
      case 'strobe': { const d = (typeof e.dur === 'number' ? e.dur * S.beat : beatsOr(e.dur)); if (dt < d) { const r = e.rate * S.beat; o.strobe = Math.floor(dt / r) % 2 ? 1 : 0; } break; }
      case 'glitch': { const d = (typeof e.dur === 'number' ? e.dur * S.beat : beatsOr(e.dur)); if (dt < d) o.glitch = Math.max(o.glitch, e.amt * (1 - dt / d)); break; }
      case 'ring': if (dt < e.decay * 3) o.ring.push({ dt, e }); break;
      case 'speedlines': { const v = dec(e.decay); if (v > o.speed) { o.speed = v; o.speedColor = e.color; } break; }
      case 'stutter': case 'freeze': case 'slowmo': {
        const d = (typeof e.dur === 'number' ? e.dur * S.beat : beatsOr(e.dur));
        if (dt >= 0 && dt < d && !o.warp) o.warp = e;
        break;
      }
    }
  }
  return o;
}
// 时间扭曲（卡顿 / 定格 / 慢放）：只改镜头看到的时间，歌词和声音照常
function warpT(t, w) {
  if (!w) return t; const dt = t - w.t;
  if (w.fx === 'freeze') return w.t;
  if (w.fx === 'slowmo') return w.t + dt * w.k;
  if (w.fx === 'stutter') { const sl = w.slice * S.beat; return w.t + (dt % sl); }
  return t;
}

// ---------------- 字（歌词也是画面） ----------------
const SIZES = { hero: 210, big: 150, mid: 108, small: 78 };
const DEFSTYLE = { mode: 'pop', size: 'big', pos: 'lower', font: 'NotoSansSC-900', weight: '', fill: '#ffffff', stroke: '#000000', strokeW: 0.09,
  shadow: null, shadowOff: [0.05, 0.06], glow: null, dim: null, spacing: 0.02, maxW: 1640, exit: 'fade', exitDur: 0.22, lead: 0.1, layer: 'world', align: 'center' };
const lyricStyle = (L) => {
  const lc = (C.lyrics || {}), sh = SHOTS[Math.max(0, lastIdx(SHOTS, L.t0 + 0.05, 't0'))];
  const st = { ...DEFSTYLE, ...(SCENE.lyricDefault || {}), ...(lc.default || {}), ...((sh && sh.lyrics) || {}), ...((lc.lines || {})['line' + L.n] || {}) };
  if (typeof st.size === 'string') st.px = SIZES[st.size] || 150; else st.px = st.size;
  return st;
};
const scratch = document.createElement('canvas').getContext('2d');
const fontStr = (st, px) => `${st.weight || ''} ${px}px "${st.font}", "NotoSansSC-900", sans-serif`;
const LAYC = {};
function layout(text, st, px) {
  const key = text + '|' + px + '|' + st.font + '|' + st.maxW + '|' + st.spacing;
  if (LAYC[key]) return LAYC[key];
  scratch.font = fontStr(st, px);
  const chars = [...text].filter(c => c !== ' ' && c !== '　');
  const raw = [...text];
  const ws = chars.map(c => scratch.measureText(c).width + st.spacing * px);
  const total = ws.reduce((a, b) => a + b, 0);
  let rows;
  if (total <= st.maxW || chars.length < 4) rows = [[0, chars.length]];
  else {   // 分两行：优先在空格处断，其次正中间
    let cut = -1, k = 0; const spaces = [];
    raw.forEach(c => { if (c === ' ' || c === '　') spaces.push(k); else k++; });
    if (spaces.length) cut = spaces.reduce((b, s) => Math.abs(s - chars.length / 2) < Math.abs(b - chars.length / 2) ? s : b, spaces[0]);
    else cut = Math.ceil(chars.length / 2);
    rows = [[0, cut], [cut, chars.length]];
  }
  const out = { chars: [], rows: [], px, lineH: px * 1.18 };
  rows.forEach(([a, b], r) => {
    const w = ws.slice(a, b).reduce((x, y) => x + y, 0); let x = -w / 2;
    out.rows.push({ w, a, b });
    for (let j = a; j < b; j++) { out.chars.push({ c: chars[j], j, r, x: x + ws[j] / 2, w: ws[j] }); x += ws[j]; }
  });
  const nr = rows.length; out.chars.forEach(c => { c.y = (c.r - (nr - 1) / 2) * out.lineH; });
  out.w = Math.max(...out.rows.map(r => r.w)); out.h = nr * out.lineH;
  return (LAYC[key] = out);
}
const anchor = (st) => {
  if (Array.isArray(st.pos)) return { x: st.pos[0], y: st.pos[1] };
  if (st.pos && typeof st.pos === 'object') return { x: st.pos.x ?? W / 2, y: st.pos.y ?? H / 2 };
  return { center: { x: W / 2, y: H / 2 }, lower: { x: W / 2, y: H * 0.8 }, upper: { x: W / 2, y: H * 0.2 }, left: { x: W * 0.3, y: H / 2 }, right: { x: W * 0.7, y: H / 2 } }[st.pos] || { x: W / 2, y: H * 0.8 };
};
function glyph(ctx, ch, x, y, px, st) {
  if (SCENE.glyph) return SCENE.glyph(ctx, ch, x, y, px, st, M);
  ctx.font = fontStr(st, px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (st.shadow) { ctx.fillStyle = st.shadow; ctx.fillText(ch, x + st.shadowOff[0] * px, y + st.shadowOff[1] * px); if (st.stroke && st.strokeW) { ctx.lineWidth = st.strokeW * px * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = st.shadow; ctx.strokeText(ch, x + st.shadowOff[0] * px, y + st.shadowOff[1] * px); } }
  if (st.glow) { ctx.shadowColor = st.glow; ctx.shadowBlur = px * 0.3; }
  if (st.stroke && st.strokeW) { ctx.lineWidth = st.strokeW * px * 2; ctx.lineJoin = 'round'; ctx.strokeStyle = st.stroke; ctx.strokeText(ch, x, y); }
  ctx.fillStyle = st.fillNow || st.fill; ctx.fillText(ch, x, y);
  if (st.glow) { ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'; }
}
M.glyph = glyph;
let LOG = [];
const logText = (n, px, a, txt) => { if (a > 0.02 && px > 0) LOG.push({ n, px: Math.round(px), a: +a.toFixed(2), txt: (txt || '').slice(0, 16) }); };
M.logLyric = (n, px, alpha = 1, txt = '') => logText(n, px, alpha, txt);   // 自己画歌词（mode: 'scene'）时调用，审片才知道这句上屏了

// 退场：返回对一个字状态的修改
function exitMod(kind, ex, j, n, s, cx, cy) {
  if (ex <= 0) return;
  const h = hash(j + 1, n * 7 + 3);
  switch (kind) {
    case 'cut': s.a = 0; break;
    case 'up': s.y -= ex * ex * 140; s.a *= 1 - ex; break;
    case 'down': s.y += ex * ex * 140; s.a *= 1 - ex; break;
    case 'zoom': s.sc *= 1 + ex * 1.6; s.a *= 1 - ex; break;
    case 'fall': { const e = clamp(ex * 1.4 - (j / Math.max(1, n)) * 0.4); s.y += e * e * 900; s.rot += (h - .5) * e * 2.4; s.a *= 1 - e * e; break; }
    case 'shatter': { const ang = Math.atan2(s.y - cy, s.x - cx + (h - .5) * 40) + (h - .5) * 0.8, d = ex ** 1.4 * (700 + h * 500); s.x += Math.cos(ang) * d; s.y += Math.sin(ang) * d; s.rot += (h - .5) * ex * 7; s.sc *= 1 + ex * .5; s.a *= 1 - ex; break; }
    case 'squash': s.sc *= 1 - ex * 0.9; s.a *= 1 - ex * ex; break;
    default: s.a *= 1 - ex;   // fade
  }
}
// 各种上屏方式：返回每个字的 {x, y, sc, rot, a, fill}
const MODES = {
  pop(L, st, t, c, lay) { const on = clamp((t - c.t) / 0.16); if (t < c.t) return null; return { sc: ease.outBack(on, 2.2), a: 1 }; },
  slam(L, st, t, c, lay) { if (t < c.t) return null; const on = clamp((t - c.t) / 0.11); const land = t - c.t - 0.11; const jig = land > 0 ? Math.exp(-land / 0.08) * 0.06 : 0; return { sc: lerp(2.5, 1, ease.out3(on)) + jig, a: smooth(0, .35, on), ghost: on < 1 }; },
  karaoke(L, st, t, c, lay) { if (t < L.t0 - st.lead) return null; const k = clamp((t - c.t) / 0.08); const bump = t >= c.t ? Math.exp(-(t - c.t) / 0.12) * 0.1 : 0;
    return { sc: 1 + bump, a: smooth(L.t0 - st.lead, L.t0 + 0.05, t), fill: k >= 1 ? st.fill : (st.dim || 'rgba(255,255,255,.32)'), mix: k }; },
  type(L, st, t, c, lay) { if (t < c.t) return null; return { sc: 1, a: 1 }; },
  stamp(L, st, t, c, lay) { const k = clamp((t - L.t0) / 0.13); if (t < L.t0) return null; return { sc: lerp(1.55, 1, ease.out3(k)), a: k > 0 ? 1 : 0, rotLine: lerp(-0.16, -0.05, ease.out3(k)) * (hash(L.n) > .5 ? 1 : -1) }; },
  wave(L, st, t, c, lay) { if (t < c.t) return null; const on = clamp((t - c.t) / 0.16), b = M.beat(t); return { sc: ease.outBack(on, 2) * (1 + 0.08 * M.pulse('beat', { t, decay: .15 })), dy: Math.sin(TAU * b.p + c.j * 0.7) * lay.px * 0.09, a: 1 }; },
  scatter(L, st, t, c, lay) { if (t < c.t) return null; const on = clamp((t - c.t) / 0.15), h1 = hash(c.j + 3, L.n), h2 = hash(c.j + 9, L.n + 5), h3 = hash(c.j, L.n + 11);
    return { abs: [lerp(260, W - 260, h1), lerp(220, H - 220, h2)], sc: ease.outBack(on, 2.4) * lerp(0.75, 1.6, h3), rot: (h2 - .5) * 0.5, a: 1 }; },
  big(L, st, t, c, lay) { if (t < c.t) return null; const on = clamp((t - c.t) / 0.1); return { sc: lerp(1.35, 1, ease.out3(on)), a: smooth(0, .5, on) }; },
  stack(L, st, t, c, lay, chs) {   // 正在唱的那个字占满画面，唱过的排到下方一行
    if (t < c.t) return null;
    const cur = chs.filter(x => t >= x.t).length - 1, n = chs.length;
    const rowPx = Math.min(110, 1500 / n), rowX = W / 2 - (n - 1) * rowPx * 0.55 + c.j * rowPx * 1.1;
    if (c.j === cur) { const on = clamp((t - c.t) / 0.12); return { abs: [W / 2, H * 0.44], scPx: 560, sc: lerp(1.25, 1, ease.out3(on)), a: 1 }; }
    const k = ease.inOut3(clamp((t - chs[c.j + 1].t) / 0.16));
    return { abs: [lerp(W / 2, rowX, k), lerp(H * 0.44, H * 0.86, k)], scPx: lerp(560, rowPx, k), sc: 1, a: 1 };
  },
};
MODES.chat = MODES.type; MODES.bubble = MODES.pop;

function drawLine(ctx, L, st, t, camZoom) {
  const mode = MODES[st.mode]; if (!mode) throw new Error('没有这种歌词上屏方式：' + st.mode + '（' + Object.keys(MODES).join(' ') + ' scene none）');
  let px = st.px;
  if (st.mode === 'big') { const l0 = layout(L.text, { ...st, maxW: 99999 }, 100); px = Math.min(260, 100 * (W * 0.86) / l0.w); }
  else if (st.mode !== 'stack' && st.mode !== 'scatter') {   // 一行太长就缩字号，别出画面（最多两行）
    const l1 = layout(L.text, { ...st, maxW: 99999 }, px), rows = l1.w > st.maxW ? 2 : 1, need = l1.w / rows * (rows === 2 ? 1.08 : 1);
    if (need > Math.min(st.maxW, W * 0.84)) px *= Math.min(st.maxW, W * 0.84) / need;
  }
  const lay = layout(L.text, st, px), A = anchor(st);
  const tEnd = L.t1, ex = clamp((t - tEnd) / st.exitDur);
  const chs = L.chars;
  // 气泡 / 聊天框 / 印章框（整句的底）
  const firstOn = t >= L.t0;
  if ((st.mode === 'bubble' || st.mode === 'chat' || st.box) && t >= L.t0 - st.lead) {
    const k = ease.outBack(clamp((t - L.t0 + st.lead) / 0.2), 1.8) * (1 - ex), padX = px * 0.55, padY = px * 0.42;
    let bw = lay.w + padX * 2;
    if (st.mode === 'chat') { const shown = chs.filter(c => t >= c.t).length; bw = Math.max(px * 2, (lay.w * shown / chs.length) + padX * 2); }
    const bh = lay.h + padY * 2;
    ctx.save(); ctx.translate(A.x, A.y); ctx.scale(k, k);
    const fill = st.boxFill || (st.mode === 'chat' ? '#ffffff' : '#ffffff'), line = st.boxStroke || '#111111';
    ctx.beginPath(); const x0 = st.mode === 'chat' ? -lay.w / 2 - padX : -bw / 2;
    ctx.roundRect(x0, -bh / 2, bw, bh, st.mode === 'chat' ? px * 0.5 : px * 0.6);
    if (st.mode === 'bubble') { const tx = st.tail ? st.tail[0] - A.x : -bw * 0.2, ty = st.tail ? st.tail[1] - A.y : bh * 1.1; ctx.moveTo(-bw * 0.08, bh / 2 - 2); ctx.lineTo(tx, ty); ctx.lineTo(bw * 0.08, bh / 2 - 2); }
    ctx.fillStyle = fill; ctx.fill(); if (st.boxStrokeW !== 0) { ctx.lineWidth = st.boxStrokeW || px * 0.06; ctx.strokeStyle = line; ctx.stroke(); }
    ctx.restore();
  }
  if (st.mode === 'stamp' && st.frame !== false && firstOn) {
    const s0 = MODES.stamp(L, st, t, chs[0], lay); if (s0) { ctx.save(); ctx.globalAlpha *= (1 - ex); ctx.translate(A.x, A.y); ctx.rotate(s0.rotLine); ctx.scale(s0.sc, s0.sc);
      ctx.strokeStyle = st.frameColor || st.fill; ctx.lineWidth = px * 0.07; ctx.strokeRect(-lay.w / 2 - px * 0.35, -lay.h / 2 - px * 0.22, lay.w + px * 0.7, lay.h + px * 0.44); ctx.restore(); }
  }
  let vis = 0, amax = 0;
  for (const c of lay.chars) {
    const cs = chs[c.j] || { t: L.t0 };
    const s0 = mode(L, st, t, { ...c, t: cs.t, j: c.j }, lay, chs.map((x, j) => ({ ...x, j })));
    if (!s0) continue;
    const s = { x: A.x + c.x, y: A.y + c.y, sc: s0.sc ?? 1, rot: s0.rot || 0, a: s0.a ?? 1 };
    if (st.mode === 'chat' || st.align === 'left') s.x = A.x - lay.w / 2 + c.x + lay.rows[c.r].w / 2;
    if (s0.abs) { s.x = s0.abs[0]; s.y = s0.abs[1]; }
    if (s0.dy) s.y += s0.dy;
    if (s0.rotLine) { const ca = Math.cos(s0.rotLine), sa = Math.sin(s0.rotLine), dx = s.x - A.x, dy = s.y - A.y; s.x = A.x + (dx * ca - dy * sa) * s.sc; s.y = A.y + (dx * sa + dy * ca) * s.sc; s.rot += s0.rotLine; }
    exitMod(st.exit, ex, c.j, chs.length, s, A.x, A.y);
    if (s.a <= 0.01) continue;
    const cpx = s0.scPx || px;
    ctx.save(); ctx.globalAlpha *= s.a; ctx.translate(s.x, s.y); ctx.rotate(s.rot); ctx.scale(s.sc, s.sc);
    if (s0.ghost) { ctx.save(); ctx.globalAlpha *= 0.25; ctx.scale(1.25, 1.25); glyph(ctx, c.c, 0, 0, cpx, st); ctx.restore(); }
    const st2 = s0.fill ? { ...st, fillNow: s0.fill } : st;
    glyph(ctx, c.c, 0, 0, cpx, st2);
    ctx.restore();
    vis++; amax = Math.max(amax, s.a);
    if (st.mode === 'stack' && s0.scPx === 560) logText(L.n, cpx * s.sc * camZoom, s.a, c.c);
  }
  // 打字机光标
  if ((st.mode === 'type' || st.mode === 'chat') && t >= L.t0 && ex < 1 && st.cursor !== false) {
    const shown = chs.filter(c => t >= c.t).length; const last = lay.chars[Math.max(0, shown - 1)];
    if (Math.floor((t - L.t0) / (S.beat / 2)) % 2 === 0 || shown < chs.length) {
      const x = A.x + (last ? last.x + last.w / 2 : -lay.w / 2) + px * 0.12, y = A.y + (last ? last.y : 0);
      ctx.save(); ctx.globalAlpha *= 1 - ex; ctx.fillStyle = st.cursorColor || st.fill; ctx.fillRect(x, y - px * 0.42, px * 0.09, px * 0.84); ctx.restore();
    }
  }
  if (vis && st.mode !== 'stack') logText(L.n, px * camZoom, amax * (1 - ex * 0.5), L.text);
}
function drawLyrics(ctx, t, where, camZoom) {
  for (const L of S.lines) {
    const st = lyricStyle(L);
    if (st.mode === 'scene' || st.mode === 'none' || (st.layer || 'world') !== where) continue;
    if (t < L.t0 - st.lead - 0.05 || t > L.t1 + st.exitDur) continue;
    drawLine(ctx, L, st, t, camZoom);
  }
}
M.drawLine = (ctx, n, o = {}, t = M.t) => { const L = M.lineN(n); if (L) drawLine(ctx, L, { ...lyricStyle(L), ...o, px: o.px || SIZES[o.size] || o.size || lyricStyle(L).px }, t, 1); };
M.text = (ctx, str, x, y, o = {}) => {   // 普通的字（不是歌词）
  const px = o.size || 64, st = { ...DEFSTYLE, ...o, px };
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
  const lay = layout(str, { ...st, maxW: o.maxW || 99999 }, px);
  for (const c of lay.chars) glyph(ctx, c.c, c.x + (o.align === 'left' ? lay.w / 2 : o.align === 'right' ? -lay.w / 2 : 0), c.y, px, st);
  ctx.restore(); return lay.w;
};
M.measure = (str, o = {}) => layout(str, { ...DEFSTYLE, ...o, maxW: 99999 }, o.size || 64).w;

// ---------------- 图片（生图素材）：铺满 + 推拉摇 ----------------
// zoom 1 = 正好铺满画面；cx / cy（0..1）= 图上哪一点放在画面中心；会自动收住，不露边
M.photo = (ctx, img, o = {}) => {
  if (typeof img === 'string') { const k = img; img = M.img[k]; if (!img) throw new Error('没有这张图：' + k + '（在 cues.json images 或 scene.js images 里登记）'); }
  const zoom = Math.max(1, o.zoom ?? 1), cx = o.cx ?? .5, cy = o.cy ?? .5;
  const sc = Math.max(W / img.width, H / img.height) * zoom, w = img.width * sc, h = img.height * sc;
  const x = Math.min(0, Math.max(W - w, W / 2 - cx * w)), y = Math.min(0, Math.max(H - h, H / 2 - cy * h));
  ctx.save(); ctx.globalAlpha *= o.alpha ?? 1; if (o.filter) ctx.filter = o.filter; ctx.drawImage(img, x, y, w, h); ctx.restore();
};
// 镜头内从 from 推到 to：返回 {zoom, cx, cy}
M.kb = (s, from = {}, to = {}, easeName = 'inOut2') => { const e = E(easeName)(clamp(s.p)); return { zoom: lerp(from.zoom ?? 1, to.zoom ?? from.zoom ?? 1, e), cx: lerp(from.cx ?? .5, to.cx ?? from.cx ?? .5, e), cy: lerp(from.cy ?? .5, to.cy ?? from.cy ?? .5, e) }; };
// 氛围粒子（纯函数）：embers 火星上飘 / dust 风沙横吹 / rain 雨 / snow 雪 / petals 花瓣 / sparks 炸开的火花（at 时刻） / fireworks 烟花（at 时刻或 on 拍子）
M.particles = (ctx, name, o = {}) => {
  const t = o.t ?? M.t, n = o.n ?? 60, col = o.color, seed = o.seed ?? 7, a0 = o.alpha ?? 1;
  ctx.save(); ctx.globalAlpha *= a0;
  const R = (i, k) => hash(i + seed * 1000, k);
  if (name === 'embers' || name === 'snow' || name === 'rain' || name === 'dust' || name === 'petals') {
    for (let i = 0; i < n; i++) {
      const sp = { embers: 90, snow: 60, rain: 1400, dust: 700, petals: 120 }[name] * (0.6 + R(i, 1)) * (o.speed ?? 1);
      const life = (H + 200) / sp, ph = R(i, 2) * life, k = ((t + ph) % life) / life;
      let x = R(i, 3) * (W + 400) - 200, y;
      if (name === 'embers') { y = H + 50 - k * (H + 200); x += Math.sin(t * 1.3 + i) * 40; }
      else if (name === 'dust') { x = ((R(i, 3) * W + t * sp) % (W + 400)) - 200; y = R(i, 4) * H; }
      else { y = -100 + k * (H + 200); x += (name === 'rain' ? -0.25 : 0.15) * k * H + (name === 'petals' ? Math.sin(t * 2 + i) * 60 : 0); }
      const r = (o.size ?? { embers: 3, snow: 4, rain: 1.5, dust: 2, petals: 6 }[name]) * (0.5 + R(i, 5));
      ctx.fillStyle = col || { embers: '#ffb347', snow: '#ffffff', rain: '#cfe3ff', dust: '#d9b77a', petals: '#ff9fb3' }[name];
      if (name === 'rain') { ctx.globalAlpha = a0 * 0.5; ctx.fillRect(x, y, r, 38); }
      else { ctx.globalAlpha = a0 * (name === 'embers' ? (1 - k) * (0.5 + 0.5 * Math.sin(t * 9 + i)) : 0.8); ctx.beginPath(); ctx.ellipse(x, y, r * (name === 'petals' ? 1.6 : 1), r, t + i, 0, TAU); ctx.fill(); }
    }
  } else if (name === 'sparks' || name === 'fireworks') {
    const times = o.at !== undefined ? [].concat(o.at).map(ref) : evTimes(o.on || 'bar');
    for (let q = 0; q < times.length; q++) {
      const dt = t - times[q]; if (dt < 0 || dt > 1.6) continue;
      const cx = o.x ?? (name === 'fireworks' ? lerp(300, W - 300, R(q, 11)) : W / 2), cy = o.y ?? (name === 'fireworks' ? lerp(150, 450, R(q, 12)) : H / 2);
      const hue = o.hue ?? (R(q, 13) * 360), k = dt / 1.6, rad = ease.outExpo(Math.min(1, dt / 0.9)) * (o.r ?? 320);
      for (let i = 0; i < n; i++) {
        const ang = i / n * TAU + R(q, i) * 0.2, rr = rad * (0.7 + 0.3 * R(i, q + 3)), drop = dt * dt * 120;
        ctx.globalAlpha = a0 * (1 - k) ** 1.5; ctx.fillStyle = col || `hsl(${hue} 90% ${65 + 20 * R(i, 9)}%)`;
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr + drop, (o.size ?? 3.5) * (1 - k * 0.6), 0, TAU); ctx.fill();
      }
    }
  }
  ctx.restore();
};
// 内置镜头 photo：一张图 + 推拉摇 + 拍子上轻弹 + 氛围粒子。cues.json 里直接写，不用写代码：
// {"at":"line3","scene":"photo","params":{"img":"s3","from":{"zoom":1.05,"cx":0.4},"to":{"zoom":1.2,"cx":0.55},"bump":{"on":"bar","amt":0.03},"particles":[{"name":"embers","n":50}]}}
const PHOTO_SHOT = (ctx, s, M) => {
  const P = s.params || {}; const v = M.kb(s, P.from || { zoom: 1.04 }, P.to || { zoom: 1.12 }, P.ease || 'inOut2');
  if (P.bump) v.zoom *= 1 + (P.bump.amt ?? 0.03) * M.pulse(P.bump.on || 'bar', { decay: P.bump.decay ?? 0.25 });
  M.photo(ctx, P.img, v);
  if (P.tint) { ctx.save(); ctx.globalAlpha = P.tint.alpha ?? 0.25; ctx.globalCompositeOperation = P.tint.mode || 'multiply'; ctx.fillStyle = P.tint.color; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  for (const q of (P.particles || [])) M.particles(ctx, q.name, q);
};

// ---------------- 转场 ----------------
const TRANS = {
  fade(o, a, b, k) { o.drawImage(a, 0, 0, W, H); o.globalAlpha = ease.inOut2(k); o.drawImage(b, 0, 0, W, H); o.globalAlpha = 1; },
  flash(o, a, b, k) { o.drawImage(k < .5 ? a : b, 0, 0, W, H); o.fillStyle = '#fff'; o.globalAlpha = (1 - Math.abs(k - .5) * 2) ** 2; o.fillRect(0, 0, W, H); o.globalAlpha = 1; },
  whip(o, a, b, k, dir = [-1, 0]) {
    const e = ease.inOut3(k), v = Math.sin(Math.PI * k);   // 中间最快
    const draw = (img, off) => { for (let g = 0; g < 6; g++) { const s = (g / 5 - .5) * v * 260; o.globalAlpha = g === 0 ? 1 : 0.32; o.drawImage(img, dir[0] * (off + s), dir[1] * (off + s) * H / W, W, H); } o.globalAlpha = 1; };
    if (k < .5) draw(a, e * W); else draw(b, (e - 1) * W);
  },
  push(o, a, b, k, dir = [-1, 0]) { const e = ease.inOut5(k); o.drawImage(a, dir[0] * e * W, dir[1] * e * H, W, H); o.drawImage(b, dir[0] * (e - 1) * W, dir[1] * (e - 1) * H, W, H); },
  zoom(o, a, b, k) {
    if (k < .5) { const e = ease.in3(k * 2), z = 1 + e * 2.2; for (let g = 0; g < 5; g++) { const zz = z * (1 + g * 0.04 * e); o.globalAlpha = g ? 0.25 : 1; o.drawImage(a, W / 2 - W * zz / 2, H / 2 - H * zz / 2, W * zz, H * zz); } }
    else { const e = ease.out3((k - .5) * 2), z = lerp(0.55, 1, e); for (let g = 0; g < 5; g++) { const zz = z * (1 - g * 0.035 * (1 - e)); o.globalAlpha = g ? 0.25 : 1; o.drawImage(b, W / 2 - W * zz / 2, H / 2 - H * zz / 2, W * zz, H * zz); } }
    o.globalAlpha = 1;
  },
  iris(o, a, b, k) { o.drawImage(a, 0, 0, W, H); o.save(); o.beginPath(); o.arc(W / 2, H / 2, ease.inOut3(k) * Math.hypot(W, H) / 2, 0, TAU); o.clip(); o.drawImage(b, 0, 0, W, H); o.restore(); },
  wipe(o, a, b, k) {
    const e = ease.inOut3(k), x = lerp(-H * 0.6, W + H * 0.6, e), band = 90;
    o.drawImage(a, 0, 0, W, H);
    o.save(); o.beginPath(); o.moveTo(x - H * 0.5, H); o.lineTo(x + H * 0.5, 0); o.lineTo(-10, 0); o.lineTo(-10, H); o.closePath(); o.clip(); o.drawImage(b, 0, 0, W, H); o.restore();
    o.save(); o.fillStyle = (C.look && C.look.accent) || '#ffd400'; o.beginPath(); o.moveTo(x - H * 0.5, H); o.lineTo(x + H * 0.5, 0); o.lineTo(x + H * 0.5 + band, 0); o.lineTo(x - H * 0.5 + band, H); o.closePath(); o.fill(); o.restore();
  },
  glitch(o, a, b, k) {
    const step = Math.floor(k * 12);
    for (let i = 0; i < 18; i++) { const y0 = i * H / 18, h = H / 18 + 1, pick = hash(i, step) < k ? b : a, dx = (hash(i + 40, step) - .5) * 260 * Math.sin(Math.PI * k);
      o.drawImage(pick, 0, y0 * SC, W * SC, h * SC, dx, y0, W, h); }
  },
  smash(o, a, b, k) { if (k < .5) o.drawImage(a, 0, 0, W, H); else { const z = lerp(1.18, 1, ease.out3((k - .5) * 2)); o.drawImage(b, W / 2 - W * z / 2, H / 2 - H * z / 2, W * z, H * z); } },
};
const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
function transition(name) {
  const [base, d] = name.split('-');
  const f = TRANS[base]; if (!f) throw new Error('没有这种转场：' + name + '（cut fade flash whip-left/right/up/down push-… zoom iris wipe glitch smash）');
  return (o, a, b, k) => f(o, a, b, k, DIRS[d] || [-1, 0]);
}

// ---------------- 一帧 ----------------
let MAIN, MCTX;
function paintShot(L, sh, t, warp) {
  const ctx = begin(L, (C.look && C.look.bg) || SCENE.bg || '#000');
  const fn = (SCENE.shots || {})[sh.scene] || (sh.scene === 'photo' ? PHOTO_SHOT : null);
  if (!fn) throw new Error(`卡点表里的镜头用了画面 "${sh.scene}"，scene.js 的 shots 里没有`);
  const tw = warpT(t, warp);
  const s = { id: sh.id, scene: sh.scene, i: sh.i, t: tw, lt: Math.max(0, tw - sh.t0), dur: sh.dur, p: clamp((tw - sh.t0) / sh.dur), params: sh.params || {}, t0: sh.t0, t1: sh.t1, why: sh.why };
  const keep = M.t; M.t = tw; M.s = s;
  ctx.save(); fn(ctx, s, M); ctx.restore();
  M.t = keep;
  return ctx;
}
function frame(t) {
  LOG = [];
  M.t = t;
  const fx = M.fx = fxAt(t);
  const cam = M.cam = { zoom: 1 + fx.punch, x: 0, y: 0, rot: fx.tilt };
  if (fx.shake > 0.1) { cam.x += noise(t * 31, 1.3) * fx.shake; cam.y += noise(t * 29, 7.1) * fx.shake; cam.rot += noise(t * 23, 3.3) * fx.shake * 0.0012; }
  const i = Math.max(0, lastIdx(SHOTS, t, 't0')), cur = SHOTS[i], nxt = SHOTS[i + 1];
  if (cur.cam) { const p = clamp((t - cur.t0) / cur.dur), c0 = cur.cam.from || {}, c1 = cur.cam.to || {}, e = E(cur.cam.ease || 'inOut3')(p);
    cam.zoom *= lerp(c0.zoom ?? 1, c1.zoom ?? c0.zoom ?? 1, e); cam.x += lerp(c0.x ?? 0, c1.x ?? c0.x ?? 0, e); cam.y += lerp(c0.y ?? 0, c1.y ?? c0.y ?? 0, e); cam.rot += lerp(c0.rot ?? 0, c1.rot ?? c0.rot ?? 0, e); }
  if (SCENE.camera) SCENE.camera(cam, M);
  let out = null, inn = cur, k = 1;
  if (nxt && nxt.in !== 'cut' && t >= nxt.t0 - nxt.td / 2) { out = cur; inn = nxt; k = (t - (nxt.t0 - nxt.td / 2)) / nxt.td; }
  else if (cur.in !== 'cut' && i > 0 && t < cur.t0 + cur.td / 2) { out = SHOTS[i - 1]; inn = cur; k = (t - (cur.t0 - cur.td / 2)) / cur.td; }
  const A = layer('A');
  let actx;
  if (!out) actx = paintShot(A, inn, t, fx.warp);
  else {
    paintShot(layer('B'), out, t, fx.warp); paintShot(layer('Cc'), inn, t, fx.warp);
    actx = begin(A, '#000'); transition(inn.in)(actx, layer('B'), layer('Cc'), clamp(k));
  }
  const zoomNow = Math.max(cam.zoom, 1 + 2 * Math.max(Math.abs(cam.x) / W, Math.abs(cam.y) / H) + Math.abs(cam.rot) * 0.9);
  drawLyrics(actx, t, 'world', zoomNow);
  if (SCENE.post) { actx.save(); SCENE.post(actx, M); actx.restore(); }
  // 合成：镜头（推拉、震动、倾斜）+ 色散 + 径向模糊
  const o = MCTX; o.setTransform(1, 0, 0, 1, 0, 0); o.globalAlpha = 1; o.globalCompositeOperation = 'source-over'; o.fillStyle = '#000'; o.fillRect(0, 0, MAIN.width, MAIN.height);
  o.setTransform(SC, 0, 0, SC, 0, 0);
  o.save(); o.translate(W / 2 + cam.x, H / 2 + cam.y); o.rotate(cam.rot); o.scale(zoomNow, zoomNow); o.translate(-W / 2, -H / 2);
  if (fx.rgb > 0.6) {
    const T = layer('T'), tc = T.getContext('2d');
    o.globalCompositeOperation = 'lighter';
    [['#ff0000', -1], ['#00ff00', 0], ['#0000ff', 1]].forEach(([col, d]) => {
      tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.drawImage(A, 0, 0); tc.globalCompositeOperation = 'multiply'; tc.fillStyle = col; tc.fillRect(0, 0, T.width, T.height);
      o.drawImage(T, d * fx.rgb, d * fx.rgb * 0.3, W, H);
    });
    o.globalCompositeOperation = 'source-over';
  } else o.drawImage(A, 0, 0, W, H);
  if (fx.zoomblur > 0.005) for (let g = 1; g <= 5; g++) { const z = 1 + fx.zoomblur * g / 5; o.globalAlpha = 0.18; o.drawImage(A, W / 2 - W * z / 2, H / 2 - H * z / 2, W * z, H * z); }
  o.globalAlpha = 1; o.restore();
  if (fx.glitch > 1) { const T = layer('T'), tc = T.getContext('2d'); tc.setTransform(1, 0, 0, 1, 0, 0); tc.globalCompositeOperation = 'source-over'; tc.drawImage(MAIN, 0, 0); const st = Math.floor(t * 30);
    for (let s = 0; s < 14; s++) { const y0 = hash(s, st) * H, h = 12 + hash(s + 7, st) * 90, dx = (hash(s + 3, st) - .5) * 2 * fx.glitch; o.drawImage(T, 0, y0 * SC, W * SC, h * SC, dx, y0, W, h); } }
  drawLyrics(o, t, 'screen', 1);
  for (const r of fx.ring) { const e = r.e, k2 = r.dt / (e.decay * 3); o.save(); o.strokeStyle = e.color; o.globalAlpha = (1 - k2) * 0.9; o.lineWidth = 40 * (1 - k2) + 2; o.beginPath(); o.arc(e.x ?? W / 2, e.y ?? H / 2, ease.out3(k2) * W * 0.75, 0, TAU); o.stroke(); o.restore(); }
  if (fx.speed > 0.02) { o.save(); o.fillStyle = fx.speedColor; o.globalAlpha = Math.min(1, fx.speed * 1.2); const st = Math.floor(t * 30);
    for (let s = 0; s < 64; s++) { const a = (s / 64) * TAU + hash(s, st) * 0.08, r0 = 330 + hash(s + 5, st) * 260, w = 0.012 + hash(s + 9, st) * 0.016;
      o.beginPath(); o.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0); o.lineTo(W / 2 + Math.cos(a - w) * 1500, H / 2 + Math.sin(a - w) * 1500); o.lineTo(W / 2 + Math.cos(a + w) * 1500, H / 2 + Math.sin(a + w) * 1500); o.closePath(); o.fill(); }
    o.restore(); }
  if (SCENE.overlay) { o.save(); SCENE.overlay(o, M); o.restore(); }
  if (fx.flash > 0.01) { o.fillStyle = fx.flashColor; o.globalAlpha = Math.min(1, fx.flash); o.fillRect(0, 0, W, H); o.globalAlpha = 1; }
  if (fx.blackout) { o.fillStyle = '#000'; o.fillRect(0, 0, W, H); }
  if (fx.invert || fx.strobe) { o.globalCompositeOperation = 'difference'; o.fillStyle = '#fff'; o.fillRect(0, 0, W, H); o.globalCompositeOperation = 'source-over'; }
  const look = C.look || {};
  if (look.vignette) { const g = cached('vig' + look.vignette, W, H, (c) => { const gr = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 1.0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${look.vignette})`); c.fillStyle = gr; c.fillRect(0, 0, W, H); }); o.drawImage(g, 0, 0); }
  if (look.grain) { const g = cached('grain', 512, 512, (c) => { const d = c.createImageData(512, 512), r = rng(7); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } c.putImageData(d, 0, 0); });
    o.save(); o.globalAlpha = look.grain; o.globalCompositeOperation = 'overlay'; const fr = Math.floor(t * 30), ox = hash(fr) * 512, oy = hash(fr, 3) * 512; o.translate(-ox, -oy); o.fillStyle = o.createPattern(g, 'repeat'); o.fillRect(0, 0, W + 512, H + 512); o.restore(); }
  if (DEBUG) debugOverlay(o, t, cur);
}
function debugOverlay(o, t, cur) {
  const b = M.bar(t), sec = M.section(t), L = M.line(t);
  o.save(); o.font = '28px monospace'; o.textAlign = 'left'; o.textBaseline = 'top'; o.fillStyle = 'rgba(0,0,0,.6)'; o.fillRect(0, 0, W, 46);
  o.fillStyle = '#ffe14d'; o.fillText(`${t.toFixed(2)}s  bar${b.n}.${b.beat}  ${sec.letter}${sec.i + 1}${sec.kind}  镜头 ${cur.id}:${cur.scene}  ${L ? 'line' + L.n : ''}  ${MOMENTS.filter(m => Math.abs(t - m.t) < 0.25).map(m => '★' + m.name).join(' ')}`, 12, 9);
  for (let k = 0; k < 4; k++) { o.fillStyle = k + 1 === b.beat ? '#ff4d4d' : '#555'; o.fillRect(W - 220 + k * 50, 8, 40, 30); }
  o.restore();
}

// ---------------- 加载 ----------------
async function loadAll() {
  const j = (u) => fetch(u, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('读不到 ' + u); return r.json(); });
  S = await j('song.json'); C = await j('cues.json');
  M.song = S; M.cues = C; M.dur = S.dur;
  DB0 = Math.max(0, S.downbeats.findIndex(d => Math.abs(d - S.first_downbeat) < 1e-3));
  EV.beat = S.beats; EV.bar = S.downbeats; EV.kick = S.kicks.map(x => x.t); EV.snare = S.snares.map(x => x.t); EV.hat = S.hats.map(x => x.t);
  STR.kick = S.kicks.map(x => x.s); STR.snare = S.snares.map(x => x.s); STR.hat = S.hats.map(x => x.s);
  EV.line = S.lines.map(l => l.t0); EV.char = S.lines.flatMap(l => l.chars.map(c => c.t)).sort((a, b) => a - b);
  if (!SCENE) throw new Error('scene.js 没有调用 MV.scene({...})');
  // 字体：fonts/fonts.json 里的全部 + scene.fonts
  let fl = {}; try { fl = await j('fonts/fonts.json'); } catch (e) { }
  Object.assign(fl, SCENE.fonts || {});
  await Promise.all(Object.entries(fl).map(async ([name, url]) => { const f = new FontFace(name, `url("${url}")`); await f.load(); document.fonts.add(f); M.fonts[name] = true; }));
  await Promise.all(Object.entries({ ...(C.images || {}), ...(SCENE.images || {}) }).map(([k, u]) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => { M.img[k] = im; ok(); }; im.onerror = () => bad(new Error('图片读不到：' + u)); im.src = u; })));
  buildCues();
  MAIN = document.getElementById('c'); MAIN.width = W * SC; MAIN.height = H * SC; MCTX = MAIN.getContext('2d');
  if (SCENE.setup) await SCENE.setup(M);
  window.DUR = S.dur; window.FPS_HINT = 60;
  window.render = (t) => { frame(t); window.__mvlog = LOG; return LOG; };
  window.MV_INFO = () => ({ dur: S.dur, shots: SHOTS.map(s => ({ id: s.id, scene: s.scene, t0: s.t0, t1: s.t1, in: s.in })), moments: MOMENTS.map(m => ({ name: m.name, t: m.t, big: !!m.big, fx: m.fx.map(f => f.fx) })) });
  window.READY = true;
  if (!RENDER) player();
}
function player() {
  document.body.style.cssText = 'margin:0;background:#111;color:#ddd;font:14px sans-serif;overflow:hidden';
  MAIN.style.cssText = 'display:block;position:absolute;left:50%;top:calc(50% - 22px);transform:translate(-50%,-50%);width:min(100vw,calc((100vh - 44px)*16/9));height:auto;aspect-ratio:16/9;background:#000';
  const au = new Audio('audio.wav'); au.preload = 'auto';
  const bar = document.createElement('div'); bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:44px;background:#1b1b1f;display:flex;align-items:center;gap:12px;padding:0 12px;user-select:none';
  bar.innerHTML = '<button id=pp style="width:70px">播放</button><div id=tl style="flex:1;height:18px;background:#333;position:relative;cursor:pointer"><div id=ph style="position:absolute;top:0;bottom:0;width:2px;background:#ffd34d"></div></div><span id=tm style="width:300px;font-family:monospace"></span>';
  document.body.appendChild(bar);
  const tl = bar.querySelector('#tl');
  for (const s of S.sections) { const d = document.createElement('div'); d.style.cssText = `position:absolute;top:0;bottom:0;left:${s.t0 / S.dur * 100}%;width:${(s.t1 - s.t0) / S.dur * 100}%;background:hsla(${s.letter.charCodeAt(0) * 67 % 360},50%,45%,.45);border-left:1px solid #000`; d.title = s.kind; tl.appendChild(d); }
  for (const m of MOMENTS.filter(m => m.big)) { const d = document.createElement('div'); d.style.cssText = `position:absolute;top:-4px;width:4px;height:26px;left:${m.t / S.dur * 100}%;background:#ff4d4d`; d.title = m.name; tl.appendChild(d); }
  const ph = bar.querySelector('#ph'); tl.appendChild(ph);
  let t = 0;
  const seek = (x) => { t = clamp(x, 0, S.dur - 0.01); au.currentTime = t; };
  tl.onclick = (e) => { const r = tl.getBoundingClientRect(); seek((e.clientX - r.left) / r.width * S.dur); };
  const toggle = () => { if (au.paused) { au.play(); } else au.pause(); };
  bar.querySelector('#pp').onclick = toggle;
  addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); toggle(); } if (e.code === 'ArrowRight') seek(t + S.bar); if (e.code === 'ArrowLeft') seek(t - S.bar); if (e.key === 'd' || e.key === 'D') DEBUG = !DEBUG; });
  const loop = () => { if (!au.paused) t = au.currentTime; frame(t); ph.style.left = (t / S.dur * 100) + '%'; bar.querySelector('#pp').textContent = au.paused ? '播放' : '暂停';
    const b = M.bar(t); bar.querySelector('#tm').textContent = `${t.toFixed(2)} / ${S.dur.toFixed(1)}s  bar${b.n}.${b.beat}`; requestAnimationFrame(loop); };
  loop();
}
addEventListener('load', () => loadAll().catch(e => { console.error(e); window.MV_ERROR = String(e && e.stack || e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;font:16px monospace;white-space:pre-wrap;padding:20px">${String(e && e.stack || e)}</pre>`); }));
})();
