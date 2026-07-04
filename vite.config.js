import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works at any GitHub Pages path
  // (https://<user>.github.io/<repo>/) without knowing the repo name.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
