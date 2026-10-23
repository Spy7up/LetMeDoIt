-- ============================================================
-- 「让我做」任务编辑次数
-- 项目：smart-admin（MySQL 8.x）
--
-- 规则：
--   预约中 / 待接受：委托人不限次数编辑
--   进行中（已有参与者接了）：只允许再改一次，改完锁定
-- 实现：用 edit_count 计数，进行中且 edit_count > 0 时 canEdit = false
-- ============================================================

ALTER TABLE `t_task`
  ADD COLUMN `edit_count` INT NOT NULL DEFAULT 0
  COMMENT '编辑次数（进行中只允许改一次）' AFTER `remind_time`;
