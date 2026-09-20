import { defineConfig } from 'vite';

// Builds the MCP App view (src/mcp-app/practice.ts) into one IIFE + one CSS file that
// server/mcp-ui.mjs inlines into the `ui://jlpt/practice.html` resource.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-mcp-app',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/mcp-app/practice.ts',
      name: 'JlptPractice',
      formats: ['iife'],
      fileName: () => 'practice.js',
      cssFileName: 'practice',
    },
    target: 'es2020',
    minify: true,
  },
});
