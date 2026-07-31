from pathlib import Path


def replace_once(path, old, new):
    file = Path(path)
    text = file.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once('tests/rbn.test.js', r'20260730\.7', r'20260731\.1')
replace_once(
    'tests/recommendation-rules.test.js',
    """  for (const [staffId, iso] of firstRound) setAssignment(data, iso, 'bd', staffId);
  setAssignment(data, '2026-07-09', 'bd', 'lurz');
  const lurz = evalAt(state, '2026-07-08', 'hg', 'lurz');""",
    """  for (const [staffId, iso] of firstRound) setAssignment(data, iso, 'bd', staffId);
  setAssignment(data, '2026-07-15', 'bd', 'lurz');
  const lurz = evalAt(state, '2026-07-08', 'hg', 'lurz');"""
)
