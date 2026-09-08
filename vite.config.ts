import tailwindcss from '@tailwindcss/postcss';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    allowedHosts: ['jlpt-local.erzhiqian.cc'],
    proxy: {
      '/api': `http://localhost:${process.env.JLPT_API_PORT ?? 8791}`,
    },
  },
  plugins: [react()],
});
