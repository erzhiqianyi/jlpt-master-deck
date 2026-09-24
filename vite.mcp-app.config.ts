import { defineConfig } from 'vite';

// Builds the MCP App view (src/mcp-app/practice.ts) into one IIFE + one CSS file that
// server/mcp-ui.mjs inlines into the `ui://jlpt/practice.html` resource.
export default defineConfig(({ mode }) => {
const cards = mode === 'review-cards';
const name = cards ? 'review-cards' : 'practice';
return {
  publicDir: false,
  build: {
    outDir: 'dist-mcp-app',
    emptyOutDir: !cards,
    cssCodeSplit: false,
    lib: {
      entry: `src/mcp-app/${name}.ts`,
      name: cards ? 'JlptReviewCards' : 'JlptPractice',
      formats: ['iife'],
      fileName: () => `${name}.js`,
      cssFileName: name,
    },
    target: 'es2020',
    minify: true,
  },
};
});
