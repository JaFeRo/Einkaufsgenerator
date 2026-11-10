import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Stand des Builds, z. B. „56819b2 · 10.11.2026 12:48 UTC“ – hilft, Absturzmeldungen einer Version zuzuordnen. */
function buildVersion(): string {
  // Der Pages-Workflow baut main und den Testbranch in eigenen Checkouts, daher den Commit des Checkouts nehmen
  let sha: string;
  try {
    sha = execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    sha = process.env.GITHUB_SHA ?? 'lokal';
  }
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${sha.slice(0, 7)} · ${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

// Relative base, damit der Build auch unter https://<user>.github.io/<repo>/ läuft.
export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(buildVersion()) },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
