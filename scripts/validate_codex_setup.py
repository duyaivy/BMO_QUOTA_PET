#!/usr/bin/env python3
"""Validate BMO Codex kit structure and TOML (Python 3.11+)."""
from pathlib import Path
import tomllib
root = Path(__file__).resolve().parents[1]
expected = [
    'AGENTS.md', 'docs/PROJECT_SCOPE.md', '.codex/config.toml',
    '.codex/agents/researcher.toml', '.codex/agents/coder.toml',
    '.codex/agents/reviewer.toml', 'prompts/01-research.md',
    'prompts/02-build-phase.md', 'prompts/03-review.md',
]
for path in expected:
    assert (root / path).is_file(), f'Missing {path}'
for path in sorted((root / '.codex').rglob('*.toml')):
    obj = tomllib.loads(path.read_text())
    if 'agents' in path.parts:
        for req in ['name', 'description', 'developer_instructions', 'model']:
            assert obj.get(req), f'{path}: missing {req}'
    print('Valid TOML:', path.relative_to(root))
config = tomllib.loads((root / '.codex/config.toml').read_text())
assert config['agents']['max_concurrent_threads_per_session'] == 3
print('PASS: expected files, TOML syntax, concurrency limit')
