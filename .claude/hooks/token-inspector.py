#!/usr/bin/env python3
"""Token inspector: logs the tokens each agent used to factory/tokens.jsonl.

A Claude Code hook, registered in .claude/settings.json on two events:

  SubagentStop  one agent finished: log that agent.
  Stop          the orchestrator finished a turn: log it, and sweep the session's
                agents for anything the first pass missed.

Each line holds what one agent used since its previous line, so the lines add up and
nothing is counted twice. factory/dashboard.html reads the file.

The counts come from Claude Code's transcripts. Input and cache counts are exact. An
agent's transcript often records a reply before it has finished streaming, with only
the first few output tokens counted, so `output` is a lower bound and `partial` says
how many of the `calls` were recorded that way.

  python3 .claude/hooks/token-inspector.py --backfill [TRANSCRIPTS_DIR]
      log this project's past sessions (default: its folder in ~/.claude/projects)
  python3 .claude/hooks/token-inspector.py --summary [JOB_ID]
      print the log per agent, for one job or for all of it
"""
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

try:
    import fcntl
except ImportError:  # Windows: no lock, so two hooks at once may log an agent twice.
    fcntl = None

# Our name for each count -> its name in a transcript's `usage`.
USAGE = {
    'input': 'input_tokens',
    'output': 'output_tokens',
    'cache_write': 'cache_creation_input_tokens',
    'cache_read': 'cache_read_input_tokens',
}
COUNTS = [*USAGE, 'calls', 'partial']
# The factory's spawn prompts: `Job 003-rate-limiting.` or `Job 003-rate-limiting, round 2.`
JOB = re.compile(r'\bJob (\d{3}-[a-z0-9-]+)(?:, round (\d+))?')
ACTIVE_STAGES = ('spec', 'design', 'plan', 'build', 'review', 'approve')


def prompt_text(message):
    """The text a user message carries, without tool results."""
    content = message.get('content')
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ' '.join(part.get('text', '') for part in content if isinstance(part, dict) and part.get('type') == 'text')
    return ''


def read_transcript(path, sidechain):
    """Totals for one transcript: the main session's (sidechain False) or an agent's."""
    usage, finished, models = {}, {}, Counter()
    job = round_ = last = None
    with open(path, encoding='utf-8', errors='replace') as lines:
        for line in lines:
            try:
                entry = json.loads(line)
            except ValueError:
                continue
            message = entry.get('message')
            if bool(entry.get('isSidechain')) != sidechain or not isinstance(message, dict):
                continue
            if entry.get('type') == 'user' and sidechain:
                text = prompt_text(message)
                spawned = None if job else JOB.search(text)
                if spawned:
                    job, round_ = spawned.group(1), spawned.group(2)
            elif entry.get('type') == 'assistant' and isinstance(message.get('usage'), dict):
                if message.get('model') == '<synthetic>':
                    continue
                # One reply is written once per content block, with the same usage
                # every time, so keep one usage per message id.
                reply = message.get('id') or entry.get('uuid')
                usage[reply] = message['usage']
                finished[reply] = bool(message.get('stop_reason'))
                models[message.get('model')] += 1
                last = entry.get('timestamp') or last
    totals = {name: sum(int(u.get(field) or 0) for u in usage.values()) for name, field in USAGE.items()}
    totals['calls'] = len(usage)
    totals['partial'] = sum(1 for done in finished.values() if not done)
    return {
        'totals': totals,
        'model': models.most_common(1)[0][0] if models else None,
        'job': job,
        'round': int(round_) if round_ else None,
        'ts': last,
    }


class Log:
    """factory/tokens.jsonl, held open and locked while this run reads and appends."""

    def __init__(self, path, board):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.file = open(path, 'a+', encoding='utf-8')
        if fcntl:
            fcntl.flock(self.file, fcntl.LOCK_EX)
        self.logged = {}       # agent id -> what the log already holds for it
        self.session_job = {}  # session -> the job it last worked on
        self.added = 0
        self.active = next((j for j in reversed(board.get('jobs', [])) if j.get('stage') in ACTIVE_STAGES), None)
        self.file.seek(0)
        for line in self.file:
            try:
                self._remember(json.loads(line))
            except ValueError:
                continue

    def _remember(self, record):
        seen = self.logged.setdefault(record.get('agent_id'), dict.fromkeys(COUNTS, 0))
        for name in COUNTS:
            seen[name] += int(record.get(name) or 0)
        if record.get('job'):
            self.session_job[record.get('session')] = record['job']

    def add(self, session, agent, agent_id, read, live):
        """Append what `agent_id` used since its last line, if anything."""
        seen = self.logged.get(agent_id, {})
        new = {name: max(0, read['totals'][name] - seen.get(name, 0)) for name in COUNTS}
        if not any(new.values()):
            return
        job, round_ = read['job'], read['round']
        if not job and live and self.active:
            job, round_ = self.active.get('id'), self.active.get('round')
        if not job and agent == 'orchestrator':
            job = self.session_job.get(session)
        record = {'ts': read['ts'], 'session': session, 'agent': agent, 'agent_id': agent_id,
                  'job': job, 'round': round_, 'model': read['model'], **new}
        self.file.write(json.dumps(record) + '\n')
        self.file.flush()
        self._remember(record)
        self.added += 1


def log_agent(log, session, transcript, agent, live):
    agent_id = transcript.stem.removeprefix('agent-')
    if not agent:
        meta = transcript.with_name(transcript.stem + '.meta.json')
        agent = read_json(meta).get('agentType') or 'agent'
    log.add(session, agent, agent_id, read_transcript(transcript, sidechain=True), live)


def sweep(log, session, transcript, live):
    """Every agent of one session first, so the orchestrator can fall back on their job."""
    for agent_transcript in sorted((transcript.with_suffix('') / 'subagents').glob('agent-*.jsonl')):
        log_agent(log, session, agent_transcript, None, live)
    log.add(session, 'orchestrator', session, read_transcript(transcript, sidechain=False), live)


def summary(path, job):
    """The log per agent, as a table: exact sums for the auditor to copy."""
    agents = {}
    if path.exists():
        for line in path.read_text(encoding='utf-8').splitlines():
            try:
                record = json.loads(line)
            except ValueError:
                continue
            if job and record.get('job') != job:
                continue
            row = agents.setdefault(record.get('agent'), {'runs': set(), **dict.fromkeys(COUNTS, 0)})
            row['runs'].add(record.get('agent_id'))
            for name in COUNTS:
                row[name] += int(record.get(name) or 0)
    tokens = lambda row: sum(row[name] for name in USAGE)
    columns = ['runs', 'calls', 'partial', 'input', 'cache_write', 'cache_read', 'output', 'total']
    print(f"{'agent':<20}" + ''.join(f'{column:>14}' for column in columns))
    rows = sorted(agents.items(), key=lambda item: -tokens(item[1]))
    sums = {'runs': set().union(*(row['runs'] for _, row in rows)), **{name: sum(row[name] for _, row in rows) for name in COUNTS}}
    for agent, row in [*rows, ('TOTAL', sums)]:
        values = {**row, 'runs': len(row['runs']), 'total': tokens(row)}
        print(f'{agent:<20}' + ''.join(f'{values[column]:>14,}' for column in columns))
    print(f"\n{job or 'all jobs'}: `output` is a lower bound where `partial` is above 0; the other counts are exact.")


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def main():
    project = Path(os.environ.get('CLAUDE_PROJECT_DIR') or Path(__file__).resolve().parents[2])
    if '--summary' in sys.argv:
        given = sys.argv[sys.argv.index('--summary') + 1:]
        return summary(project / 'factory' / 'tokens.jsonl', given[0] if given else None)
    log = Log(project / 'factory' / 'tokens.jsonl', read_json(project / 'factory' / 'board.json'))

    if '--backfill' in sys.argv:
        given = sys.argv[sys.argv.index('--backfill') + 1:]
        folder = Path(given[0]).expanduser() if given else (
            Path.home() / '.claude' / 'projects' / re.sub(r'[^A-Za-z0-9]', '-', str(project.resolve())))
        for transcript in sorted(folder.glob('*.jsonl')):
            sweep(log, transcript.stem, transcript, live=False)
        print(f'{log.added} lines added to {log.file.name} from {folder}')
        return

    payload = json.load(sys.stdin)
    transcript = Path(payload['transcript_path']).expanduser()
    session = payload.get('session_id') or transcript.stem
    if payload.get('hook_event_name') == 'SubagentStop':
        agent_transcript = payload.get('agent_transcript_path') or (
            transcript.with_suffix('') / 'subagents' / f"agent-{payload.get('agent_id')}.jsonl")
        log_agent(log, session, Path(agent_transcript).expanduser(), payload.get('agent_type'), live=True)
    else:
        sweep(log, session, transcript, live=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:  # A logging failure must never stop or block an agent.
        print(f'token-inspector: {error}', file=sys.stderr)
    sys.exit(0)
