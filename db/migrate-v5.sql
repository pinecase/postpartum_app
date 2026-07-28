-- v2.4 迁移：宝宝喂奶间隔 + 妈妈日常安排表。已有数据库执行一次。
--   npm run cf:db:migrate
ALTER TABLE babies ADD COLUMN feed_interval_min INTEGER;
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mother_id INTEGER NOT NULL REFERENCES mothers(id),
  date TEXT NOT NULL,
  time TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT '待办',
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_appt_date ON appointments(date, status);
