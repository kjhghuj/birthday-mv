"""Python 后期（v3 计划第二节，中等强度）：辉光 + 暖调分级 + 桌面聚光。

用法（系统 python3 即可，只依赖 numpy + Pillow）：
  python3 -I tools/postfx.py <项目> stills [t1 t2 ...]   # 处理 out/stills/t_*.jpg → t_*_后期.jpg + 后期对比.jpg
                                                          # 不给时间就挑一组关键帧
  python3 -I tools/postfx.py <项目> video --in out/mv_草稿.mp4 [--out out/mv_草稿_后期.mp4]
                                                          # 全片后期（渲染出片之后用；1080p60 约 20–30 分钟）

四个 pass（修复计划画风约束：忌塑料渐变，所以不动色相、不加 teal-orange）：
  1 辉光：亮部（≥BLOOM_TH，且越饱和权重越高——烛火星星暖灯发光、奶油纸只轻微）高斯模糊后叠加；
          字幕带 y ≥ BAND_Y 完全屏蔽，歌词和字牌保持锐利。
  2 分级：S 曲线轻对比 + 饱和 +7% + 阴影偏暖（R+/B-，权重随暗部增大）。
  3 聚光：画面区中心径向提亮 ≤6%，强化台灯舞台感。
"""
import argparse
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

# ── 参数（中等强度）──
BLOOM_TH = 235.0        # 亮度阈值：超过它开始发光
BLOOM_RANGE = 40.0      # 阈值到多亮算全发光
BLOOM_BLUR = 13         # 高斯模糊半径（px）
BLOOM_STR = 0.45        # 叠加强度（A/B 审看后从 0.5 收敛，奶油白不再贴着过曝）
HIGHLIGHT_KNEE = 240.0  # 高光软压缩起点：往 255 的路走缓，白奶油不炸
HIGHLIGHT_ROLL = 0.6
SAT_BOOST = 1.07        # 饱和度
CONTRAST = 1.055        # S 曲线对比（中点 132）
WARM_R, WARM_B = 1.025, 0.975   # 阴影偏暖
CENTER_GAIN = 0.06      # 聚光最大提亮
CENTER_X, CENTER_Y, CENTER_R = 960, 430, 950
BAND_Y = 875            # 字幕带上沿：辉光不进带
DEFAULT_STILLS = [9.5, 18.7, 51.6, 82.0, 145.6, 163.4, 184.3, 193.7]

X = np.arange(256, dtype=np.float32)
LUT = np.clip(132.0 + (X - 132.0) * CONTRAST, 0, 255)
_CENTER_CACHE = {}


def center_mask(w, h):
    key = (w, h)
    if key not in _CENTER_CACHE:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        sx, sy = w / 1920.0, h / 1080.0
        d = np.hypot(xx - CENTER_X * sx, yy - CENTER_Y * sy) / (CENTER_R * sx)
        _CENTER_CACHE[key] = np.clip(1.0 - d, 0, 1) ** 1.6
    return _CENTER_CACHE[key]


def process(img):
    w, h = img.size
    a = np.asarray(img.convert('RGB'), dtype=np.float32)
    hi = a.max(axis=2)
    lo = a.min(axis=2)
    sat = (hi - lo) / np.maximum(hi, 1.0)
    mask = np.clip((hi - BLOOM_TH) / BLOOM_RANGE, 0, 1) * (0.35 + 0.65 * sat)
    mask[int(BAND_Y * h / 1080.0):, :] = 0.0                      # 字幕带屏蔽
    bright = Image.fromarray(np.clip(a * mask[..., None], 0, 255).astype(np.uint8))
    glow = np.asarray(bright.filter(ImageFilter.GaussianBlur(BLOOM_BLUR)), dtype=np.float32)
    a = a + glow * BLOOM_STR
    # 分级：S 曲线 + 饱和 + 阴影暖
    a = LUT[np.clip(np.round(a), 0, 255).astype(np.uint8)]
    gray = a.mean(axis=2, keepdims=True)
    a = gray + (a - gray) * SAT_BOOST
    warm_w = 1.0 - gray / 255.0
    a[..., 0] *= 1.0 + (WARM_R - 1.0) * warm_w[..., 0]
    a[..., 2] *= 1.0 + (WARM_B - 1.0) * warm_w[..., 0]
    # 聚光
    a *= 1.0 + center_mask(w, h)[..., None] * CENTER_GAIN
    # 高光软压缩：knee 以上滚降，白奶油/白边不再顶满 255
    over = a > HIGHLIGHT_KNEE
    a[over] = HIGHLIGHT_KNEE + (a[over] - HIGHLIGHT_KNEE) * HIGHLIGHT_ROLL
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def still_frame_name(t):
    return f't_{t:07.3f}.jpg'


def run_stills(root, times):
    stills = root / 'out' / 'stills'
    if not times:
        times = DEFAULT_STILLS
    pairs = []
    for t in times:
        src = stills / still_frame_name(t)
        if not src.exists():
            print(f'  跳过 {t}s（没有 {src.name}，先用渲染器出这张静帧）')
            continue
        img = Image.open(src)
        out = process(img)
        dst = stills / src.name.replace('.jpg', '_后期.jpg')
        out.save(dst, quality=90)
        pairs.append((src, dst))
        print(f'  {t}s → {dst.name}')
    if not pairs:
        print('  没有可处理的静帧')
        return
    # 对比表：每行 [原图 | 后期]，缩到每格 940 宽
    cell_w = 940
    rows = []
    for src, dst in pairs:
        a = Image.open(src).convert('RGB')
        b = Image.open(dst).convert('RGB')
        cell_h = round(a.height * cell_w / a.width)
        row = Image.new('RGB', (cell_w * 2 + 16, cell_h), (24, 16, 10))
        row.paste(a.resize((cell_w, cell_h)), (0, 0))
        row.paste(b.resize((cell_w, cell_h)), (cell_w + 16, 0))
        rows.append(row)
    sheet = Image.new('RGB', (cell_w * 2 + 16, sum(r.height for r in rows) + 8 * (len(rows) - 1)), (24, 16, 10))
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height + 8
    sheet.save(stills / '后期对比.jpg', quality=88)
    print(f'对比表 → {stills / "后期对比.jpg"}（左原图 / 右后期，共 {len(pairs)} 组）')


def run_video(root, src, dst):
    import shutil
    probe = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
                            'stream=width,height,r_frame_rate', '-of', 'json', str(src)],
                           capture_output=True, text=True)
    import json
    meta = json.loads(probe.stdout)['streams'][0]
    w, h = int(meta['width']), int(meta['height'])
    fps = eval(meta['r_frame_rate'])  # '60/1' → 60.0
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}',
           '-r', str(fps), '-i', '-', '-i', str(src), '-map', '0:v', '-map', '1:a?',
           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
           '-c:a', 'copy', '-shortest', str(dst)]
    dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', str(src), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                           stdout=subprocess.PIPE, bufsize=10 ** 8)
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frame_size = w * h * 3
    n = 0
    try:
        while True:
            buf = dec.stdout.read(frame_size)
            if not buf or len(buf) < frame_size:
                break
            img = Image.frombytes('RGB', (w, h), buf)
            out = process(img)
            enc.stdin.write(out.tobytes())
            n += 1
            if n % 600 == 0:
                print(f'  … {n} 帧')
    finally:
        dec.stdout.close()
        dec.wait()
        enc.stdin.close()
        enc.wait()
    print(f'完成：{n} 帧 → {dst}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('mode', choices=['stills', 'video'])
    ap.add_argument('times', nargs='*', type=float)
    ap.add_argument('--in', dest='inp', default=None)
    ap.add_argument('--out', dest='out', default=None)
    args = ap.parse_args()
    root = Path(args.project).resolve()
    if args.mode == 'stills':
        run_stills(root, args.times)
    else:
        src = Path(args.inp) if args.inp else root / 'out' / 'mv_草稿.mp4'
        dst = Path(args.out) if args.out else src.with_name(src.stem + '_后期.mp4')
        run_video(root, src, dst)


if __name__ == '__main__':
    main()
