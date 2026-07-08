-- 清空全部业务数据（含演示数据、照片、员工），保留表结构。
-- 用法：npm run cf:db:clear   （清线上 D1）
-- 注意：不可恢复！执行前如需留档，先在管理后台导出 CSV。
DELETE FROM baby_feeds;
DELETE FROM baby_diapers;
DELETE FROM baby_vitals;
DELETE FROM baby_cares;
DELETE FROM mother_vitals;
DELETE FROM care_tasks;
DELETE FROM handovers;
DELETE FROM photos;
DELETE FROM babies;
DELETE FROM mothers;
DELETE FROM staff;
-- 重置自增 ID，从 1 重新开始
DELETE FROM sqlite_sequence;
