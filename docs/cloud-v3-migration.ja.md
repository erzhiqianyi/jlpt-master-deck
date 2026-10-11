# 本番の v3 移行（第 6 段階）手順書

これは日本語版です。中国語版 [cloud-v3-migration.md](cloud-v3-migration.md)、英語版 [cloud-v3-migration.en.md](cloud-v3-migration.en.md) と内容は同じです。

**どの手順も本番に影響するため、実行の前に別途承認が必要です。** この手順書はやり方を書いたものです。道具は手元の Miniflare で通し練習済み（`cloudflare/migration.test.mjs`）で、本番データの手元コピーでも移行と照合が通っています。

## 考え方

- データは Durable Object `primary-v1`（旧い構造）にある。新しいデータは**新しい** Durable Object `primary-v3` に書く。`primary-v1` は読むだけで書かず、切り戻し先として残す。
- Worker は環境変数で切り替える：`DATABASE_NAME`（使う DO。既定は `primary-v1`）、`MIGRATION_MODE`（`export` / `import`。移行のあいだだけ）、`MIGRATION_TOKEN`（32 文字以上の使い捨ての鍵。移行のあいだだけ置く）。
- 移行モードでは通常の API・MCP・アラームはすべて止まる（停止時間は手順 2 から 6 まで）。
- 画像と音声は R2 にあり、移行では複製しない：v3 の `media_files.storage_path` は元のパスのまま、新しくアップロードしたファイルは `v3-media/` に置く。
- アカウント・セッション・Firebase の紐付け・OAuth の許可・暗号化された読み上げの鍵はそのまま移るので、利用者はログインし直さなくてよい。`TTS_SECRETS_KEY` は変えないこと。

## 手順

1. **準備**：このブランチの全テストを手元で通す（`node --test …`、`npm run test:cloudflare`、iOS のテスト）。使い捨ての鍵を作り、手元の `JLPT_MIGRATION_TOKEN` と Worker の secret にだけ置く。
2. **書き込みを止めて書き出す**：`MIGRATION_MODE=export`、`DATABASE_NAME=primary-v1` で Worker を出す（secret `MIGRATION_TOKEN`）。それから：

   ```bash
   node scripts/v3/cloud-migration.mjs export --origin https://jlpt.erzhiqian.cc --out .local/v3-cutover/dump
   ```

   表ごとに書き出した行数が DO の件数と違えば失敗する。書き出したフォルダがそのままバックアップ（アカウントのデータを含むので、コミットもアップロードもしない）。R2 も普段どおりバックアップする。
3. **手元で移行・照合**：

   ```bash
   node scripts/v3/cloud-migration.mjs build --dump .local/v3-cutover/dump --out .local/v3-cutover/v3.sqlite
   ```

   書き出しから旧データベースを作り直して行数を確かめ、v3 に移行し（外部キーが完全であること）、`scripts/v3/verify-migration.mjs` で件数の照合と知識点 30 件の全項目の抜き取り確認をする。一つでも合わなければ止め、直してからこの手順をやり直す（本番は読み取り専用の export モードのまま）。
4. **新しい DO に書き込む**：`MIGRATION_MODE=import`、`DATABASE_NAME=primary-v3` で出す。それから：

   ```bash
   node scripts/v3/cloud-migration.mjs import --origin https://jlpt.erzhiqian.cc --db .local/v3-cutover/v3.sqlite
   ```

   空でない DO には書き込まない。やり直すときは新しい `DATABASE_NAME` を使う。
5. **本番で照合**：

   ```bash
   node scripts/v3/cloud-migration.mjs check --origin https://jlpt.erzhiqian.cc --db .local/v3-cutover/v3.sqlite
   ```

   全部の表の行数が一致し、外部キーの違反がないときだけ先へ進む（**照合が一致してから切り替える**）。
6. **切り替え**：通常モード・`DATABASE_NAME=primary-v3` で出し、Worker から `MIGRATION_MODE` と `MIGRATION_TOKEN` を消す。ウェブと iOS でログインし、題庫・練習・カード・設定・アップロードしたファイル・MCP の接続を確かめる。そのあとで新しいウェブと iOS を公開する。

## 切り戻し

手順 6 より前ならいつでも：一つ前の版（旧い構造の Worker）を `DATABASE_NAME=primary-v1` で出せばよい。旧い DO には何も書いていない。手順 6 のあとに切り戻すと切り替え後の記録が失われるので、別に検討する。

## 注意

- 今のコードは、まだ移行していない旧い DO に通常モードでアクセスすると 503 を返す（旧いデータを自動で書き換えない）。手順 6 より前に `primary-v1` へ通常モードで出さないこと。
- 自動採番（`AUTOINCREMENT`）は書き込み後、既存の最大値の続きから振られる。移行前に削除された最大の番号は再び使われることがある。
- 書き出したフォルダと `v3.sqlite` はアカウントのデータを含む。移行が終わったらバックアップの決まりに従って保管または削除する。
