import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { localConfig } from './local-config.mjs';

const { webPort, apiPort, host } = localConfig();

// Fail before spawning anything; never stop a process we do not own.
async function available(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} on ${host} is busy. Stop your previous JLPT session or set JLPT_WEB_PORT / JLPT_API_PORT.`)));
    server.listen(port, host, () => server.close(resolve));
  });
}
await available(apiPort);
await available(webPort);

const env = { ...process.env, JLPT_WEB_PORT: String(webPort), JLPT_API_PORT: String(apiPort), JLPT_HOST: host };
const children = [
  spawn(process.execPath, ['server/api.mjs'], { stdio: 'inherit', env }),
  spawn('npx', ['vite', '--host', host, '--port', String(webPort), '--strictPort'], { stdio: 'inherit', env }),
];
console.log(`JLPT: http://localhost:${webPort} (API: ${host}:${apiPort})`);

function shutdown(signal) {
  for (const child of children) {
    child.kill(signal);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) {
      shutdown('SIGTERM');
      process.exit(code);
    }
  });
}
