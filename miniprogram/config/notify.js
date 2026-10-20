/**
 * 订阅消息模板配置
 *
 * 关键：「服务通知」卡片左侧的标签由模板关键词决定，不是代码里随便写的。
 * 所以这里把「标签」也定义下来，让三处保持一致：
 *   公众平台模板关键词  ←→  本文件 fields  ←→  服务通知卡片左侧文案
 *
 * 字段类型说明（微信侧约束）：
 *   thing  —— 20 个以内字符，超出会截断，用于名称/备注
 *   time   —— 日期时间，建议 "2026年10月20日 23:10"
 *   phrase —— 5 个以内汉字，用于状态
 *   number —— 数字，用于人数/数量
 */
module.exports = {
  TASK_ASSIGNED: {
    templateId: 'TMPL_TASK_ASSIGNED_PLACEHOLDER',
    title: '任务委托通知',
    desc: '有人给你派了个活（或把你加进了任务）',
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'thing2', label: '委托人' },
      { key: 'thing3', label: '参与人数' },
      { key: 'time4', label: '截止时间' },
    ],
  },

  TASK_REMIND: {
    templateId: 'TMPL_TASK_REMIND_PLACEHOLDER',
    title: '任务到期提醒',
    desc: '临近截止时间，或委托人手动催办',
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'thing2', label: '委托人' },
      { key: 'time3', label: '截止时间' },
      { key: 'thing4', label: '提示' },
    ],
  },

  TASK_COMPLETED: {
    templateId: 'TMPL_TASK_COMPLETED_PLACEHOLDER',
    title: '任务完成通知',
    desc: '有人完成了任务（多人任务下为「有人完成了自己那份」）',
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'thing2', label: '完成人' },
      { key: 'time3', label: '完成时间' },
      { key: 'thing4', label: '完成进度' },
    ],
  },

  TASK_ALL_DONE: {
    templateId: 'TMPL_TASK_ALL_DONE_PLACEHOLDER',
    title: '全员完成通知',
    desc: '需全员完成的任务，所有人都做完了',
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'thing2', label: '最后完成人' },
      { key: 'time3', label: '完成时间' },
      { key: 'thing4', label: '完成情况' },
    ],
  },
}
