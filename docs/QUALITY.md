# 质量指标基线（2026-07，v2.3 + 测试体系初版）

| 指标 | 数值 | 说明 |
|------|------|------|
| 单元/API 测试 | **48 通过 / 0 失败**（5 个文件） | Vitest，含真实 SQLite 上的预警与 API 行为 |
| Gherkin 验收场景 | **8 通过 / 0 失败**（17 步） | Cucumber 中文场景，全业务流程 |
| 行覆盖率（核心逻辑） | alerts.js **90%** · app.js **76%** · 同步规则/字典/工具函数已测 | 阈值门禁：alerts≥85、app≥70 |
| 变异测试分（csv.ts） | **73.7 总分 / 100 覆盖分**（14 杀 0 逃逸） | Stryker，逃逸=0 说明断言质量高 |
| 类型检查 | tsc --strict 0 错误 | 每次构建强制 |
| CI 门禁 | 测试全绿才允许部署 | GitHub Actions |

## 指标口径

- **覆盖率**只统计核心逻辑文件（见 vitest.config.ts 的 coverage.include），
  不掺入未测 UI 文件来虚增/摊薄数字
- **变异分（covered）100%** 表示所有被测试覆盖到的代码，其任何一处逻辑被篡改
  都会被测试抓住；no-coverage 的 5 个变异位于 DOM 下载函数（node 环境无法测）
- UI 层由发布前手动冒烟清单（docs/QA.md）+ 历史 Playwright 端到端脚本保障

## 后续提升方向（按优先级）

1. Worker（Hono/D1）路径直测：用 wrangler 的 unstable_dev 或 miniflare 复用 API 测试
2. Playwright UI 测试纳入 CI（现为本地脚本）
3. 变异测试扩展到 alerts.js 与同步规则
4. 前端组件测试（@testing-library/react）覆盖任务表单动态字段
