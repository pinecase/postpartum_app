import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/api/**/*.test.ts'],
    pool: 'forks', // 每个测试文件独立进程，便于按文件隔离 DB_PATH
    coverage: {
      provider: 'v8',
      // 覆盖率只统计被测试的核心逻辑文件，保持指标诚实可读
      include: [
        'client/src/csv.ts',
        'client/src/api.ts',
        'client/src/i18n/translations.ts',
        'client/src/pages/Tasks.tsx',
        'server/src/app.js',
        'server/src/alerts.js',
      ],
      thresholds: {
        // downloadCsv 的 DOM 触发部分不在 node 测试范围内（由变异测试覆盖纯逻辑）
        'client/src/csv.ts': { lines: 30, functions: 70 },
        'server/src/alerts.js': { lines: 85 },
        'server/src/app.js': { lines: 70 },
      },
      reporter: ['text', 'json-summary'],
    },
  },
});
