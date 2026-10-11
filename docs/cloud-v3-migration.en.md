# Production migration to v3 (phase 6) runbook

This is the English version; the Chinese [cloud-v3-migration.md](cloud-v3-migration.md) and Japanese [cloud-v3-migration.ja.md](cloud-v3-migration.ja.md) have the same content.

**Every step affects production and needs separate authorization before it runs.** This runbook only describes the procedure. The tools were rehearsed locally with Miniflare (`cloudflare/migration.test.mjs`), and the migration and reconciliation were run on a local copy of the production data.

## Approach

- The data is in the Durable Object `primary-v1` (old structure). New data goes into a **new** Durable Object `primary-v3`; `primary-v1` is only read, never written, and stays as the rollback target.
- The Worker is configured with environment variables: `DATABASE_NAME` (which DO to use, default `primary-v1`), `MIGRATION_MODE` (`export` / `import`, set only during the migration) and `MIGRATION_TOKEN` (a one-time secret of 32+ characters, present only during the migration).
- In migration mode the normal API, MCP and alarms are all stopped (downtime runs from step 2 to step 6).
- Images and audio stay in R2 and are not copied: v3 `media_files.storage_path` keeps the original paths, and new uploads go to `v3-media/`.
- Accounts, sessions, Firebase links, OAuth grants and encrypted speech keys move over unchanged, so nobody has to sign in again; `TTS_SECRETS_KEY` must not change.

## Steps

1. **Prepare**: run every test on the branch locally (`node --test …`, `npm run test:cloudflare`, the iOS tests). Generate a one-time secret and keep it only in the local `JLPT_MIGRATION_TOKEN` and the Worker secret.
2. **Stop writes and export**: deploy the Worker with `MIGRATION_MODE=export` and `DATABASE_NAME=primary-v1` (secret `MIGRATION_TOKEN`). Then:

   ```bash
   node scripts/v3/cloud-migration.mjs export --origin https://jlpt.erzhiqian.cc --out .local/v3-cutover/dump
   ```

   It fails if any table's exported rows differ from the count in the DO. The export directory is the backup; keep it safe (it holds account data; never commit or upload it). Back up R2 as usual as well.
3. **Migrate and reconcile locally**:

   ```bash
   node scripts/v3/cloud-migration.mjs build --dump .local/v3-cutover/dump --out .local/v3-cutover/v3.sqlite
   ```

   It rebuilds the old database from the export and checks the row counts, migrates to v3 (foreign keys must be intact), then runs `scripts/v3/verify-migration.mjs` for the count reconciliation and a full-field check of 30 knowledge points. Stop at any mismatch, fix it and repeat this step (production stays in the read-only export mode).
4. **Write the new DO**: deploy with `MIGRATION_MODE=import` and `DATABASE_NAME=primary-v3`. Then:

   ```bash
   node scripts/v3/cloud-migration.mjs import --origin https://jlpt.erzhiqian.cc --db .local/v3-cutover/v3.sqlite
   ```

   It refuses to write into a DO that is not empty; to retry, use a fresh `DATABASE_NAME`.
5. **Reconcile in production**:

   ```bash
   node scripts/v3/cloud-migration.mjs check --origin https://jlpt.erzhiqian.cc --db .local/v3-cutover/v3.sqlite
   ```

   Continue only when every table's row count matches and there are no foreign key violations (**switch only when the reconciliation matches**).
6. **Switch**: deploy in normal mode with `DATABASE_NAME=primary-v3` and remove `MIGRATION_MODE` and `MIGRATION_TOKEN` from the Worker. Sign in on the web and iOS and check the library, practice, cards, settings, uploaded files and the MCP connection. Then release the new web app and iOS app.

## Rollback

At any time before step 6: deploy the previous release (the old-structure Worker) with `DATABASE_NAME=primary-v1`; the old DO was never written. Rolling back after step 6 loses the records made after the switch and needs a separate assessment.

## Notes

- The current code returns 503 in normal mode for an old DO that has not been migrated (it never rewrites old data automatically), so do not deploy normal mode against `primary-v1` before step 6.
- `AUTOINCREMENT` numbers continue from the largest existing value after the import; the largest numbers deleted before the migration may be reused.
- The export directory and `v3.sqlite` hold account data; keep or delete them according to the backup policy once the migration is done.
