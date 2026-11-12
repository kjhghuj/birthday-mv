"""确认本地预览服务支持浏览器音频跳转，不依赖音视频编码器。"""
import functools
import http.client
import importlib.util
import io
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / 'tools' / 'preview_server.py'
SPEC = importlib.util.spec_from_file_location('preview_server', MODULE)
SERVER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SERVER)


class PreviewServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory()
        Path(cls.directory.name, 'audio.wav').write_bytes(b'0123456789')
        handler = functools.partial(SERVER.PreviewHandler, directory=cls.directory.name)
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.directory.cleanup()

    def request(self, byte_range=None, method='GET', path='/audio.wav', extra_headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        try:
            headers = {'Range': byte_range} if byte_range else {}
            headers.update(extra_headers or {})
            connection.request(method, path, headers=headers)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_full_file(self):
        status, headers, body = self.request()
        self.assertEqual((status, body), (200, b'0123456789'))
        self.assertEqual(headers['Accept-Ranges'], 'bytes')

    def test_audio_seek_ranges(self):
        for header, want, content_range in [
            ('bytes=2-5', b'2345', 'bytes 2-5/10'),
            ('bytes=7-', b'789', 'bytes 7-9/10'),
            ('bytes=-3', b'789', 'bytes 7-9/10'),
            ('bytes=8-99', b'89', 'bytes 8-9/10'),
        ]:
            with self.subTest(header=header):
                status, headers, body = self.request(header)
                self.assertEqual((status, body), (206, want))
                self.assertEqual(headers['Content-Range'], content_range)
                self.assertEqual(int(headers['Content-Length']), len(want))

    def test_invalid_range(self):
        for header in ['bytes=99-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=0-1,3-4']:
            with self.subTest(header=header):
                status, headers, body = self.request(header)
                self.assertEqual((status, body), (416, b''))
                self.assertEqual(headers['Content-Range'], 'bytes */10')

    def test_head_has_no_body(self):
        status, headers, body = self.request('bytes=2-5', 'HEAD')
        self.assertEqual((status, body), (206, b''))
        self.assertEqual(headers['Content-Length'], '4')

    def test_large_range_numbers(self):
        for header, status, want in [
            ('bytes=' + '9' * 5000 + '-', 416, b''),
            ('bytes=8-' + '9' * 5000, 206, b'89'),
            ('bytes=-' + '9' * 5000, 206, b'0123456789'),
            ('bytes=' + '0' * 5000 + '2-5', 206, b'2345'),
        ]:
            with self.subTest(header=header[:30]):
                got_status, _, body = self.request(header)
                self.assertEqual((got_status, body), (status, want))

    def test_empty_file_range(self):
        Path(self.directory.name, 'empty.wav').touch()
        status, headers, body = self.request('bytes=0-', path='/empty.wav')
        self.assertEqual((status, body), (416, b''))
        self.assertEqual(headers['Content-Range'], 'bytes */0')

    def test_missing_file_still_returns_404(self):
        status, _, _ = self.request('bytes=0-', path='/missing.wav')
        self.assertEqual(status, 404)

    def test_if_range_uses_complete_response(self):
        status, _, body = self.request('bytes=2-5', extra_headers={'If-Range': 'old-version'})
        self.assertEqual((status, body), (200, b'0123456789'))

    def test_cancelled_download_does_not_raise(self):
        class CancelledOutput:
            def __init__(self, error):
                self.error = error

            def write(self, data):
                raise self.error

        for byte_range in (None, (2, 5)):
            for error in (BrokenPipeError(), ConnectionResetError()):
                with self.subTest(byte_range=byte_range, error=type(error).__name__):
                    handler = SERVER.PreviewHandler.__new__(SERVER.PreviewHandler)
                    handler._byte_range = byte_range
                    handler.close_connection = False
                    with io.BytesIO(b'0123456789') as source:
                        handler.copyfile(source, CancelledOutput(error))
                    self.assertTrue(handler.close_connection)


if __name__ == '__main__':
    unittest.main()
