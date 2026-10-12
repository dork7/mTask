#!/usr/bin/env python3
"""The dashboard's server, and the list of what the dashboard has asked for.

  python3 factory/serve.py [PORT]            serve the dashboard on http://localhost:8000
  python3 factory/serve.py pending           print the requests nobody has answered
  python3 factory/serve.py done ID RESULT    answer one request, in one line

The server shows this folder to this machine only. It takes one kind of write: a click
on the dashboard to move a ticket on or to start a backlog item, which it appends to
requests.jsonl. It never changes the board or the backlog. The orchestrator reads the
requests and does the work: see "Requests from the dashboard" in the factory skill.
"""
import json
import re
import sys
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

try:
    import fcntl
except ImportError:  # Windows: no lock, so two clicks at once may share an id.
    fcntl = None

FACTORY = Path(__file__).resolve().parent
REQUESTS = FACTORY / 'requests.jsonl'
JOB_ID = re.compile(r'\d{3}-[a-z0-9-]+')
BACKLOG_ITEM = re.compile(r'^\s*[-*+]\s+\[ \]\s+(.+)$')
MAX_BODY = 4000


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def read_lines(lines):
    found = []
    for line in lines:
        try:
            found.append(json.loads(line))
        except ValueError:
            continue
    return found


def pending(lines):
    """The requests with no answer yet, oldest first."""
    asked, answered = [], set()
    for line in lines:
        (answered.add(line.get('id')) if line.get('done') else asked.append(line))
    return [request for request in asked if request.get('id') not in answered]


def all_lines():
    return read_lines(REQUESTS.read_text(encoding='utf-8').splitlines()) if REQUESTS.exists() else []


def append(make):
    """Add the line that `make` builds from the lines already there. Returns it."""
    with open(REQUESTS, 'a+', encoding='utf-8') as log:
        if fcntl:
            fcntl.flock(log, fcntl.LOCK_EX)
        log.seek(0)
        line = make(read_lines(log))
        log.write(json.dumps(line) + '\n')
    return line


class Refused(Exception):
    pass


def check(asked):
    """The fields of a valid request, or Refused with the reason."""
    if not isinstance(asked, dict):
        raise Refused('the request is not a JSON object')
    if asked.get('action') == 'move':
        job_id = asked.get('job')
        if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
            raise Refused('no such job')
        try:
            jobs = json.loads((FACTORY / 'board.json').read_text(encoding='utf-8')).get('jobs', [])
        except (OSError, ValueError):
            jobs = []
        job = next((job for job in jobs if job.get('id') == job_id), None)
        if not job:
            raise Refused('no such job')
        if job.get('stage') == 'merged':
            raise Refused('that job has merged')
        return {'action': 'move', 'job': job_id, 'from': job.get('stage')}
    if asked.get('action') == 'start':
        try:
            backlog = (FACTORY / 'backlog.md').read_text(encoding='utf-8').splitlines()
        except OSError:
            backlog = []
        waiting = [item.group(1).strip() for item in map(BACKLOG_ITEM.match, backlog) if item]
        if asked.get('feature') not in waiting:
            raise Refused('no such item in the backlog')
        return {'action': 'start', 'feature': asked['feature']}
    raise Refused('unknown action')


class Dashboard(SimpleHTTPRequestHandler):
    def local(self):
        """Only this machine, by name: a page on another site can't borrow the address."""
        port = self.server.server_address[1]
        if self.headers.get('Host') in (f'localhost:{port}', f'127.0.0.1:{port}'):
            return True
        self.send_error(403, 'This dashboard answers only as localhost')
        return False

    def do_GET(self):
        if self.local():
            super().do_GET()

    def do_HEAD(self):
        if self.local():
            super().do_HEAD()

    def answer(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if not self.local():
            return
        # A page on another site can post a form here, but not this header or this body type.
        ours = (self.path == '/requests' and self.headers.get('X-Factory-Dashboard') == '1'
                and self.headers.get('Content-Type', '').startswith('application/json')
                and self.headers.get('Origin') in (None, f"http://{self.headers.get('Host')}"))
        if not ours:
            return self.answer(403, {'error': 'not a request from the dashboard'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if not 0 < length <= MAX_BODY:
                raise Refused('the request is empty or too long')
            wanted = check(json.loads(self.rfile.read(length)))

            def make(lines):
                same = lambda old: all(old.get(key) == wanted.get(key) for key in ('action', 'job', 'feature'))
                if any(same(old) for old in pending(lines)):
                    raise Refused('that is already requested')
                asked = sum(1 for line in lines if not line.get('done'))
                return {'id': f'R{asked + 1:03d}', 'ts': now(), **wanted}

            self.answer(201, append(make))
        except Refused as why:
            self.answer(409, {'error': str(why)})
        except ValueError:
            self.answer(400, {'error': 'the request is not JSON'})

    def log_message(self, format, *args):
        if self.command == 'POST':  # the page polls every two seconds: log only the writes
            super().log_message(format, *args)


def main():
    given = sys.argv[1:]
    if given[:1] == ['pending']:
        waiting = pending(all_lines())
        for request in waiting:
            print(json.dumps(request))
        if not waiting:
            print('no requests waiting')
        return
    if given[:1] == ['done']:
        if len(given) != 3 or not given[2].strip():
            sys.exit('usage: serve.py done ID RESULT')
        if given[1] not in {request.get('id') for request in pending(all_lines())}:
            sys.exit(f'{given[1]} is not waiting')
        append(lambda lines: {'id': given[1], 'done': True, 'ts': now(), 'result': given[2].strip()[:300]})
        print(f'{given[1]} answered')
        return
    port = int(given[0]) if given else 8000
    server = ThreadingHTTPServer(('127.0.0.1', port), partial(Dashboard, directory=str(FACTORY)))
    print(f'Software factory dashboard: http://localhost:{port}/dashboard.html  (Ctrl+C to stop)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == '__main__':
    main()
