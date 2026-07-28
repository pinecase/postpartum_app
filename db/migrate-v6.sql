-- v2.6 迁移：邮箱账号体系。已有数据库执行一次。
--   npm run cf:db:migrate
ALTER TABLE staff ADD COLUMN email TEXT;
ALTER TABLE staff ADD COLUMN password_hash TEXT;
ALTER TABLE staff ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);
