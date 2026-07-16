-- v2.1 迁移：日报可关联房号/妈妈/宝宝。已有数据库执行一次。
--   npm run cf:db:migrate
ALTER TABLE handovers ADD COLUMN room TEXT;
ALTER TABLE handovers ADD COLUMN mother_name TEXT;
ALTER TABLE handovers ADD COLUMN baby_name TEXT;
