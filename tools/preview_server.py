"""本地 MV 预览服务，支持 WAV 的 HTTP Range 跳转；不渲染视频。"""
import argparse
import functools
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import BinaryIO

COPY_CHUNK_SIZE = 256 * 1024


def parse_byte_range(header: str, size: int) -> tuple[int, int] | None:
    """解析单段范围；先限幅，再转整数，避免超长请求数字触发 int 限制。"""
    match = re.fullmatch(r'bytes=([0-9]*)-([0-9]*)', header.strip())
    if not match or not any(match.groups()) or size <= 0:
        return None

    def bounded_number(raw: str) -> int:
        significant = raw.lstrip('0') or '0'
        if len(significant) > len(str(size)):
            return size + 1
        return min(int(significant), size + 1)

    left, right = match.groups()
    if not left and bounded_number(right) == 0:
        return None
    start = bounded_number(left) if left else max(0, size - bounded_number(right))
    end = min(bounded_number(right), size - 1) if left and right else size - 1
    return (start, end) if 0 <= start <= end < size else None


class PreviewHandler(SimpleHTTPRequestHandler):
    """静态文件沿用标准库处理，单段字节请求用于浏览器音频寻址。"""

    _byte_range: tuple[int, int] | None = None

    def end_headers(self) -> None:
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self) -> BinaryIO | None:
        self._byte_range = None
        path = Path(self.translate_path(self.path))
        header = self.headers.get('Range')
        if not header or self.headers.get('If-Range') or not path.is_file():
            return super().send_head()
        try:
            source = path.open('rb')
        except OSError:
            self.send_error(404, 'File not found')
            return None
        try:
            size = os.fstat(source.fileno()).st_size
            byte_range = parse_byte_range(header, size)
            if byte_range is not None:
                start, end = byte_range
                self._byte_range = byte_range
                self.send_response(206)
                self.send_header('Content-Type', self.guess_type(str(path)))
                self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
                self.send_header('Content-Length', str(end - start + 1))
                self.end_headers()
                # 标准库 do_GET/do_HEAD 接管文件句柄，并在完成或断连后关闭。
                return source
        except (BrokenPipeError, ConnectionResetError):
            source.close()
            self.close_connection = True
            return None
        except OSError:
            source.close()
            raise
        source.close()
        try:
            self.send_response(416)
            self.send_header('Content-Range', f'bytes */{size}')
            self.send_header('Content-Length', '0')
            self.end_headers()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        return None

    def copyfile(self, source: BinaryIO, outputfile: BinaryIO) -> None:
        try:
            if self._byte_range is None:
                return super().copyfile(source, outputfile)
            start, end = self._byte_range
            source.seek(start)
            remaining = end - start + 1
            while remaining:
                data = source.read(min(remaining, COPY_CHUNK_SIZE))
                if not data:
                    break
                outputfile.write(data)
                remaining -= len(data)
        except (BrokenPipeError, ConnectionResetError):
            # 浏览器拖动进度条会取消旧的 WAV 请求，是正常连接生命周期。
            self.close_connection = True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    handler = functools.partial(PreviewHandler, directory=str(root))
    with ThreadingHTTPServer(('127.0.0.1', args.port), handler) as server:
        print(f'生日 MV 预览：http://localhost:{args.port}/?scale=0.75', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
