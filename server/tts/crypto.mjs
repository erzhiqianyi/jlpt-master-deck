import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// The master secret is an arbitrary string (env var or locally generated); hash it to a
// fixed-length AES-256 key rather than requiring an exact byte length from operators.
function deriveKey(secret) {
  return createHash('sha256').update(String(secret)).digest();
}

export function encryptSecret(plaintext, secret) {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map((buf) => buf.toString('base64')).join('.');
}

export function decryptSecret(payload, secret) {
  const [ivB64, tagB64, dataB64] = String(payload ?? '').split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Invalid encrypted payload');
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
