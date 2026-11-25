"""Tiny static server with HTTP Range support (needed for PMTiles). Usage: python serve.py [port]"""
import http.server, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes"); self.send_header("Cache-Control", "no-cache"); super().end_headers()
    def do_GET(self):
        rng = self.headers.get("Range"); path = self.translate_path(self.path)
        if not rng or not os.path.isfile(path): return super().do_GET()
        m = re.match(r"bytes=(\d*)-(\d*)", rng); size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else size - int(m.group(2))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        self.send_response(206); self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}"); self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        with open(path, "rb") as f: f.seek(start); self.wfile.write(f.read(end - start + 1))

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving {ROOT} on http://localhost:{port}")
    http.server.ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
