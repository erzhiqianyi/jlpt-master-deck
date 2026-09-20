#!/usr/bin/env python3
"""Read-only source snapshot and verified SQL rehearsal. Never uploads data."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]

def quote(name):
    return '"' + name.replace('"', '""') + '"'

def counts(db):
    return {name: db.execute('SELECT count(*) FROM ' + quote(name)).fetchone()[0]
            for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")}

def digest(path):
    with path.open('rb') as f:
        h = hashlib.sha256()
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
        return h.hexdigest()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=Path(os.environ.get('JLPT_DB_PATH', ROOT / '.local/jlpt.sqlite')))
    args = parser.parse_args()
    os.umask(0o077)
    source = args.db.resolve(strict=True)
    out = ROOT / '.local/cloudflare-preparation' / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    out.mkdir(parents=True)
    snapshot = out / 'snapshot.sqlite'
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as src, sqlite3.connect(snapshot) as db:
        src.backup(db)
        assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)], 'Snapshot integrity failed'
        assert not db.execute('PRAGMA foreign_key_check').fetchall(), 'Source has broken foreign keys'
        original = counts(db)
    # Work only on a separate migration copy. Backups retain all original data.
    migration = out / 'migration.sqlite'
    shutil.copy2(snapshot, migration)
    excluded = ['sessions', 'agent_access_tokens', 'agent_refresh_tokens', 'agent_codes', 'agent_clients']
    with sqlite3.connect(migration) as db:
        db.execute('PRAGMA foreign_keys=ON')
        for table in excluded:
            if table in original:
                db.execute('DELETE FROM ' + quote(table))
        db.commit()
        expected = counts(db)
        schema = list(db.execute("SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY rowid"))
        if any('VIRTUAL TABLE' in sql.upper() for _, _, sql in schema):
            raise RuntimeError('Virtual tables need a dedicated D1 export strategy')
        statements = ['PRAGMA defer_foreign_keys=ON;']
        statements += [sql + ';' for kind, _, sql in schema if kind == 'table']
        # iterdump quotes values correctly, including multi-line text and blobs.
        statements += [line for line in db.iterdump() if line.startswith('INSERT INTO') and not line.startswith('INSERT INTO "sqlite_sequence"')]
        statements += [sql + ';' for kind, _, sql in schema if kind != 'table']
        sql = '\n'.join(statements) + '\n'
        (out / 'd1-candidate.sql').write_text(sql)
        with sqlite3.connect(':memory:') as restored:
            restored.execute('PRAGMA foreign_keys=ON')
            restored.executescript('BEGIN;\n' + sql + '\nCOMMIT;')
            assert not restored.execute('PRAGMA foreign_key_check').fetchall()
            assert counts(restored) == expected, 'Restored table counts differ'
            # Compare every row, not only row counts.
            for table in expected:
                query = 'SELECT * FROM ' + quote(table)
                assert sorted(map(repr, db.execute(query))) == sorted(map(repr, restored.execute(query))), table
        media = []
        for table in ('listening_questions', 'listening_recordings'):
            if table not in expected:
                continue
            for row_id, path in db.execute('SELECT id,audio_path FROM ' + quote(table)):
                path = Path(path)
                entry = {'table': table, 'id': row_id, 'original_path': str(path), 'exists': path.is_file()}
                if path.is_file():
                    key = f'media/{table}/{hashlib.sha256(str(row_id).encode()).hexdigest()}{path.suffix}'
                    target = out / key
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, target)
                    entry.update(object_key=key, bytes=target.stat().st_size, sha256=digest(target))
                media.append(entry)
    report = {
        'created_at': datetime.now(timezone.utc).isoformat(), 'source': str(source),
        'source_counts': original, 'migration_counts': expected,
        'cleared_auth_tables': excluded, 'sqlite_restore_verified': True,
        'd1_import_verified': False,
        'max_statement_bytes': max(len(s.encode()) for s in statements),
        'statements_over_100000_bytes': sum(len(s.encode()) > 100000 for s in statements),
        'media': media,
        'external_assets_not_copied': ['.local/official-jlpt', '.local/mock-exams', os.environ.get('JLPT_NEWS_SOURCE_DIR', '/Users/itsuki/AI/knowledge-base/personal-knowledge/sources/jlpt-news')],
        'configuration_not_copied': ['.env', '.local/firebase.json'],
        'warnings': ['Live snapshot is preparation only; stop all writers for final cutover.', 'SQL is a candidate, not proven D1 compatible. Large single-row JSON values may need schema changes.', 'Media paths still require an R2 adapter and database mapping. No automatic two-way sync.'],
        'sha256': {p.name: digest(p) for p in [snapshot, migration, out / 'd1-candidate.sql']},
    }
    (out / 'manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'directory': str(out), 'tables': len(expected), 'sqlite_restore_verified': True, 'large_sql_statements': report['statements_over_100000_bytes'], 'missing_media': sum(not m['exists'] for m in media)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
