#!/usr/bin/env python3
"""Validate and install an existing Firebase iOS public configuration locally."""
import pathlib
import plistlib
import re
import shutil
import sys

root = pathlib.Path(__file__).resolve().parent
if len(sys.argv) != 2:
    raise SystemExit('Usage: python3 apple/configure-firebase.py /path/to/GoogleService-Info.plist')
source = pathlib.Path(sys.argv[1]).expanduser().resolve()
with source.open('rb') as file:
    config = plistlib.load(file)
if config.get('PROJECT_ID') != 'jlpt-master-deck':
    raise SystemExit('Wrong Firebase project; expected jlpt-master-deck.')
if config.get('BUNDLE_ID') != 'cc.erzhiqian.jlptmasterdeck':
    raise SystemExit('Wrong Bundle ID; expected cc.erzhiqian.jlptmasterdeck.')
for field in ['GOOGLE_APP_ID', 'API_KEY', 'CLIENT_ID', 'REVERSED_CLIENT_ID']:
    if not config.get(field):
        raise SystemExit(f'Missing {field}; enable Google authentication and download the iOS configuration again.')
scheme = config['REVERSED_CLIENT_ID']
if not re.fullmatch(r'[A-Za-z][A-Za-z0-9.+-]*', scheme):
    raise SystemExit('Invalid reversed client ID.')
destination = root / 'Config/GoogleService-Info.plist'
if source != destination:
    shutil.copy2(source, destination)
local_config = root / 'Config/Local.xcconfig'
existing = local_config.read_text() if local_config.exists() else ''
lines = [line for line in existing.splitlines() if not line.strip().startswith('GOOGLE_REVERSED_CLIENT_ID')]
lines.append(f'GOOGLE_REVERSED_CLIENT_ID = {scheme}')
local_config.write_text('\n'.join(lines) + '\n')
print('Validated configuration installed. Run ruby apple/generate-project.rb, then rebuild.')
