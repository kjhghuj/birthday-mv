"""修复计划 ①②：检查 song.json 的歌词时间是不是和 歌词.txt、人声分轨对得上。

  python -I tests/check_song.py [项目文件夹]

检查项：
  1. 句数、每句文字和 歌词.txt 一致
  2. 每句逐字时间不倒退，句与句不重叠
  3. 每句开唱后的一小段里，人声确实响着（不是落在静音里）
  4. 第 1、2 句的开唱时间落在人工听出来的范围里
有一项不过就以非零状态退出。
"""
import json
import sys
import wave
from pathlib import Path

import numpy as np

VOCALS_REL = Path('stems') / 'htdemucs' / '生日快乐' / 'vocals.wav'
ONSET_WINDOW_S = 0.4          # 开唱后看多长一段
VOICED_RATIO = 0.25           # 这一段的峰值电平至少是全曲「有声电平」的多少
RMS_HOP_S = 0.02
EXPECTED_T0 = {1: (17.0, 17.7), 2: (20.9, 21.6)}   # 句号 -> (最早, 最晚) 秒


def load_lyrics(path):
    return [ln.strip() for ln in path.read_text(encoding='utf-8-sig').splitlines() if ln.strip()]


def vocal_rms(path):
    """返回 (每 RMS_HOP_S 秒一个的电平数组, 全曲有声电平)。"""
    with wave.open(str(path), 'rb') as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError(f'{path.name} 不是 16 位 PCM（sampwidth={sw}）')
    x = np.frombuffer(raw, '<i2').astype(np.float32).reshape(-1, ch).mean(axis=1) / 32768.0
    hop = int(sr * RMS_HOP_S)
    frames = x[: len(x) // hop * hop].reshape(-1, hop)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    voiced = float(np.percentile(rms, 75))
    return rms, voiced


def check(root):
    fails = []
    song = json.loads((root / 'song.json').read_text(encoding='utf-8'))
    want = load_lyrics(root / '歌词.txt')
    lines = song['lines']

    if len(lines) != len(want):
        fails.append(f'句数不对：song.json 有 {len(lines)} 句，歌词.txt 有 {len(want)} 句')
    for ln, text in zip(lines, want):
        if ln['text'] != text:
            fails.append(f'line{ln["n"]} 文字不一致：song.json「{ln["text"]}」≠ 歌词.txt「{text}」')

    prev_end = -1.0
    for ln in lines:
        ts = [c['t'] for c in ln['chars']]
        if any(b < a for a, b in zip(ts, ts[1:])):
            fails.append(f'line{ln["n"]} 逐字时间倒退：{ts}')
        if ln['t0'] < prev_end - 0.01:
            fails.append(f'line{ln["n"]} 开唱 {ln["t0"]:.2f}s 早于上一句唱完 {prev_end:.2f}s')
        prev_end = ln['sung_end']

    rms, voiced = vocal_rms(root / VOCALS_REL)
    for ln in lines:
        i0 = int(ln['t0'] / RMS_HOP_S)
        seg = rms[i0: i0 + int(ONSET_WINDOW_S / RMS_HOP_S)]
        peak = float(seg.max()) if len(seg) else 0.0
        if peak < voiced * VOICED_RATIO:
            fails.append(f'line{ln["n"]}「{ln["text"]}」开唱 {ln["t0"]:.2f}s 后 {ONSET_WINDOW_S}s 内没有人声'
                         f'（峰值 {peak:.4f} < {voiced * VOICED_RATIO:.4f}）')

    by_n = {ln['n']: ln for ln in lines}
    for n, (lo, hi) in EXPECTED_T0.items():
        t0 = by_n[n]['t0'] if n in by_n else None
        if t0 is None or not lo <= t0 <= hi:
            fails.append(f'line{n} 开唱时间 {t0} 不在 {lo}–{hi}s 之间')
    return fails, len(lines)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent).resolve()
    fails, n = check(root)
    for f in fails:
        print('  ✗', f)
    if fails:
        print(f'\ncheck_song：{len(fails)} 项不过')
        sys.exit(1)
    print(f'check_song：通过 ✓（{n} 句）')


if __name__ == '__main__':
    main()
