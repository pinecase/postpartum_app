// Stryker 变异测试专用：只跑针对被变异文件的快速纯逻辑测试
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/utils.test.ts', 'tests/unit/i18n.test.ts'],
  },
});
