"""修复计划 ①：把人工核对过的逐字时间（align/校正后逐字时间.json）写回 song.json 和 song.md 的歌词表。

  python -I tools/apply_alignment.py <项目>

校正表： {"15": {"text": "蛋糕甜蜜分享 礼物装满期望", "t": [每个字开唱的秒数…], "end": 唱完的秒数}, …}
只改每句的 t0 / t1 / sung_end / chars / at / timing，拍点、段落、鼓点一概不动。
t1 的算法和 skill 的 listen.py 一样。重新跑 new_project.py / listen.py 之后要再跑一遍这个脚本。
"""
import json
import re
import sys
from pathlib import Path

FIX_REL = Path('align') / '校正后逐字时间.json'
TIMING_NOTE = '强制对齐（Qwen3-ForcedAligner）＋分窗口重对、对照人声起音逐句核对'
NEXT_LINE_GAP_S = 0.06
TAIL_S = 0.35
MIN_LINE_S = 0.6
BEAT_TOL_S = 0.03
FALLBACK_TAIL_S = 6.0


def bar_ref(song, t):
    """把秒数写成 bar9 / bar9.3（和 listen.py 的 ref_bar 一样的数法）。"""
    downbeats, beats = song['downbeats'], song['beats']
    first = min(range(len(downbeats)), key=lambda i: abs(downbeats[i] - song['first_downbeat']))
    idx = [k for k, d in enumerate(downbeats) if d <= t + BEAT_TOL_S]
    if not idx:
        return 'bar0'
    i = idx[-1]
    bar_no = i - first + 1
    if abs(t - downbeats[i]) < BEAT_TOL_S:
        return f'bar{bar_no}'
    n_beats = len([b for b in beats if downbeats[i] - BEAT_TOL_S <= b <= t + BEAT_TOL_S])
    return f'bar{bar_no}.{max(1, n_beats)}'


def fixed_line(song, line, fix, next_t0):
    chars = [c for c in line['text'] if not c.isspace()]
    if fix['text'] != line['text'] or len(fix['t']) != len(chars):
        raise ValueError(f'line{line["n"]} 校正表和歌词对不上：「{fix["text"]}」/「{line["text"]}」')
    if any(b < a for a, b in zip(fix['t'], fix['t'][1:])):
        raise ValueError(f'line{line["n"]} 校正表里的时间倒退了')
    t0 = fix['t'][0]
    limit = next_t0 - NEXT_LINE_GAP_S if next_t0 is not None else min(song['dur'], t0 + FALLBACK_TAIL_S)
    sung_end = min(fix['end'], limit)
    return {**line, 't0': t0, 't1': min(limit, max(sung_end + TAIL_S, t0 + MIN_LINE_S)), 'sung_end': sung_end,
            'timing': TIMING_NOTE, 'at': bar_ref(song, t0), 'chars': [{'c': c, 't': t} for c, t in zip(chars, fix['t'])]}


def patched_song_md(md, lines):
    """song.md 的歌词表按新时间重写（其它内容不动）。"""
    by_n = {l['n']: l for l in lines}

    def row(m):
        l = by_n.get(int(m.group(1)))
        if not l:
            return m.group(0)
        hook = ' **(hook)**' if l['hook'] else ''
        return f'| line{l["n"]} | {l["t0"]:.2f} | {l["sung_end"]:.2f} | `{l["at"]}` | {l["text"]}{hook} | {l["repeat"]} 次 |'

    md = re.sub(r'^\| line(\d+) \|[^\n]*\|$', row, md, flags=re.M)
    return re.sub(r'^逐字时间来源：[^\n]*$', '逐字时间来源：' + TIMING_NOTE, md, flags=re.M)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
    song = json.loads((root / 'song.json').read_text(encoding='utf-8'))
    fixes = json.loads((root / FIX_REL).read_text(encoding='utf-8'))
    old = song['lines']
    if len(fixes) != len(old):
        raise SystemExit(f'校正表有 {len(fixes)} 句，song.json 有 {len(old)} 句')
    starts = [fixes[str(l['n'])]['t'][0] for l in old]
    new_lines = [fixed_line(song, l, fixes[str(l['n'])], starts[i + 1] if i + 1 < len(old) else None)
                 for i, l in enumerate(old)]
    (root / 'song.json').write_text(json.dumps({**song, 'lines': new_lines}, ensure_ascii=False), encoding='utf-8')
    md_path = root / 'song.md'
    md_path.write_text(patched_song_md(md_path.read_text(encoding='utf-8'), new_lines), encoding='utf-8')
    moved = [(a['n'], round(b['t0'] - a['t0'], 2)) for a, b in zip(old, new_lines) if abs(b['t0'] - a['t0']) > 0.1]
    print(f'写回 {len(new_lines)} 句；开唱时间改动超过 0.1 秒的：{moved}')


if __name__ == '__main__':
    main()
