/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    __GIT_COMMIT_SHA__: JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || 'dev'
    ),
  },
  server: {
    open: true,
  },
  test: {
    globals: true,
  },
});
