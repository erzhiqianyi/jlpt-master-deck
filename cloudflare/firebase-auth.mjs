import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomBytes } from 'node:crypto';
import { getDb } from '../server/storage.mjs';
import { currentPlatform, transaction } from '../server/platform.mjs';

const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const config = () => currentPlatform().firebase;
export function authConfiguration() {
  const value = config();
  return { mode: 'firebase', market: value.market === 'firestore' ? 'firestore' : 'local', firebase: Object.fromEntries(['apiKey','authDomain','projectId','appId','storageBucket','messagingSenderId'].filter(k => value[k]).map(k => [k,value[k]])) };
}
export async function firebaseSession(idToken, existingUser = null) {
  const { projectId } = config();
  const payload = await verifyFirebaseIdentity(idToken, projectId);
  const db = getDb();
  return transaction(db, () => {
    let identity = db.prepare('SELECT user_id FROM firebase_identities WHERE project_id=? AND uid=?').get(projectId, payload.sub);
    if (existingUser && identity && identity.user_id !== existingUser.id) throw new Error('此 Google 账号已绑定其他账号');
    if (!identity) {
      const inserted = existingUser ? { lastInsertRowid: existingUser.id } : db.prepare('INSERT INTO users(username,password_hash,salt,created_at) VALUES(?,?,?,?)').run(`${String(payload.name || 'Google 用户').slice(0,40)} · ${randomBytes(4).toString('hex')}`, '', '', new Date().toISOString());
      identity = { user_id: Number(inserted.lastInsertRowid) };
      db.prepare('INSERT INTO firebase_identities(project_id,uid,user_id) VALUES(?,?,?)').run(projectId, payload.sub, identity.user_id);
    }
    const token = randomBytes(32).toString('base64url'), now = new Date().toISOString();
    db.prepare('INSERT INTO sessions(token,user_id,created_at,last_seen_at) VALUES(?,?,?,?)').run(token,identity.user_id,now,now);
    return { token, user: db.prepare('SELECT id,username FROM users WHERE id=?').get(identity.user_id) };
  });
}
export function firebaseIdentity(userId) {
  return { uid: getDb().prepare('SELECT uid FROM firebase_identities WHERE project_id=? AND user_id=?').get(config().projectId,userId)?.uid ?? null };
}

export async function verifyFirebaseIdentity(idToken, projectId, keyResolver = keys) {
  const { payload } = await jwtVerify(String(idToken || ''), keyResolver, { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'], requiredClaims: ['sub', 'exp', 'iat', 'auth_time'] });
  if (!payload.sub || payload.sub.length > 128 || !Number.isFinite(payload.auth_time) || payload.auth_time > Date.now()/1000 || !Number.isFinite(payload.iat) || payload.iat > Date.now()/1000) throw new Error('Invalid Firebase identity');
  return payload;
}
