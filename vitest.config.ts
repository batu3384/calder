import { defineConfig } from 'vitest/config';

const fullCoverageProfile = process.env.CALDER_COVERAGE_PROFILE === 'full';
const coverageExclude = [
  'src/main/main.ts',
  'src/main/ipc-handlers.ts',
  'src/main/mcp-ipc-handlers.ts',
  'src/main/menu.ts',
  'src/main/mcp-client.ts',
  'src/renderer/index.ts',
  'src/renderer/keybindings.ts',
  'src/renderer/notification-sound.ts',
  'src/renderer/git-status.ts',
  ...(fullCoverageProfile ? [] : ['src/renderer/components/**', 'src/preload/**']),
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 45,
        branches: 45,
        functions: 50,
        lines: 45,
      },
      include: ['src/main/**/*.ts', 'src/renderer/**/*.ts', 'src/preload/**/*.ts'],
      exclude: coverageExclude,
    },
  },
});
