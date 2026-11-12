"""修复计划 ①：分窗口重新对齐。整首一起对齐时，个别句子会被拉长或挤到一起；
这里把每一句（或指定的几句）单独切一小段人声重对一遍，模型只加载一次。

  python -I tools/realign_windows.py <项目> <窗口.json> <输出.json>

窗口.json： [{"id": "L28", "start": 146.9, "end": 151.2, "text": "健康平安 快乐无边"}, …]
输出.json： {"L28": [{"c": "健", "start": 147.12, "end": 147.36}, …], …}（一个字一条，空格不算）
对齐方法和 skill 的 scripts/align.py 完全一样（Qwen3-ForcedAligner），只是不重复加载模型。
"""
import json
import shutil
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np

MODEL_ID = 'Qwen/Qwen3-ForcedAligner-0.6B-hf'
VOCALS_REL = Path('stems') / 'htdemucs' / '生日快乐' / 'vocals.wav'
SAMPLE_RATE = 16000
LANG = 'Chinese'


def is_aligned_char(ch):
    return ch == "'" or unicodedata.category(ch)[0] in ('L', 'N')


def read_audio(path, start, end):
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise RuntimeError('找不到 ffmpeg')
    cmd = [ffmpeg, '-v', 'error', '-ss', f'{start:.3f}', '-i', str(path), '-t', f'{end - start:.3f}',
           '-f', 'f32le', '-ar', str(SAMPLE_RATE), '-ac', '1', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<f4').copy()


def align_one(proc, model, wav, text, start):
    """返回 [{'c','start','end'}]，一个字一条；模型把几个字并成一个词时平均分。"""
    import torch
    inputs, words = proc.prepare_forced_aligner_inputs(audio=wav, transcript=text, language=LANG)
    inputs = inputs.to('cpu', torch.float32)
    with torch.inference_mode():
        out = model(**inputs)
    items = proc.decode_forced_alignment(logits=out.logits, input_ids=inputs['input_ids'], word_lists=words,
                                         timestamp_token_id=model.config.timestamp_token_id)[0]
    chars = [c for c in text if is_aligned_char(c)]
    res = []
    for it in items:
        piece = [c for c in str(it.get('text', '')) if is_aligned_char(c)]
        t0, t1 = start + float(it['start_time']), start + float(it['end_time'])
        span = (t1 - t0) / max(1, len(piece))
        res += [{'c': c, 'start': round(t0 + k * span, 3), 'end': round(t0 + (k + 1) * span, 3)} for k, c in enumerate(piece)]
    if [r['c'] for r in res] != chars:
        raise RuntimeError(f'对齐出来的字和歌词对不上：「{text}」→ {"".join(r["c"] for r in res)}')
    return res


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    root, spec_path, out_path = Path(sys.argv[1]).resolve(), Path(sys.argv[2]), Path(sys.argv[3])
    windows = json.loads(spec_path.read_text(encoding='utf-8'))
    import torch
    from transformers import AutoModelForTokenClassification, AutoProcessor
    proc = AutoProcessor.from_pretrained(MODEL_ID)
    model = AutoModelForTokenClassification.from_pretrained(MODEL_ID, dtype=torch.float32).to('cpu').eval()
    result = {}
    for w in windows:
        wav = read_audio(root / VOCALS_REL, w['start'], w['end'])
        result[w['id']] = align_one(proc, model, wav, w['text'], w['start'])
        print(w['id'], ' '.join(f"{r['c']}{r['start']:.2f}" for r in result[w['id']]), flush=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(result)} 个窗口 → {out_path}')


if __name__ == '__main__':
    main()
