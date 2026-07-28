-- v2.7 迁移：妈妈日程增强（时间段/分享给妈妈）＋ 配套治疗剩余次数。已有数据库执行一次。
--   npm run cf:db:migrate
ALTER TABLE appointments ADD COLUMN end_time TEXT;
ALTER TABLE mothers ADD COLUMN share_token TEXT;
CREATE TABLE IF NOT EXISTS mother_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mother_id INTEGER NOT NULL REFERENCES mothers(id),
  name TEXT NOT NULL,
  total_sessions INTEGER NOT NULL,
  used_manual INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);
