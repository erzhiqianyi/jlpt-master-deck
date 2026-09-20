import { existsSync } from 'node:fs';

// Single source of truth for local ports. Block 4220–4229 is reserved for JLPT
// (x0 = web, x1 = API); the registry lives in ~/.cloudflared/config.yml.
// .env values are read once here; variables already in the shell win.
export function localConfig() {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const port = (name, fallback) => {
    const value = Number(process.env[name] || fallback);
    if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error(`${name} must be an integer between 1024 and 65535`);
    return value;
  };
  const webPort = port('JLPT_WEB_PORT', 4220);
  const apiPort = port('JLPT_API_PORT', 4221);
  if (webPort === apiPort) throw new Error('JLPT_WEB_PORT and JLPT_API_PORT must differ');
  // Loopback only; set JLPT_HOST=0.0.0.0 explicitly when a LAN device needs to reach the app.
  const host = process.env.JLPT_HOST || '127.0.0.1';
  return { webPort, apiPort, host };
}
