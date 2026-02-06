"""No-cache local dev server on port 3000."""
import http.server

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

if __name__ == '__main__':
    server = http.server.HTTPServer(('127.0.0.1', 3000), NoCacheHandler)
    print('Dev server: http://localhost:3000 (no-cache)')
    server.serve_forever()
