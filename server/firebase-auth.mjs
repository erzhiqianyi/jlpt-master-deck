import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDb } from "./storage.mjs";

const path =
  process.env.JLPT_FIREBASE_CONFIG_PATH ||
  fileURLToPath(new URL("../.local/firebase.json", import.meta.url));
const config = process.env.JLPT_FIREBASE_CONFIG
  ? JSON.parse(process.env.JLPT_FIREBASE_CONFIG)
  : existsSync(path)
    ? JSON.parse(readFileSync(path, "utf8"))
    : null;
if (
  config &&
  !["apiKey", "authDomain", "projectId", "appId"].every(
    (key) => typeof config[key] === "string" && config[key].trim(),
  )
)
  throw new Error("Firebase configuration is incomplete");
const app = config
  ? initializeApp({ projectId: config.projectId }, "jlpt-auth")
  : null;
export function authConfiguration() {
  return {
    mode: config ? "firebase" : "local",
    market: config?.market === "firestore" ? "firestore" : "local",
    firebase: config
      ? Object.fromEntries(
          [
            "apiKey",
            "authDomain",
            "projectId",
            "appId",
            "storageBucket",
            "messagingSenderId",
          ]
            .filter((key) => config[key])
            .map((key) => [key, config[key]]),
        )
      : null,
  };
}
export async function firebaseSession(idToken, existingUser = null) {
  if (!app) throw new Error("Firebase 登录尚未配置");
  const claims = await getAuth(app).verifyIdToken(String(idToken || ""));
  const db = getDb();
  db.exec(
    `CREATE TABLE IF NOT EXISTS firebase_identities (project_id TEXT NOT NULL, uid TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(project_id, uid));`,
  );
  let identity = db
    .prepare(
      "SELECT user_id FROM firebase_identities WHERE project_id = ? AND uid = ?",
    )
    .get(config.projectId, claims.uid);
  if (existingUser && identity && identity.user_id !== existingUser.id)
    throw new Error("此 Google 账号已绑定其他本地账号");
  if (!identity) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const now = new Date().toISOString();
      const inserted = existingUser
        ? { lastInsertRowid: existingUser.id }
        : db
            .prepare(
              "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
            )
            .run(
              `${String(claims.name || "Google 用户").slice(0, 40)} · ${randomBytes(4).toString("hex")}`,
              "",
              "",
              now,
            );
      identity = { user_id: Number(inserted.lastInsertRowid) };
      db.prepare("INSERT INTO firebase_identities VALUES (?, ?, ?)").run(
        config.projectId,
        claims.uid,
        identity.user_id,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  const token = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO sessions (token,user_id,created_at,last_seen_at) VALUES (?,?,?,?)",
  ).run(token, identity.user_id, now, now);
  const user = db
    .prepare("SELECT id, username FROM users WHERE id = ?")
    .get(identity.user_id);
  return { token, user };
}
export function firebaseIdentity(userId) {
  if (
    !config ||
    !getDb()
      .prepare(
        "SELECT name FROM sqlite_master WHERE name='firebase_identities'",
      )
      .get()
  )
    return { uid: null };
  return {
    uid:
      getDb()
        .prepare(
          "SELECT uid FROM firebase_identities WHERE project_id = ? AND user_id = ? LIMIT 1",
        )
        .get(config.projectId, userId)?.uid ?? null,
  };
}
