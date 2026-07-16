-- v2.2 迁移：设置表（存放访问 PIN 等）。可重复执行。
--   npm run cf:db:migrate
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
