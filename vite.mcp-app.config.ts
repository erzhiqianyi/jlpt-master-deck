import { defineConfig } from 'vite';

// Builds the MCP App view (src/mcp-app/practice.ts) into one IIFE + one CSS file that
// server/mcp-ui.mjs inlines into the `ui://jlpt/practice.html` resource.
export default defineConfig(({ mode }) => {
const name = mode === 'review-cards' ? 'review-cards' : mode === 'ai-learning-home' ? 'ai-learning-home' : 'practice';
return {
  publicDir: false,
  build: {
    outDir: 'dist-mcp-app',
    emptyOutDir: name === 'practice',
    cssCodeSplit: false,
    lib: {
      entry: `src/mcp-app/${name}.ts`,
      name: name === 'review-cards' ? 'JlptReviewCards' : name === 'ai-learning-home' ? 'JlptAiLearningHome' : 'JlptPractice',
      formats: ['iife'],
      fileName: () => `${name}.js`,
      cssFileName: name,
    },
    target: 'es2020',
    minify: true,
  },
};
});
