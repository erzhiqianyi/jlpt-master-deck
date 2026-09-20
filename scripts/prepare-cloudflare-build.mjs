import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('dist');
if (!existsSync(resolve(output, 'index.html'))) throw new Error('Run the frontend build first');
// Only generated output is changed. Source data and the local SQLite are untouched.
rmSync(resolve(output, 'data'), { recursive: true, force: true });
copyFileSync('cloudflare/worker.mjs', resolve(output, '_worker.js'));
writeFileSync(resolve(output, '_routes.json'), JSON.stringify({ version: 1, include: ['/*'], exclude: ['/assets/*', '/images/*', '/previews/*', '/promotions/*', '/favicon.svg', '/jlpt-logo.svg'] }, null, 2));
writeFileSync(resolve(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n');
console.log('Cloudflare build ready; personal data backups excluded.');
