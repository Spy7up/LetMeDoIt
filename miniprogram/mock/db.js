/**
 * Mock 内存数据库 + 种子数据
 * 覆盖全部 7 种展示状态、单人/多人任务、两种完成条件、逾期、定时、已拒绝。
 */

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function iso(ms) {
  return new Date(ms).toISOString()
}

function at(hour, minute, dayOffset) {
  const d = new Date()
  d.setDate(d.getDate() + (dayOffset || 0))
  d.setHours(hour, minute || 0, 0, 0)
  return d.getTime()
}

const USERS = [
  { id: 'u_1001', nickname: '小林', avatarUrl: '', inviteCode: 'K7M2QX', createdAt: iso(Date.now() - 90 * DAY) },
  { id: 'u_1002', nickname: '妈妈', avatarUrl: '', inviteCode: 'M3P8LA', createdAt: iso(Date.now() - 88 * DAY) },
  { id: 'u_1003', nickname: '小王', avatarUrl: '', inviteCode: 'W9Q4TZ', createdAt: iso(Date.now() - 60 * DAY) },
  { id: 'u_1004', nickname: '阿哲', avatarUrl: '', inviteCode: 'Z2N6YB', createdAt: iso(Date.now() - 45 * DAY) },
  { id: 'u_1005', nickname: '陈陈', avatarUrl: '', inviteCode: 'C5R1KD', createdAt: iso(Date.now() - 30 * DAY) },
  { id: 'u_1006', nickname: '老李', avatarUrl: '', inviteCode: 'L8H3PW', createdAt: iso(Date.now() - 2 * DAY) },
  { id: 'u_1007', nickname: '弟弟', avatarUrl: '', inviteCode: 'D4X7MN', createdAt: iso(Date.now() - 86 * DAY) },
]

const ME = 'u_1001'

/** 参与者工厂 */
function P(userId, status, extra) {
  return Object.assign(
    { userId, status, completedAt: null, remark: '', images: [], rejectReason: '' },
    extra || {}
  )
}

/* ---------------- 聚合状态：整个产品的唯一判定 ---------------- */

/**
 * participants + completionMode → 任务聚合状态
 *  - 定时未开始且无人动作 → scheduled
 *  - 全部拒绝/跳过 → rejected
 *  - 全员完成，或「任一人」模式有人完成 → completed
 *  - 有人接受或完成 → in_progress
 *  - 否则 → pending
 */
function aggregate(task) {
  const ps = task.participants || []
  if (!ps.length) return 'pending'

  const acted = ps.some((p) => p.status === 'accepted' || p.status === 'done')
  if (task.startAt && new Date(task.startAt).getTime() > Date.now() && !acted) {
    return 'scheduled'
  }

  const active = ps.filter((p) => p.status !== 'rejected' && p.status !== 'skipped')
  if (!active.length) return 'rejected'

  const done = ps.filter((p) => p.status === 'done')
  if (done.length === ps.length) return 'completed'
  if (task.completionMode === 'any' && done.length >= 1) return 'completed'
  if (ps.some((p) => p.status === 'accepted' || p.status === 'done')) return 'in_progress'
  return 'pending'
}

function fmtCn(ms) {
  const d = new Date(ms)
  const p = (n) => (n < 10 ? '0' + n : '' + n)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}

function buildSeed() {
  const now = Date.now()

  const tasks = [
    {
      id: 't_2001', title: '晾衣服',
      description: '阳台的衣服，白的别和深色混，晾完把盆放回去。你俩一人一半。',
      creatorId: 'u_1002',
      participants: [P(ME, 'pending'), P('u_1007', 'pending')],
      completionMode: 'all',
      startAt: null,
      deadline: iso(now + 50 * MIN),
      remindType: 'm10', remindMinutes: 10,
      createdAt: iso(now - 12 * MIN), updatedAt: iso(now - 12 * MIN),
    },
    {
      id: 't_2002', title: '交一下水电费',
      description: '这个月的，账单在冰箱上贴着二维码。',
      creatorId: 'u_1004',
      participants: [P(ME, 'accepted')],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now - 150 * MIN),
      remindType: 'h1', remindMinutes: 60,
      createdAt: iso(now - 26 * HOUR), updatedAt: iso(now - 20 * HOUR),
    },
    {
      id: 't_2003', title: '取一下快递',
      description: '菜鸟驿站，取件码 8-2-1043，两个箱子有点重。',
      creatorId: 'u_1002',
      participants: [P(ME, 'accepted')],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now + 5 * HOUR),
      remindType: 'm10', remindMinutes: 10,
      createdAt: iso(now - 3 * HOUR), updatedAt: iso(now - 2 * HOUR),
    },
    {
      id: 't_2004', title: '帮我取一下快递',
      description: '丰巢柜，超时要收费，辛苦了。',
      creatorId: ME,
      participants: [P('u_1003', 'accepted')],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now + 2 * HOUR),
      remindType: 'm10', remindMinutes: 10,
      createdAt: iso(now - 40 * MIN), updatedAt: iso(now - 35 * MIN),
    },
    {
      id: 't_2005', title: '提醒我 9 点吃药',
      description: '早饭后那袋白色的，别忘了。',
      creatorId: 'u_1005',
      participants: [P(ME, 'pending')],
      completionMode: 'any',
      startAt: iso(at(8, 0, 1)),
      deadline: iso(at(21, 0, 1)),
      remindType: 'm10', remindMinutes: 10,
      createdAt: iso(now - 5 * HOUR), updatedAt: iso(now - 5 * HOUR),
    },
    {
      id: 't_2006', title: '浇一下花',
      description: '阳台那两盆，浇透就行。',
      creatorId: ME,
      participants: [P('u_1002', 'done', { completedAt: iso(now - 1 * DAY + HOUR), remark: '浇好了，顺手把枯叶剪了' })],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now - 1 * DAY + 2 * HOUR),
      remindType: 'none', remindMinutes: 0,
      createdAt: iso(now - 2 * DAY), updatedAt: iso(now - 1 * DAY + HOUR),
    },
    {
      id: 't_2007', title: '带一袋猫粮回来',
      description: '还是上次那个牌子，五斤装。',
      creatorId: ME,
      participants: [P('u_1004', 'rejected', { rejectReason: '今晚不在家，明天给你带' })],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now - 6 * HOUR),
      remindType: 'none', remindMinutes: 0,
      createdAt: iso(now - 8 * HOUR), updatedAt: iso(now - 7 * HOUR),
    },
    {
      id: 't_2008', title: '把论文打印出来',
      description: '双面，装订一下。',
      creatorId: 'u_1002',
      participants: [P(ME, 'done', { completedAt: iso(now - 3 * DAY + 3 * HOUR), remark: '已打印装订，放你桌上了' })],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now - 3 * DAY + 5 * HOUR),
      remindType: 'h1', remindMinutes: 60,
      createdAt: iso(now - 4 * DAY), updatedAt: iso(now - 3 * DAY + 3 * HOUR),
    },
    {
      id: 't_2009', title: '带份早饭',
      description: '楼下那家，豆浆油条。谁顺路谁带。',
      creatorId: ME,
      participants: [P('u_1003', 'pending'), P('u_1005', 'pending')],
      completionMode: 'any',
      startAt: null,
      deadline: iso(at(8, 30, 1)),
      remindType: 'm10', remindMinutes: 10,
      createdAt: iso(now - 20 * MIN), updatedAt: iso(now - 20 * MIN),
    },
    {
      id: 't_2010', title: '周末大扫除',
      description: '厨房、客厅、卫生间，一人一块，做完在下面点完成。',
      creatorId: ME,
      participants: [
        P('u_1003', 'done', { completedAt: iso(now - 30 * MIN), remark: '厨房搞定了' }),
        P('u_1004', 'accepted'),
        P('u_1005', 'pending'),
      ],
      completionMode: 'all',
      startAt: null,
      deadline: iso(now + 1 * DAY),
      remindType: 'h1', remindMinutes: 60,
      createdAt: iso(now - 4 * HOUR), updatedAt: iso(now - 30 * MIN),
    },
    {
      id: 't_2011', title: '搬一下桌子',
      description: '书房的桌子搬到客厅。',
      creatorId: 'u_1002',
      participants: [
        P(ME, 'skipped'),
        P('u_1007', 'done', { completedAt: iso(now - 70 * MIN), remark: '我搬完了' }),
        P('u_1003', 'skipped'),
      ],
      completionMode: 'any',
      startAt: null,
      deadline: iso(now - 1 * HOUR),
      remindType: 'none', remindMinutes: 0,
      createdAt: iso(now - 3 * HOUR), updatedAt: iso(now - 70 * MIN),
    },
  ]

  // 回填聚合状态
  tasks.forEach((t) => {
    t.status = aggregate(t)
  })

  /* ---------------- 时间线 ---------------- */
  const events = []
  let seq = 1
  const push = (taskId, actorId, type, ms, text) => {
    events.push({ id: 'e_' + seq++, taskId, actorId, type, text, createdAt: iso(ms) })
  }

  tasks.forEach((t) => {
    const created = new Date(t.createdAt).getTime()
    push(t.id, t.creatorId, 'created', created, '布置了任务')
    if (t.participants.length > 1) {
      push(t.id, t.creatorId, 'invited', created, `邀请了 ${t.participants.length} 人`)
    }
    t.participants.forEach((p, i) => {
      const t0 = created + 3 * MIN + i * 60 * 1000
      if (p.status === 'accepted') push(t.id, p.userId, 'accepted', t0, '接受了任务')
      if (p.status === 'done') {
        push(t.id, p.userId, 'accepted', t0, '接受了任务')
        push(t.id, p.userId, 'completed', new Date(p.completedAt).getTime(),
          '完成了自己那份' + (p.remark ? '：' + p.remark : ''))
      }
      if (p.status === 'rejected') {
        push(t.id, p.userId, 'rejected', new Date(t.updatedAt).getTime(), '拒绝了任务：' + p.rejectReason)
      }
    })
  })

  /* ---------------- 好友 ---------------- */
  const friends = [
    { id: 'f_1', userId: ME, friendUserId: 'u_1002', remark: '老妈', createdAt: iso(Date.now() - 88 * DAY) },
    { id: 'f_2', userId: ME, friendUserId: 'u_1003', remark: '', createdAt: iso(Date.now() - 60 * DAY) },
    { id: 'f_3', userId: ME, friendUserId: 'u_1004', remark: '室友', createdAt: iso(Date.now() - 45 * DAY) },
    { id: 'f_4', userId: ME, friendUserId: 'u_1005', remark: '', createdAt: iso(Date.now() - 30 * DAY) },
    { id: 'f_5', userId: ME, friendUserId: 'u_1007', remark: '弟弟', createdAt: iso(Date.now() - 86 * DAY) },
  ]

  const friendRequests = [
    {
      id: 'r_1', fromUserId: 'u_1006', toUserId: ME,
      message: '我是楼下老李，你妈让我加你', status: 'pending',
      createdAt: iso(Date.now() - 2 * HOUR),
    },
  ]

  /* ---------------- 服务通知（与微信订阅消息同构：标题 + 键值行） ---------------- */
  const messages = [
    {
      id: 'm_1', taskId: 't_2001', templateKey: 'TASK_ASSIGNED',
      title: '任务委托通知',
      fields: [
        { label: '任务名称', value: '晾衣服' },
        { label: '委托人', value: '妈妈' },
        { label: '参与人数', value: '2 人（需全员完成）' },
        { label: '截止时间', value: fmtCn(now + 50 * MIN) },
      ],
      read: false,
      createdAt: iso(now - 12 * MIN),
    },
    {
      id: 'm_2', taskId: 't_2010', templateKey: 'TASK_PROGRESS',
      title: '任务进度提醒',
      fields: [
        { label: '任务名称', value: '周末大扫除' },
        { label: '完成进度', value: '1/3 人已完成' },
        { label: '还差', value: '阿哲、陈陈' },
        { label: '截止时间', value: fmtCn(now + 1 * DAY) },
      ],
      read: false,
      createdAt: iso(now - 30 * MIN),
    },
    {
      id: 'm_3', taskId: 't_2006', templateKey: 'TASK_COMPLETED',
      title: '任务完成通知',
      fields: [
        { label: '任务名称', value: '浇一下花' },
        { label: '完成人', value: '妈妈' },
        { label: '完成时间', value: fmtCn(now - 1 * DAY + HOUR) },
        { label: '完成备注', value: '浇好了，顺手把枯叶剪了' },
      ],
      read: true,
      createdAt: iso(now - 1 * DAY + HOUR),
    },
    {
      id: 'm_4', taskId: 't_2011', templateKey: 'TASK_ALL_DONE',
      title: '全员完成通知',
      fields: [
        { label: '任务名称', value: '搬一下桌子' },
        { label: '完成人', value: '弟弟' },
        { label: '完成时间', value: fmtCn(now - 70 * MIN) },
        { label: '完成方式', value: '任一人完成，其余已跳过' },
      ],
      read: true,
      createdAt: iso(now - 70 * MIN),
    },
  ]

  // 种子通知都是发给「我」的
  messages.forEach((m) => { m.toUserId = ME })

  return { tasks, events, friends, friendRequests, messages, notifyLog: [] }
}

let state = buildSeed()

function reset() {
  state = buildSeed()
}

/* ---------------- 查询辅助 ---------------- */

function user(id) {
  return USERS.find((u) => u.id === id) || null
}

function briefUser(id) {
  const u = user(id)
  if (!u) return { id, nickname: '已注销用户', avatarUrl: '' }
  return { id: u.id, nickname: u.nickname, avatarUrl: u.avatarUrl }
}

function friendIds(meId) {
  return state.friends.filter((f) => f.userId === meId).map((f) => f.friendUserId)
}

function isParticipant(task, userId) {
  return (task.participants || []).some((p) => p.userId === userId)
}

function isOverdue(task, now) {
  const active = task.status === 'pending' || task.status === 'in_progress'
  return active && new Date(task.deadline).getTime() < (now || Date.now())
}

function stats(meId) {
  const sent = state.tasks.filter((t) => t.creatorId === meId)
  const received = state.tasks.filter((t) => isParticipant(t, meId))
  const myDone = []
  received.forEach((t) => {
    const p = t.participants.find((x) => x.userId === meId)
    if (p && p.status === 'done') myDone.push({ task: t, p })
  })
  const onTime = myDone.filter(
    ({ task, p }) => new Date(p.completedAt).getTime() <= new Date(task.deadline).getTime()
  )
  return {
    sentCount: sent.length,
    receivedCount: received.length,
    completedCount: myDone.length,
    onTimeRate: myDone.length ? Math.round((onTime.length / myDone.length) * 100) / 100 : 1,
    friendCount: state.friends.filter((f) => f.userId === meId).length,
  }
}

module.exports = {
  ME,
  USERS,
  get state() {
    return state
  },
  reset,
  user,
  briefUser,
  friendIds,
  isParticipant,
  isOverdue,
  stats,
  aggregate,
  iso,
  fmtCn,
}
