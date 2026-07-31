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
    "setAssignment(data, '2026-07-09', 'bd', 'lurz');",
    "setAssignment(data, '2026-07-15', 'bd', 'lurz');"
)
