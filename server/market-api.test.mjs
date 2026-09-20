import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("local deployment: registration, login, sharing, per-account import and ownership enforcement", async () => {
  const dir = mkdtempSync(join(tmpdir(), "jlpt-market-api-"));
  mkdirSync(join(dir, "data"));
  const proc = spawn(process.execPath, ["server/api.mjs"], {
    env: {
      ...process.env,
      JLPT_API_PORT: "18792",
      JLPT_DB_PATH: join(dir, "db.sqlite"),
      JLPT_REVIEW_DATA_PATH: join(dir, "data"),
      JLPT_FIREBASE_CONFIG: "",
      JLPT_FIREBASE_CONFIG_PATH: join(dir, "no-firebase.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("server did not start")),
        10000,
      );
      proc.stdout.on("data", () => {
        clearTimeout(timer);
        resolve();
      });
      proc.on("error", reject);
    });
    const call = async (path, { token, body, method = "GET" } = {}) => {
      const response = await fetch("http://127.0.0.1:18792" + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await call("/api/auth/config")).body.mode, "local");
    const a = (
      await call("/api/auth/register", {
        method: "POST",
        body: { username: "test-author", password: "local-test-pass" },
      })
    ).body;
    const b = (
      await call("/api/auth/register", {
        method: "POST",
        body: { username: "test-reader", password: "local-test-pass" },
      })
    ).body;
    assert.ok(a.token && b.token);
    assert.equal(
      (
        await call("/api/auth/login", {
          method: "POST",
          body: { username: "test-author", password: "wrong-pass" },
        })
      ).status,
      401,
    );
    assert.equal((await call("/api/market")).status, 401);
    const pkg = {
      format: "jlpt-share",
      version: 1,
      kind: "wordbook",
      title: "API验证",
      items: [
        { deck: "n1_vocab", original: "本", reading: "ほん", meaning_zh: "书" },
      ],
    };
    const imported = await call("/api/market/import", {
      token: a.token,
      method: "POST",
      body: pkg,
    });
    assert.equal(imported.status, 201);
    const published = await call("/api/market", {
      token: a.token,
      method: "POST",
      body: { kind: "wordbook", sourceId: imported.body.id },
    });
    assert.equal(published.status, 201);
    const id = published.body.id;
    const list = await call("/api/market", { token: b.token });
    assert.equal(list.body.shares[0].mine, false);
    const detail = await call(`/api/market/${id}`, { token: b.token });
    const copy = await call("/api/market/import", {
      token: b.token,
      method: "POST",
      body: detail.body.package,
    });
    assert.notEqual(copy.body.id, imported.body.id);
    assert.equal(
      (await call(`/api/market/${id}`, { token: b.token, method: "DELETE" }))
        .status,
      404,
    );
    assert.equal(
      (await call(`/api/market/${id}`, { token: a.token, method: "DELETE" }))
        .status,
      200,
    );
    assert.equal(
      (await call(`/api/market/${id}`, { token: b.token })).status,
      404,
    );
    assert.equal(
      (await call("/api/review-data", { token: b.token })).body.items.length,
      1,
    );
    assert.deepEqual(
      (await call("/api/study-state", { token: b.token })).body.answers,
      {},
    );
  } finally {
    proc.kill("SIGTERM");
  }
});
