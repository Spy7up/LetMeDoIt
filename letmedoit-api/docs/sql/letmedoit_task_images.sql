-- ============================================================
-- 「让我做」任务附图
-- 项目：smart-admin（MySQL 8.x）
--
-- 做什么：布置任务时最多传 6 张图作为「交代」的补充（买哪款、摆成什么样）。
--
-- 为什么是一列 JSON 而不是独立表：
--   和 t_task_participant.complete_images 保持同一种存法。一条任务的图
--   从来不会单独查询、也不会分页，独立表只会多一次 join。
--
-- 长度：单条 URL 上限 500 字符，6 张 + JSON 括号与逗号 ≈ 3KB，
--       给到 1000 对当前对象存储域名够用；换更长的域名时再扩。
--
-- 幂等：先查 information_schema，已存在就跳过，重复执行不会报错。
-- ============================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 't_task'
    AND COLUMN_NAME = 'images'
);

SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `t_task` ADD COLUMN `images` VARCHAR(1000) DEFAULT NULL COMMENT ''附图，JSON 数组字符串，最多 6 张公网 URL'' AFTER `description`',
  'SELECT ''t_task.images 已存在，跳过'' AS msg'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
