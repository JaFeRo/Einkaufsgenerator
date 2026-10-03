import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base, damit der Build auch unter https://<user>.github.io/<repo>/ läuft.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
