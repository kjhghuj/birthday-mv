"""修复计划 ④③：字幕不许被照片挡住，32 张照片都要出现过。

  python -I tests/check_layout.py [项目文件夹]

做法：用和出片同一个页面，全片每 STEP_S 秒画一帧，读场景登记的布局
（window.MV_LAYOUT = { t, photos: [{id, box}], lyrics: [{box}] }，box = [x0, y0, x1, y1]，
照片的框已经算上镜头推拉震动）。
检查项：
  1. 每一帧都有布局登记，而且是这一帧的（t 对得上）
  2. 屏幕上有歌词的帧：所有照片的下沿都在歌词字形上沿之上（相交帧数 = 0）
  3. 审片日志里有歌词的帧，布局里也登记了歌词框（防止漏登记）
  4. 36 句歌词都上过屏；32 张照片都至少出现一次
有一项不过就以非零状态退出。
"""
import importlib.util
import json
import sys
from pathlib import Path

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

RENDER_PY = Path.home() / '.claude' / 'skills' / 'mv-director' / 'scripts' / 'render.py'
STEP_S = 0.1                 # 每隔多少秒查一帧
RENDER_SCALE = 0.5           # 半尺寸画，布局登记用的是 1920×1080 的逻辑坐标，不受影响
PHOTO_COUNT = 32
VISIBLE_ALPHA = 0.4          # 和 check.py 一致：透明度高于它才算歌词在屏
TIME_TOLERANCE_S = 1e-6
MAX_REPORTED = 12            # 同一类问题最多列几条
GRAB_JS = '(t) => { const log = window.render(t); return { layout: window.MV_LAYOUT || null, log }; }'


def load_render_module():
    spec = importlib.util.spec_from_file_location('mv_render', RENDER_PY)
    if spec is None or spec.loader is None:
        raise FileNotFoundError(f'找不到渲染脚本：{RENDER_PY}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sample_frames(root):
    """返回 [(t, layout, log)]；页面画不出来时抛 RuntimeError。"""
    render = load_render_module()
    with sync_playwright() as p:
        browser, page, _ = render.open_page(p, root, f'&scale={RENDER_SCALE}')
        try:
            dur = float(page.evaluate('window.DUR'))
            times = [round(i * STEP_S, 3) for i in range(int(dur / STEP_S) + 1) if i * STEP_S < dur]
            frames = []
            for t in times:
                try:
                    got = page.evaluate(GRAB_JS, t)
                except PlaywrightError as e:
                    raise RuntimeError(f'{t:.1f}s 这一帧画不出来：{e}') from e
                frames.append((t, got['layout'], got['log'] or []))
            return frames
        finally:
            browser.close()


def frame_problems(t, layout, log):
    """一帧的问题列表：[(类别, 说明)]。"""
    if layout is None:
        return [('没登记', f'{t:.1f}s 场景没有登记布局（window.MV_LAYOUT）')]
    if abs(layout.get('t', -1) - t) > TIME_TOLERANCE_S:
        return [('没登记', f'{t:.1f}s 的布局是旧的（登记的是 {layout.get("t")}s）')]
    lyrics, photos = layout.get('lyrics', []), layout.get('photos', [])
    logged = [x for x in log if x['a'] > VISIBLE_ALPHA]
    if logged and not lyrics:
        return [('漏登记', f'{t:.1f}s 第 {logged[0]["n"]} 句在屏上，但布局里没有歌词框')]
    if not lyrics:
        return []
    lyric_top = min(b['box'][1] for b in lyrics)
    return [('挡字幕', f'{t:.1f}s 照片 p{ph["id"]:02d} 下沿 y={ph["box"][3]:.0f} 伸过歌词上沿 y={lyric_top:.0f}')
            for ph in photos if ph['box'][3] > lyric_top]


def check(root):
    song = json.loads((root / 'song.json').read_text(encoding='utf-8'))
    frames = sample_frames(root)
    problems = [p for t, layout, log in frames for p in frame_problems(t, layout, log)]
    fails = []
    for kind in ('没登记', '漏登记', '挡字幕'):
        items = [msg for k, msg in problems if k == kind]
        if items:
            fails.append(f'{kind}：{len(items)} 帧。' + '；'.join(items[:MAX_REPORTED]))

    seen_photos = {ph['id'] for _, layout, _ in frames if layout for ph in layout.get('photos', [])}
    missing = sorted(set(range(1, PHOTO_COUNT + 1)) - seen_photos)
    if missing:
        fails.append('没出现过的照片：' + ' '.join(f'p{i:02d}' for i in missing))

    seen_lines = {x['n'] for _, _, log in frames for x in log if x['a'] > VISIBLE_ALPHA}
    silent = sorted({ln['n'] for ln in song['lines']} - seen_lines)
    if silent:
        fails.append('没上过屏的歌词：' + ' '.join(f'line{n}' for n in silent))
    lyric_frames = sum(1 for _, layout, _ in frames if layout and layout.get('lyrics'))
    return fails, len(frames), lyric_frames, len(seen_photos)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent).resolve()
    try:
        fails, n_frames, n_lyric, n_photos = check(root)
    except RuntimeError as e:
        print('  ✗', e)
        print('\ncheck_layout：页面画不出来')
        sys.exit(1)
    for f in fails:
        print('  ✗', f)
    if fails:
        print(f'\ncheck_layout：{len(fails)} 项不过（查了 {n_frames} 帧，{n_lyric} 帧有歌词）')
        sys.exit(1)
    print(f'check_layout：通过 ✓（{n_frames} 帧，其中 {n_lyric} 帧有歌词，照片与字幕相交 0 帧；{n_photos} 张照片都出现过）')


if __name__ == '__main__':
    main()
