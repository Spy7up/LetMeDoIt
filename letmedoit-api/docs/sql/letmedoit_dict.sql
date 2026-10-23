-- ============================================================
-- 让我做 sa-app：数据字典 + 定时任务注册
--
-- 执行顺序很重要：**先跑本脚本，再启动服务**。
-- 字典读取走 sa-base 的 DictService（Redis 缓存），如果服务先起、字典项还不存在，
-- 空结果会被缓存住，之后补数据也不会生效（需要重启或清 dict_data_cache）。
--
-- 幂等性说明：
--   * t_dict：已存在同编码则跳过，不覆盖后台改过的名称/备注
--   * t_dict_data：先按这 4 本字典清空再插入，后台手改过的字典项会被重置
--   * t_smart_job：已存在同类名的任务则跳过，保留后台改过的 cron / 启停状态 / 执行记录
-- ============================================================

-- ------------------------------------------------------------
-- 1. 字典主表
-- ------------------------------------------------------------
INSERT INTO `t_dict` (`dict_name`, `dict_code`, `remark`, `disabled_flag`)
SELECT '任务状态', 'TASK_STATUS', 't_task.status：任务聚合状态（由参与人状态 + 完成条件算出后落库）', 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `t_dict` WHERE `dict_code` = 'TASK_STATUS');

INSERT INTO `t_dict` (`dict_name`, `dict_code`, `remark`, `disabled_flag`)
SELECT '参与人状态', 'TASK_PARTICIPANT_STATUS', 't_task_participant.status：一人一格的状态', 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `t_dict` WHERE `dict_code` = 'TASK_PARTICIPANT_STATUS');

INSERT INTO `t_dict` (`dict_name`, `dict_code`, `remark`, `disabled_flag`)
SELECT '完成条件', 'TASK_COMPLETION_MODE', 't_task.completion_mode：任一人完成 / 全员完成', 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `t_dict` WHERE `dict_code` = 'TASK_COMPLETION_MODE');

INSERT INTO `t_dict` (`dict_name`, `dict_code`, `remark`, `disabled_flag`)
SELECT '任务事件类型', 'TASK_EVENT_TYPE', 't_task_event.event_type：任务详情页时间线用', 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `t_dict` WHERE `dict_code` = 'TASK_EVENT_TYPE');

-- ------------------------------------------------------------
-- 2. 字典项
--    data_style 会被后台渲染成标签颜色；sort_order 越大越靠前
-- ------------------------------------------------------------
SET @task_status = (SELECT `dict_id` FROM `t_dict` WHERE `dict_code` = 'TASK_STATUS');
SET @participant_status = (SELECT `dict_id` FROM `t_dict` WHERE `dict_code` = 'TASK_PARTICIPANT_STATUS');
SET @completion_mode = (SELECT `dict_id` FROM `t_dict` WHERE `dict_code` = 'TASK_COMPLETION_MODE');
SET @event_type = (SELECT `dict_id` FROM `t_dict` WHERE `dict_code` = 'TASK_EVENT_TYPE');

DELETE FROM `t_dict_data` WHERE `dict_id` IN (@task_status, @participant_status, @completion_mode, @event_type);

INSERT INTO `t_dict_data` (`dict_id`, `data_value`, `data_label`, `data_style`, `remark`, `sort_order`, `disabled_flag`) VALUES
(@task_status, '0', '预约中',  '#6B5BD2', '带开始时间点，到点自动转「待接受」', 60, 0),
(@task_status, '1', '待接受',  '#E08A00', '已派出去，等人接受', 50, 0),
(@task_status, '2', '进行中',  '#D64C28', '至少一人已接受', 40, 0),
(@task_status, '3', '已完成',  '#17A67C', '达到完成条件', 30, 0),
(@task_status, '4', '已拒绝',  '#8C8279', '所有参与人都拒绝了', 20, 0),
(@task_status, '5', '已撤回',  '#8C8279', '委托人主动撤回', 10, 0);

INSERT INTO `t_dict_data` (`dict_id`, `data_value`, `data_label`, `data_style`, `remark`, `sort_order`, `disabled_flag`) VALUES
(@participant_status, '0', '待接受', '#E08A00', '', 50, 0),
(@participant_status, '1', '已接受', '#D64C28', '', 40, 0),
(@participant_status, '2', '已完成', '#17A67C', '', 30, 0),
(@participant_status, '3', '已拒绝', '#8C8279', '', 20, 0),
(@participant_status, '4', '已跳过', '#A69C93', '任一人完成模式下，其余人自动跳过', 10, 0);

INSERT INTO `t_dict_data` (`dict_id`, `data_value`, `data_label`, `data_style`, `remark`, `sort_order`, `disabled_flag`) VALUES
(@completion_mode, '1', '任一人完成', '#D64C28', '一人完成即整单完成', 20, 0),
(@completion_mode, '2', '全员完成',   '#378ADD', '所有人都完成才算完成', 10, 0);

INSERT INTO `t_dict_data` (`dict_id`, `data_value`, `data_label`, `data_style`, `remark`, `sort_order`, `disabled_flag`) VALUES
(@event_type, '1', '创建任务', '#D64C28', '', 90, 0),
(@event_type, '2', '邀请参与', '#E08A00', '', 80, 0),
(@event_type, '3', '接受任务', '#378ADD', '', 70, 0),
(@event_type, '4', '拒绝任务', '#8C8279', '', 60, 0),
(@event_type, '5', '完成任务', '#17A67C', '', 50, 0),
(@event_type, '6', '撤回任务', '#8C8279', '', 40, 0),
(@event_type, '7', '催办',     '#E08A00', '', 30, 0),
(@event_type, '8', '定时生效', '#6B5BD2', '预约任务到点自动生效', 20, 0),
(@event_type, '9', '自动跳过', '#A69C93', '任一人完成后其余人自动跳过', 10, 0);

-- ------------------------------------------------------------
-- 3. 定时任务注册（sa-base SmartJob）
--    cron 是 Spring 的 6 段表达式（秒 分 时 日 月 周），不要用 Quartz 的 ?
--    0 * * * * *  = 每分钟第 0 秒执行
-- ------------------------------------------------------------
INSERT INTO `t_smart_job`
  (`job_name`, `job_class`, `trigger_type`, `trigger_value`, `enabled_flag`, `param`, `sort`, `remark`, `deleted_flag`, `update_name`)
SELECT '任务到点生效与到期提醒',
       'net.lab1024.sa.app.module.task.job.TaskScheduleJob',
       'cron', '0 * * * * *', 1, NULL, 10,
       '每分钟：预约任务转待接受 + 给未完成的参与人发到期提醒', 0, '系统'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `t_smart_job`
  WHERE `job_class` = 'net.lab1024.sa.app.module.task.job.TaskScheduleJob' AND `deleted_flag` = 0
);

-- ------------------------------------------------------------
-- 4. 自检
-- ------------------------------------------------------------
-- SELECT d.dict_code, COUNT(x.dict_data_id) AS items
--   FROM t_dict d LEFT JOIN t_dict_data x ON x.dict_id = d.dict_id
--  WHERE d.dict_code IN ('TASK_STATUS','TASK_PARTICIPANT_STATUS','TASK_COMPLETION_MODE','TASK_EVENT_TYPE')
--  GROUP BY d.dict_code;
-- SELECT job_id, job_name, trigger_value, enabled_flag FROM t_smart_job WHERE job_class LIKE 'net.lab1024.sa.app%';
