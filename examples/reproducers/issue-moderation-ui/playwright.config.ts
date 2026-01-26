import baseConfig from '../../../playwright.config.ts';
import { defineConfig } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export default defineConfig({
  ...baseConfig,
  testDir: './',
  webServer: {
    ...baseConfig.webServer,
    cwd: repoRoot,
  },
  projects: [
    {
      name: 'repro',
      testMatch: '**/*.spec.ts',
      use: baseConfig.projects?.[0]?.use,
    },
  ],
});
