/**
 * 订阅消息模板配置（只保留 4 个）
 *
 * 关键：「服务通知」卡片左侧的标签由模板关键词决定，不是代码里随便写的。
 * 所以这里把「标签」也定义下来，让四处保持一致：
 *   公众平台模板关键词 ←→ 本文件 keywords ←→ 后端 yaml 的 keywords ←→ 服务通知卡片左侧文案
 *
 * 字段类型说明（微信侧约束）：
 *   thing  —— 20 个以内字符，超出会截断，用于名称/备注
 *   time   —— 日期时间，建议 "2026-10-20 23:10"
 *   phrase —— 5 个以内汉字，用于状态
 *   number —— 数字，用于人数/数量
 *
 * 为什么只有 4 个：小程序是个人主体，拿不到「长期订阅」，只能用一次性订阅。
 * 一次性订阅授权一次只能发一条，模板越多用户授权成本越高，所以只申请最高价值的 4 个；
 * 任务开始 / 变更 / 撤回三种通知只走小程序内消息中心，不发微信卡片。
 *
 * ⚠️ 模板审批通过后要做两件事：
 *   1. 把 templateId 换成真 id（未填时 requestSubscribe 直接跳过，不弹窗、不报错）
 *   2. 按微信后台实际的关键词顺序校正 keywords —— 对不上会报 47003，消息发不出去
 */
module.exports = {
  TASK_ASSIGNED: {
    templateId: '', // 待：模板审批通过后填入
    title: '任务委托通知',
    desc: '有人给你派了个活（或把你加进了任务）',
    keywords: ['thing1', 'thing2', 'number3', 'time4'],
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'thing2', label: '委托人' },
      { key: 'number3', label: '参与人数' },
      { key: 'time4', label: '截止时间' },
    ],
  },

  TASK_REMIND: {
    templateId: '', // 待：模板审批通过后填入
    title: '任务到期提醒',
    desc: '临近截止时间，或委托人手动催办',
    keywords: ['thing1', 'time2', 'thing3'],
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'time2', label: '截止时间' },
      { key: 'thing3', label: '提示' },
    ],
  },

  TASK_COMPLETED: {
    templateId: '', // 待：模板审批通过后填入
    title: '任务完成通知',
    desc: '有人完成了任务（多人任务下为「有人完成了自己那份」）',
    keywords: ['thing1', 'thing2', 'time3', 'thing4'],
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'thing2', label: '完成人' },
      { key: 'time3', label: '完成时间' },
      { key: 'thing4', label: '完成进度' },
    ],
  },

  TASK_ALL_DONE: {
    templateId: '', // 待：模板审批通过后填入
    title: '全员完成通知',
    desc: '需全员完成的任务，所有人都做完了',
    keywords: ['thing1', 'time2', 'phrase3'],
    fields: [
      { key: 'thing1', label: '任务名称' },
      { key: 'time2', label: '完成时间' },
      { key: 'phrase3', label: '完成状态' },
    ],
  },
}
