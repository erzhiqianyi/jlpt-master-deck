import { existsSync, mkdirSync, readFileSync, writeFileSync } from '../files.mjs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { currentPlatform } from '../platform.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const localKeyPath = join(rootDir, '.local', 'tts-secret.key');
let cachedLocalKey = null;

// Local dev has no secret manager; generate and persist a key on first use so the
// pronunciation feature works without any setup, matching the .local/firebase.json idiom.
function localDevKey() {
  if (cachedLocalKey) return cachedLocalKey;
  if (existsSync(localKeyPath)) {
    cachedLocalKey = readFileSync(localKeyPath, 'utf8').trim();
    return cachedLocalKey;
  }
  const key = randomBytes(32).toString('base64');
  mkdirSync(dirname(localKeyPath), { recursive: true });
  writeFileSync(localKeyPath, key);
  cachedLocalKey = key;
  return key;
}

export function ttsSecretKey() {
  const platform = currentPlatform();
  if (platform) {
    if (!platform.ttsSecretKey) throw new Error('发音服务尚未配置（缺少 TTS_SECRETS_KEY）');
    return platform.ttsSecretKey;
  }
  return process.env.JLPT_TTS_SECRETS_KEY || localDevKey();
}
