-- v2.0 迁移：已有数据库执行一次即可（新库直接跑 schema.sql 无需此文件）
--   npm run cf:db:migrate
ALTER TABLE baby_vitals ADD COLUMN spo2 INTEGER;
ALTER TABLE care_tasks ADD COLUMN internal_note TEXT;
