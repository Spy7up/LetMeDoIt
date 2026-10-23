/**
 * 契约服务（仅用于前端自测，不参与小程序打包）
 *
 * 背景：本机没有 MySQL / Redis，sa-app 起不来，但前端改完必须验证。
 * 这个服务严格按 sa-app 的接口契约实现：
 *   - 路径 /api/**
 *   - 鉴权头 App-Token: Bearer <token>
 *   - 信封 { code, level, msg, ok, data }
 *   - 时间 yyyy-MM-dd HH:mm:ss
 *   - 分页 pageNum / pageSize
 * 所以 request.js / services/*.js 走的是完全真实的链路（真 HTTP、真头、真信封）。
 *
 * 用法：
 *   node tools/contract-server.js          # 手动起在 1025，给开发者工具当后端用
 *   require('./contract-server').start()   # 给 sim.js 内嵌
 *
 * 注意：真实联调请连 sa-app（同一个 1025 端口），这个服务只是没有数据库时的替身。
 */
const http = require('http')
const { URL } = require('url')

const DEFAULT_PORT = 1025

/* ---------------- 时间 ---------------- */

const pad = (n) => (n < 10 ? '0' + n : '' + n)

function fmtTime(ms) {
  const d = new Date(ms)
  return (
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
  )
}

function parseTime(value) {
  if (!value) return NaN
  const m = String(value).match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (!m) return new Date(value).getTime()
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime()
}

const MIN = 60 * 1000

/** 附图上限，和 sa-app 的 TaskImages.MAX_COUNT 对齐 */
const MAX_TASK_IMAGES = 6

/** 附图清洗：只留公网 http(s)、去重、最多 6 张 */
function normalizeImages(list) {
  if (!Array.isArray(list)) return []
  const kept = []
  list.forEach((raw) => {
    const url = String(raw == null ? '' : raw).trim()
    if (!url || url.length > 500) return
    if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) return
    // 微信临时路径也是 http(s) 形态（http://tmp/xxx.jpeg），单独排掉
    if (url.indexOf('wxfile://') === 0 || url.indexOf('http://tmp') === 0) return
    if (url.indexOf('/tmp/') >= 0) return
    if (kept.indexOf(url) >= 0) return
    if (kept.length >= MAX_TASK_IMAGES) return
    kept.push(url)
  })
  return kept
}
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/* ---------------- 枚举（与后端一致） ---------------- */

const TASK = {
  SCHEDULED: 0,
  PENDING: 1,
  IN_PROGRESS: 2,
  COMPLETED: 3,
  REJECTED: 4,
  CANCELLED: 5,
}
const P = { PENDING: 0, ACCEPTED: 1, DONE: 2, REJECTED: 3, SKIPPED: 4 }
const MODE = { ANY: 1, ALL: 2 }
const ROLE = { ASSIGNEE: 1, CREATOR: 2 }

const TASK_DESC = ['预约中', '待接受', '进行中', '已完成', '已拒绝', '已撤回']
const P_DESC = ['待接受', '已接受', '已完成', '已拒绝', '已跳过']
const MODE_DESC = ['', '任一人完成', '全员完成']

/* ---------------- 内存数据 ---------------- */

let state

function seed() {
  const now = Date.now()

  const members = [
    { memberId: 1, nickname: '小林', avatar: '', inviteCode: 'K7M2QX' },
    { memberId: 2, nickname: '妈妈', avatar: '', inviteCode: 'M3P8LA' },
    { memberId: 3, nickname: '小王', avatar: '', inviteCode: 'W9Q4TZ' },
    { memberId: 4, nickname: '阿哲', avatar: '', inviteCode: 'Z2N6YB' },
    { memberId: 5, nickname: '陈陈', avatar: '', inviteCode: 'C5R1KD' },
    { memberId: 6, nickname: '老李', avatar: '', inviteCode: 'L8H3PW' },
  ]

  const ME = 1
  let seq = 0
  const nextId = () => ++seq

  const tasks = [
    {
      taskId: nextId(), title: '晾衣服',
      description: '阳台的衣服，白的别和深色混，晾完把盆放回去。你俩一人一半。',
      creatorId: 2,
      participants: [slot(ME, P.PENDING), slot(7, P.PENDING)],
      completionMode: MODE.ALL, startTime: null,
      deadline: now + 50 * MIN, remindMinutes: 10,
      createTime: now - 12 * MIN, updateTime: now - 12 * MIN,
    },
    {
      taskId: nextId(), title: '交一下水电费',
      description: '这个月的，账单在冰箱上贴着二维码。',
      creatorId: 4,
      participants: [slot(ME, P.ACCEPTED)],
      completionMode: MODE.ANY, startTime: null,
      deadline: now - 150 * MIN, remindMinutes: 60,
      createTime: now - 26 * HOUR, updateTime: now - 20 * HOUR,
    },
    {
      taskId: nextId(), title: '取一下快递',
      description: '菜鸟驿站，取件码 8-2-1043，两个箱子有点重。',
      creatorId: 2,
      participants: [slot(ME, P.ACCEPTED)],
      completionMode: MODE.ANY, startTime: null,
      deadline: now + 5 * HOUR, remindMinutes: 10,
      createTime: now - 3 * HOUR, updateTime: now - 2 * HOUR,
    },
    {
      taskId: nextId(), title: '帮我取一下快递',
      description: '丰巢柜，超时要收费，辛苦了。',
      creatorId: ME,
      participants: [slot(3, P.ACCEPTED)],
      completionMode: MODE.ANY, startTime: null,
      deadline: now + 2 * HOUR, remindMinutes: 10,
      createTime: now - 40 * MIN, updateTime: now - 35 * MIN,
    },
    {
      taskId: nextId(), title: '提醒我 9 点吃药',
      description: '早饭后那袋白色的，别忘了。',
      creatorId: 5,
      participants: [slot(ME, P.PENDING)],
      completionMode: MODE.ANY,
      startTime: tomorrow(8, 0), deadline: tomorrow(21, 0), remindMinutes: 10,
      createTime: now - 5 * HOUR, updateTime: now - 5 * HOUR,
    },
    {
      taskId: nextId(), title: '浇一下花',
      description: '阳台那两盆，浇透就行。',
      creatorId: ME,
      participants: [slot(2, P.DONE, { completeTime: now - 1 * DAY + HOUR, completeRemark: '浇好了，顺手把枯叶剪了' })],
      completionMode: MODE.ANY, startTime: null,
      deadline: now - 1 * DAY + 2 * HOUR, remindMinutes: 0,
      createTime: now - 2 * DAY, updateTime: now - 1 * DAY + HOUR,
    },
    {
      taskId: nextId(), title: '带一袋猫粮回来',
      description: '还是上次那个牌子，五斤装。',
      creatorId: ME,
      participants: [slot(4, P.REJECTED, { rejectReason: '今晚不在家，明天给你带' })],
      completionMode: MODE.ANY, startTime: null,
      deadline: now - 6 * HOUR, remindMinutes: 0,
      createTime: now - 8 * HOUR, updateTime: now - 7 * HOUR,
    },
    {
      taskId: nextId(), title: '把论文打印出来',
      description: '双面，装订一下。',
      creatorId: 2,
      participants: [slot(ME, P.DONE, { completeTime: now - 3 * DAY + 3 * HOUR, completeRemark: '已打印装订，放你桌上了' })],
      completionMode: MODE.ANY, startTime: null,
      deadline: now - 3 * DAY + 5 * HOUR, remindMinutes: 60,
      createTime: now - 4 * DAY, updateTime: now - 3 * DAY + 3 * HOUR,
    },
    {
      taskId: nextId(), title: '带份早饭',
      description: '楼下那家，豆浆油条。谁顺路谁带。',
      creatorId: ME,
      participants: [slot(3, P.PENDING), slot(5, P.PENDING)],
      completionMode: MODE.ANY, startTime: null,
      deadline: tomorrow(8, 30), remindMinutes: 10,
      createTime: now - 20 * MIN, updateTime: now - 20 * MIN,
    },
    {
      taskId: nextId(), title: '周末大扫除',
      description: '厨房、客厅、卫生间，一人一块，做完在下面点完成。',
      creatorId: ME,
      participants: [
        slot(3, P.DONE, { completeTime: now - 30 * MIN, completeRemark: '厨房搞定了' }),
        slot(4, P.ACCEPTED),
        slot(5, P.PENDING),
      ],
      completionMode: MODE.ALL, startTime: null,
      deadline: now + 1 * DAY, remindMinutes: 60,
      createTime: now - 4 * HOUR, updateTime: now - 30 * MIN,
    },
    {
      taskId: nextId(), title: '搬一下桌子',
      description: '书房的桌子搬到客厅。',
      creatorId: 2,
      participants: [
        slot(ME, P.SKIPPED),
        slot(7, P.DONE, { completeTime: now - 70 * MIN, completeRemark: '我搬完了' }),
        slot(3, P.SKIPPED),
      ],
      completionMode: MODE.ANY, startTime: null,
      deadline: now - 1 * HOUR, remindMinutes: 0,
      createTime: now - 3 * HOUR, updateTime: now - 70 * MIN,
    },
  ]

  // 补一个第 7 位成员（弟弟），种子任务里用到
  members.push({ memberId: 7, nickname: '弟弟', avatar: '', inviteCode: 'D4X7MN' })

  tasks.forEach((t) => {
    t.status = aggregate(t, Date.now())
  })

  const friends = []
  ;[2, 3, 4, 5, 7].forEach((fid) => {
    friends.push({ friendId: nextId(), memberId: ME, friendMemberId: fid, remark: fid === 2 ? '老妈' : '', createTime: now - 30 * DAY })
    friends.push({ friendId: nextId(), memberId: fid, friendMemberId: ME, remark: '', createTime: now - 30 * DAY })
  })

  const requests = [
    { requestId: nextId(), fromMemberId: 6, toMemberId: ME, applyMessage: '我是楼下老李，你妈让我加你', status: 0, createTime: now - 2 * HOUR },
  ]

  const events = []
  tasks.forEach((t) => {
    events.push({
      eventId: nextId(), taskId: t.taskId, eventType: 1, eventTypeDesc: '创建',
      actorId: t.creatorId, content: '布置了任务', createTime: t.createTime,
    })
    t.participants.forEach((p) => {
      if (p.status === P.ACCEPTED || p.status === P.DONE) {
        events.push({
          eventId: nextId(), taskId: t.taskId, eventType: 2, eventTypeDesc: '接受',
          actorId: p.memberId, content: '接受了任务', createTime: t.createTime + 3 * MIN,
        })
      }
      if (p.status === P.DONE) {
        events.push({
          eventId: nextId(), taskId: t.taskId, eventType: 3, eventTypeDesc: '完成',
          actorId: p.memberId, content: '完成了自己那份' + (p.completeRemark ? '：' + p.completeRemark : ''),
          createTime: p.completeTime,
        })
      }
    })
  })

  const notices = [
    notice(nextId(), 1, 1, 'TASK_ASSIGNED', [
      { label: '任务名称', value: '晾衣服' },
      { label: '委托人', value: '妈妈' },
      { label: '参与人数', value: '共 2 人（全员完成）' },
      { label: '截止时间', value: fmtTime(now + 50 * MIN) },
    ], false, now - 12 * MIN),
    notice(nextId(), 10, ME, 'TASK_COMPLETED', [
      { label: '任务名称', value: '周末大扫除' },
      { label: '完成人', value: '小王' },
      { label: '完成时间', value: fmtTime(now - 30 * MIN) },
      { label: '完成进度', value: '1/3 人已完成' },
    ], false, now - 30 * MIN),
    notice(nextId(), 6, ME, 'TASK_COMPLETED', [
      { label: '任务名称', value: '浇一下花' },
      { label: '完成人', value: '妈妈' },
      { label: '完成时间', value: fmtTime(now - 1 * DAY + HOUR) },
      { label: '完成备注', value: '浇好了，顺手把枯叶剪了' },
    ], true, now - 1 * DAY + HOUR),
  ]

  return { members, tasks, friends, requests, events, notices, tokens: {}, nextId, remindAt: {} }
}

function slot(memberId, status, extra) {
  return Object.assign(
    { memberId, status, completeTime: null, completeRemark: '', completeImages: [], rejectReason: '' },
    extra || {}
  )
}

const NOTICE_TITLES = {
  TASK_ASSIGNED: '任务委托通知',
  TASK_REMIND: '任务到期提醒',
  TASK_START: '任务开始通知',
  TASK_EDITED: '任务变更通知',
  TASK_CANCELLED: '任务取消通知',
  TASK_COMPLETED: '任务完成通知',
  TASK_ALL_DONE: '全员完成通知',
}

function notice(noticeId, taskId, toMemberId, templateKey, fields, readFlag, ms) {
  return {
    noticeId, taskId, toMemberId, templateKey,
    title: NOTICE_TITLES[templateKey] || '任务通知',
    fields, readFlag, createTime: ms,
  }
}

function tomorrow(hour, minute) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, minute || 0, 0, 0)
  return d.getTime()
}

/* ---------------- 业务规则 ---------------- */

/** 聚合状态：与 sa-app 的 TaskStatusCalculator 等价 */
function aggregate(task, now) {
  const ps = task.participants || []
  if (!ps.length) return TASK.PENDING

  const acted = ps.some((p) => p.status === P.ACCEPTED || p.status === P.DONE)
  if (task.startTime && task.startTime > now && !acted) return TASK.SCHEDULED

  const active = ps.filter((p) => p.status !== P.REJECTED && p.status !== P.SKIPPED)
  if (!active.length) return TASK.REJECTED

  const done = ps.filter((p) => p.status === P.DONE)
  if (done.length === ps.length) return TASK.COMPLETED
  if (task.completionMode === MODE.ANY && done.length >= 1) return TASK.COMPLETED
  if (acted) return TASK.IN_PROGRESS
  return TASK.PENDING
}

function isOverdue(task, now) {
  return (task.status === TASK.PENDING || task.status === TASK.IN_PROGRESS) && task.deadline < now
}

/** 未授权时的兜底昵称：用户 + 4 位大写字母数字 */
function fallbackNickname() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return '用户' + s
}

function memberOf(id) {
  return state.members.find((m) => m.memberId === Number(id)) || null
}

function userVO(id) {
  const m = memberOf(id)
  if (!m) return { memberId: Number(id), nickname: '已注销用户', avatar: '' }
  return { memberId: m.memberId, nickname: m.nickname, avatar: m.avatar || '' }
}

function isFriend(a, b) {
  return state.friends.some((f) => f.memberId === Number(a) && f.friendMemberId === Number(b))
}

function participantOf(task, memberId) {
  return task.participants.find((p) => p.memberId === Number(memberId)) || null
}

function isParticipant(task, memberId) {
  return !!participantOf(task, memberId)
}

function bump(task) {
  task.status = aggregate(task, Date.now())
  task.updateTime = Date.now()
}

function pushEvent(task, actorId, type, desc, content) {
  state.events.push({
    eventId: state.nextId(), taskId: task.taskId, eventType: type, eventTypeDesc: desc,
    actorId, content, createTime: Date.now(),
  })
}

function pushNotices(task, memberIds, templateKey, fields) {
  memberIds.forEach((mid) => {
    if (!mid) return
    state.notices.unshift(notice(state.nextId(), task.taskId, Number(mid), templateKey, fields, false, Date.now()))
  })
}

/* ---------------- VO 组装 ---------------- */

function participantVO(p) {
  return Object.assign({}, userVO(p.memberId), {
    status: p.status,
    statusDesc: P_DESC[p.status],
    completeTime: p.completeTime ? fmtTime(p.completeTime) : null,
    completeRemark: p.completeRemark || '',
    completeImages: p.completeImages || [],
    rejectReason: p.rejectReason || '',
  })
}

function listVO(task, me) {
  const mine = participantOf(task, me)
  return {
    taskId: task.taskId,
    title: task.title,
    creatorId: task.creatorId,
    status: task.status,
    statusDesc: TASK_DESC[task.status],
    overdueFlag: isOverdue(task, Date.now()),
    deadline: fmtTime(task.deadline),
    role: mine ? ROLE.ASSIGNEE : ROLE.CREATOR,
    completionMode: task.completionMode,
    completionModeDesc: MODE_DESC[task.completionMode],
    participantCount: task.participants.length,
    doneCount: task.participants.filter((p) => p.status === P.DONE).length,
    participants: task.participants.slice(0, 4).map((p) => userVO(p.memberId)),
    creator: userVO(task.creatorId),
    myStatus: mine ? mine.status : null,
    updateTime: fmtTime(task.updateTime),
  }
}

function detailVO(task, me) {
  const mine = participantOf(task, me)
  const isCreator = task.creatorId === Number(me)
  const active = task.status === TASK.PENDING || task.status === TASK.IN_PROGRESS
  // 撤回只要任务没结束（含预约中），与 sa-app 的 ACTIVE_TASK_STATUS 保持一致
  const cancellable =
    task.status === TASK.SCHEDULED || task.status === TASK.PENDING || task.status === TASK.IN_PROGRESS
  const ps = task.participants

  return {
    taskId: task.taskId,
    title: task.title,
    description: task.description || '',
    images: task.images || [],
    creator: userVO(task.creatorId),
    participants: ps.map(participantVO),
    completionMode: task.completionMode,
    completionModeDesc: MODE_DESC[task.completionMode],
    status: task.status,
    statusDesc: TASK_DESC[task.status],
    startTime: task.startTime ? fmtTime(task.startTime) : null,
    startNotifyFlag: task.startNotifyFlag !== false,
    deadline: fmtTime(task.deadline),
    remindMinutes: task.remindMinutes || 0,
    overdueFlag: isOverdue(task, Date.now()),
    totalCount: ps.length,
    doneCount: ps.filter((p) => p.status === P.DONE).length,
    acceptedCount: ps.filter((p) => p.status === P.ACCEPTED || p.status === P.DONE).length,
    rejectedCount: ps.filter((p) => p.status === P.REJECTED).length,
    skippedCount: ps.filter((p) => p.status === P.SKIPPED).length,
    me: mine ? participantVO(mine) : null,
    creatorFlag: isCreator,
    canAccept: !!mine && mine.status === P.PENDING && active,
    canReject: !!mine && mine.status === P.PENDING && active,
    canComplete: !!mine && mine.status === P.ACCEPTED && active,
    canCancel: isCreator && cancellable,
    canRemind: isCreator && active,
    canAddParticipant:
      isCreator && (task.status === TASK.PENDING || task.status === TASK.SCHEDULED) && ps.length < 10,
    // 预约中/待接受不限次数；进行中只给一次
    canEdit:
      isCreator &&
      (task.status === TASK.SCHEDULED ||
        task.status === TASK.PENDING ||
        (task.status === TASK.IN_PROGRESS && !task.editCount)),
    events: state.events
      .filter((e) => e.taskId === task.taskId)
      .sort((a, b) => a.createTime - b.createTime)
      .map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        eventTypeDesc: e.eventTypeDesc,
        content: e.content,
        actor: e.actorId ? userVO(e.actorId) : null,
        createTime: fmtTime(e.createTime),
      })),
    createTime: fmtTime(task.createTime),
    updateTime: fmtTime(task.updateTime),
  }
}

/* ---------------- 信封 ---------------- */

const ok = (data) => ({ code: 0, level: null, msg: null, ok: true, data: data === undefined ? null : data, dataType: 1 })
const fail = (code, msg) => ({ code, level: 'error', msg, ok: false, data: null })

const ERR = {
  PARAM: 30001,
  LOGIN: 30007,
  NOT_EXIST: 30003,
  NO_PERMISSION: 30005,
  REPEAT: 30009,
}

/* ---------------- 路由 ---------------- */

const routes = []

function route(method, pattern, handler, needLogin) {
  routes.push({ method, pattern, handler, needLogin: needLogin !== false })
}

/* 认证与资料 */

route('POST', /^\/api\/auth\/login$/, ({ body }) => {
  if (!body || !body.code) return fail(ERR.PARAM, '缺少 code')
  const me = memberOf(1)
  const token = 'tok_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  // isConcurrent=false：新 token 顶掉旧 token
  Object.keys(state.tokens).forEach((k) => {
    if (state.tokens[k] === me.memberId) delete state.tokens[k]
  })
  state.tokens[token] = me.memberId

  // 登录时带上微信资料就写入；没有（用户拒绝授权）且库里也没昵称，就兜底「用户XXXX」
  if (body.nickname) {
    me.nickname = String(body.nickname)
    me.avatar = String(body.avatar || '')
  } else if (!me.nickname) {
    me.nickname = fallbackNickname()
  }

  return ok({
    token,
    tokenName: 'App-Token',
    member: { memberId: me.memberId, nickname: me.nickname, avatar: me.avatar, phone: null, inviteCode: me.inviteCode, gender: 0 },
    newUser: false,
    needBindPhone: false,
  })
}, false)

route('POST', /^\/api\/auth\/logout$/, ({ me }) => {
  Object.keys(state.tokens).forEach((k) => {
    if (state.tokens[k] === me) delete state.tokens[k]
  })
  return ok('已退出')
})

route('GET', /^\/api\/member\/info$/, ({ me }) => {
  const m = memberOf(me)
  return ok({ memberId: m.memberId, nickname: m.nickname, avatar: m.avatar, phone: null, inviteCode: m.inviteCode, gender: 0 })
})

route('POST', /^\/api\/member\/profile$/, ({ me, body }) => {
  const m = memberOf(me)
  const nickname = String(body.nickname || '').trim()
  if (!nickname) return fail(ERR.PARAM, '昵称不能为空')
  if (nickname.length > 20) return fail(ERR.PARAM, '昵称最多 20 个字')
  m.nickname = nickname
  if (body.avatar !== undefined) m.avatar = String(body.avatar || '')
  return ok({ memberId: m.memberId, nickname: m.nickname, avatar: m.avatar, phone: null, inviteCode: m.inviteCode, gender: 0 })
})

/* 任务 */

route('POST', /^\/api\/task\/query$/, ({ me, body }) => {
  const role = Number(body.role)
  if (role !== ROLE.ASSIGNEE && role !== ROLE.CREATOR) return fail(ERR.PARAM, '请选择查询视角')

  let list = state.tasks.filter((t) =>
    role === ROLE.CREATOR ? t.creatorId === Number(me) : isParticipant(t, me)
  )

  if (body.status !== undefined && body.status !== null) {
    const s = Number(body.status)
    list = list.filter((t) => t.status === s)
  }
  if (body.overdueFlag) list = list.filter((t) => isOverdue(t, Date.now()))
  if (body.keyword) {
    const kw = String(body.keyword)
    list = list.filter((t) => t.title.indexOf(kw) >= 0)
  }
  // 创建时间范围：0不限 1今天 2近7天 3近30天（与 TaskTimeRangeEnum 一致）
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const timeStart = {
    1: startOfToday.getTime(),
    2: startOfToday.getTime() - 6 * DAY,
    3: startOfToday.getTime() - 29 * DAY,
  }[Number(body.timeRange)]
  if (timeStart) list = list.filter((t) => t.createTime >= timeStart)

  list.sort((a, b) => b.updateTime - a.updateTime)
  const pageNum = Math.max(Number(body.pageNum) || 1, 1)
  const pageSize = Math.min(Number(body.pageSize) || 10, 500)
  const rows = list.slice((pageNum - 1) * pageSize, pageNum * pageSize)

  return ok({
    pageNum,
    pageSize,
    total: list.length,
    pages: Math.ceil(list.length / pageSize),
    list: rows.map((t) => listVO(t, me)),
  })
})

route('GET', /^\/api\/task\/get\/(\d+)$/, ({ me, params }) => {
  const task = state.tasks.find((t) => t.taskId === Number(params[0]))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在或已被删除')
  if (task.creatorId !== Number(me) && !isParticipant(task, me)) {
    return fail(ERR.NO_PERMISSION, '这不是你的任务')
  }
  return ok(detailVO(task, me))
})

route('GET', /^\/api\/task\/summary$/, ({ me }) => {
  const mine = state.tasks.filter((t) => isParticipant(t, me))
  const actionable = mine.filter((t) => {
    const p = participantOf(t, me)
    return (
      p &&
      (p.status === P.PENDING || p.status === P.ACCEPTED) &&
      (t.status === TASK.PENDING || t.status === TASK.IN_PROGRESS)
    )
  })
  const sent = state.tasks.filter(
    (t) =>
      t.creatorId === Number(me) &&
      (t.status === TASK.SCHEDULED || t.status === TASK.PENDING || t.status === TASK.IN_PROGRESS)
  )
  const seen = {}
  const waitingUsers = []
  actionable.forEach((t) => {
    if (t.creatorId === Number(me) || seen[t.creatorId]) return
    seen[t.creatorId] = 1
    waitingUsers.push(userVO(t.creatorId))
  })

  return ok({
    assigneeCount: actionable.length,
    creatorCount: sent.length,
    overdueCount: mine.filter((t) => isOverdue(t, Date.now())).length,
    waitingUsers: waitingUsers.slice(0, 3),
  })
})

route('GET', /^\/api\/task\/stats$/, ({ me }) => {
  const sent = state.tasks.filter((t) => t.creatorId === Number(me))
  const received = state.tasks.filter((t) => isParticipant(t, me))
  const done = []
  received.forEach((t) => {
    const p = participantOf(t, me)
    if (p && p.status === P.DONE) done.push({ t, p })
  })
  const onTime = done.filter(({ t, p }) => p.completeTime <= t.deadline)
  return ok({
    sentCount: sent.length,
    receivedCount: received.length,
    completedCount: done.length,
    onTimeCount: onTime.length,
    onTimeRate: done.length ? Number((onTime.length / done.length).toFixed(4)) : 1,
    friendCount: state.friends.filter((f) => f.memberId === Number(me)).length,
  })
})

route('POST', /^\/api\/task\/add$/, ({ me, body }) => {
  const title = String(body.title || '').trim()
  if (!title) return fail(ERR.PARAM, '写一句要做什么吧')
  if (title.length > 30) return fail(ERR.PARAM, '标题最多 30 个字')

  const ids = (body.memberIds || []).map(Number)
  if (!ids.length) return fail(ERR.PARAM, '至少选一个人')
  if (ids.length > 10) return fail(ERR.PARAM, '一条任务最多 10 个人')
  if (new Set(ids).size !== ids.length) return fail(ERR.PARAM, '同一个人只能选一次')
  const strangers = ids.filter((id) => id !== Number(me) && !isFriend(me, id))
  if (strangers.length) return fail(ERR.NO_PERMISSION, '有参与者还不是你的好友')

  const deadline = parseTime(body.deadline)
  if (!deadline) return fail(ERR.PARAM, '请选择截止时间')
  if (deadline < Date.now() - MIN) return fail(ERR.PARAM, '截止时间不能早于现在')

  const mode = Number(body.completionMode) === MODE.ANY ? MODE.ANY : MODE.ALL
  const task = {
    taskId: state.nextId(),
    title,
    description: String(body.description || '').slice(0, 200),
    // 附图只留公网 http(s)，最多 6 张（和服务端 TaskImages 同一套规则）
    images: normalizeImages(body.images),
    creatorId: Number(me),
    participants: ids.map((id) => slot(id, P.PENDING)),
    completionMode: mode,
    startTime: body.startTime ? parseTime(body.startTime) : null,
    startNotifyFlag: body.startNotifyFlag !== false,
    deadline,
    remindMinutes: Number(body.remindMinutes) || 0,
    createTime: Date.now(),
    updateTime: Date.now(),
  }
  task.status = aggregate(task, Date.now())
  state.tasks.unshift(task)

  pushEvent(task, me, 1, '创建', '布置了任务')
  if (ids.length > 1) pushEvent(task, me, 5, '邀请', '邀请了 ' + ids.length + ' 人')

  pushNotices(task, ids.filter((id) => id !== Number(me)), 'TASK_ASSIGNED', [
    { label: '任务名称', value: task.title },
    { label: '委托人', value: memberOf(me).nickname },
    { label: '参与人数', value: '共 ' + ids.length + ' 人（' + MODE_DESC[mode] + '）' },
    { label: '截止时间', value: fmtTime(deadline) },
  ])

  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/update$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  if (task.creatorId !== Number(me)) return fail(ERR.NO_PERMISSION, '只有布置的人能操作')
  const editable =
    task.status === TASK.SCHEDULED ||
    task.status === TASK.PENDING ||
    (task.status === TASK.IN_PROGRESS && !task.editCount)
  if (!editable) {
    return fail(ERR.REPEAT, task.status === TASK.IN_PROGRESS ? '已经改过一次了，不能再改' : '任务已经结束，改不了了')
  }
  // 只有进行中的编辑才计数（预约中/待接受随便改）
  if (task.status === TASK.IN_PROGRESS) task.editCount = (task.editCount || 0) + 1
  if (body.title !== undefined) task.title = String(body.title).slice(0, 30)
  if (body.description !== undefined) task.description = String(body.description).slice(0, 200)
  // 传空数组 = 把图全删掉；不传 = 不改
  if (body.images !== undefined) task.images = normalizeImages(body.images)
  if (body.deadline) task.deadline = parseTime(body.deadline)
  if (body.completionMode !== undefined) task.completionMode = Number(body.completionMode)
  if (body.remindMinutes !== undefined) task.remindMinutes = Number(body.remindMinutes)

  // 开始时间点只有「预约中」能改
  if (task.status === TASK.SCHEDULED) {
    // 关掉开始时间点：清空后 bump() 会把它重算成待接受
    if (body.removeStartTime) {
      task.startTime = null
    } else if (body.startTime !== undefined) {
      task.startTime = body.startTime ? parseTime(body.startTime) : null
    }
    if (body.startNotifyFlag !== undefined) task.startNotifyFlag = body.startNotifyFlag !== false
  }

  bump(task)

  // 编辑后所有参与者都收到一条变更通知（不含委托人）
  const targets = task.participants
    .map((p) => p.memberId)
    .filter((id) => id !== Number(me))
  if (targets.length) {
    pushNotices(task, targets, 'TASK_EDITED', [
      { label: '任务名称', value: task.title },
      { label: '委托人', value: memberOf(me).nickname },
      { label: '截止时间', value: fmtTime(task.deadline) },
      { label: '提示', value: '你收到的任务有改动，看一眼' },
    ])
  }

  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/participant\/add$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  if (task.creatorId !== Number(me)) return fail(ERR.NO_PERMISSION, '只有布置的人能操作')
  if (task.status !== TASK.PENDING && task.status !== TASK.SCHEDULED) {
    return fail(ERR.REPEAT, '已经开始了，加不了人')
  }

  const ids = (body.memberIds || []).map(Number)
  if (!ids.length) return fail(ERR.PARAM, '请选择要加的人')
  const strangers = ids.filter((id) => id !== Number(me) && !isFriend(me, id))
  if (strangers.length) return fail(ERR.NO_PERMISSION, 'TA 还不是你的好友')
  const dup = ids.filter((id) => isParticipant(task, id))
  if (dup.length) return fail(ERR.REPEAT, 'TA 已经在任务里了')
  if (task.participants.length + ids.length > 10) return fail(ERR.PARAM, '一条任务最多 10 个人')

  ids.forEach((id) => {
    task.participants.push(slot(id, P.PENDING))
    pushEvent(task, me, 5, '邀请', '邀请了 ' + memberOf(id).nickname)
  })
  bump(task)

  pushNotices(task, ids, 'TASK_ASSIGNED', [
    { label: '任务名称', value: task.title },
    { label: '委托人', value: memberOf(me).nickname },
    { label: '参与人数', value: '共 ' + task.participants.length + ' 人（' + MODE_DESC[task.completionMode] + '）' },
    { label: '截止时间', value: fmtTime(task.deadline) },
  ])
  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/accept$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  const p = participantOf(task, me)
  if (!p) return fail(ERR.NO_PERMISSION, '你不在这个任务里')
  if (p.status !== P.PENDING) return fail(ERR.REPEAT, '你已经处理过了')
  if (task.status !== TASK.PENDING && task.status !== TASK.IN_PROGRESS) {
    return fail(ERR.REPEAT, '任务已经不在可接受状态')
  }
  p.status = P.ACCEPTED
  bump(task)
  pushEvent(task, me, 2, '接受', '接受了任务')
  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/reject$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  const p = participantOf(task, me)
  if (!p) return fail(ERR.NO_PERMISSION, '你不在这个任务里')
  if (p.status !== P.PENDING) return fail(ERR.REPEAT, '你已经处理过了')
  const reason = String(body.reason || '').trim()
  if (!reason) return fail(ERR.PARAM, '说一句为什么吧')
  p.status = P.REJECTED
  p.rejectReason = reason.slice(0, 100)
  bump(task)
  pushEvent(task, me, 4, '拒绝', '拒绝了任务：' + reason)
  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/complete$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  const p = participantOf(task, me)
  if (!p) return fail(ERR.NO_PERMISSION, '你不在这个任务里')
  if (p.status === P.DONE) return fail(ERR.REPEAT, '你已经完成过了')
  if (p.status !== P.ACCEPTED) return fail(ERR.REPEAT, '先接受任务才能完成')

  const images = body.images || []
  if (images.length > 3) return fail(ERR.PARAM, '最多 3 张凭证')

  p.status = P.DONE
  p.completeTime = Date.now()
  p.completeRemark = String(body.remark || '').slice(0, 200)
  p.completeImages = images

  if (task.completionMode === MODE.ANY) {
    task.participants.forEach((x) => {
      if (x.memberId !== Number(me) && (x.status === P.PENDING || x.status === P.ACCEPTED)) {
        x.status = P.SKIPPED
      }
    })
  }
  bump(task)

  const who = memberOf(me).nickname
  pushEvent(task, me, 3, '完成', '完成了自己那份' + (p.completeRemark ? '：' + p.completeRemark : ''))

  const allDone = task.participants.every((x) => x.status === P.DONE || x.status === P.SKIPPED)
  if (task.creatorId !== Number(me)) {
    pushNotices(task, [task.creatorId], allDone ? 'TASK_ALL_DONE' : 'TASK_COMPLETED', [
      { label: '任务名称', value: task.title },
      { label: '完成人', value: who },
      { label: '完成时间', value: fmtTime(Date.now()) },
      { label: '完成进度', value: task.participants.filter((x) => x.status === P.DONE).length + '/' + task.participants.length + ' 人已完成' },
    ])
  }
  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/cancel$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  if (task.creatorId !== Number(me)) return fail(ERR.NO_PERMISSION, '只有布置的人能操作')
  if (
    task.status !== TASK.SCHEDULED &&
    task.status !== TASK.PENDING &&
    task.status !== TASK.IN_PROGRESS
  ) {
    return fail(ERR.REPEAT, '这个任务已经结束了')
  }
  task.status = TASK.CANCELLED
  task.updateTime = Date.now()
  pushEvent(task, me, 6, '撤回', '撤回了任务')

  // 撤回要通知全部参与者（不含委托人）
  const targets = task.participants.map((p) => p.memberId).filter((id) => id !== Number(me))
  if (targets.length) {
    pushNotices(task, targets, 'TASK_CANCELLED', [
      { label: '任务名称', value: task.title },
      { label: '委托人', value: memberOf(me).nickname },
      { label: '撤回时间', value: fmtTime(task.updateTime) },
      { label: '提示', value: '委托人撤回了这条任务，不用再做了' },
    ])
  }
  return ok(detailVO(task, me))
})

route('POST', /^\/api\/task\/remind$/, ({ me, body }) => {
  const task = state.tasks.find((t) => t.taskId === Number(body.taskId))
  if (!task) return fail(ERR.NOT_EXIST, '任务不存在')
  if (task.creatorId !== Number(me)) return fail(ERR.NO_PERMISSION, '只有布置的人能操作')
  if (task.status !== TASK.PENDING && task.status !== TASK.IN_PROGRESS) {
    return fail(ERR.REPEAT, '这个任务不用催了')
  }
  const last = state.remindAt[task.taskId] || 0
  if (Date.now() - last < 60 * 1000) return fail(ERR.REPEAT, '刚催过啦，TA 马上就看得到')
  state.remindAt[task.taskId] = Date.now()

  const waiting = task.participants.filter((p) => p.status !== P.DONE && p.status !== P.SKIPPED)
  pushEvent(task, me, 7, '提醒', '提醒了 ' + waiting.length + ' 人')
  pushNotices(task, waiting.map((p) => p.memberId), 'TASK_REMIND', [
    { label: '任务名称', value: task.title },
    { label: '委托人', value: memberOf(me).nickname },
    { label: '截止时间', value: fmtTime(task.deadline) },
    { label: '提示', value: '对方在等你了' },
  ])
  return ok(detailVO(task, me))
})

/* 好友 */

route('GET', /^\/api\/friend\/list$/, ({ me, query }) => {
  let rows = state.friends
    .filter((f) => f.memberId === Number(me))
    .map((f) => {
      const u = userVO(f.friendMemberId)
      const active = state.tasks.filter(
        (t) =>
          (t.status === TASK.SCHEDULED || t.status === TASK.PENDING || t.status === TASK.IN_PROGRESS) &&
          ((t.creatorId === Number(me) && isParticipant(t, f.friendMemberId)) ||
            (t.creatorId === f.friendMemberId && isParticipant(t, me)))
      ).length
      const related = state.tasks
        .filter((t) => t.creatorId === f.friendMemberId || isParticipant(t, f.friendMemberId))
        .sort((a, b) => b.updateTime - a.updateTime)[0]
      return {
        friendId: f.friendId,
        memberId: f.friendMemberId,
        nickname: u.nickname,
        avatar: u.avatar,
        remark: f.remark || '',
        displayName: f.remark || u.nickname,
        activeTaskCount: active,
        lastActiveTime: fmtTime(related ? related.updateTime : f.createTime),
      }
    })
    .sort((a, b) => parseTime(b.lastActiveTime) - parseTime(a.lastActiveTime))

  if (query.keyword) {
    const kw = String(query.keyword)
    rows = rows.filter((r) => r.nickname.indexOf(kw) >= 0 || r.remark.indexOf(kw) >= 0)
  }
  return ok(rows)
})

route('GET', /^\/api\/friend\/request\/list$/, ({ me }) => {
  return ok(
    state.requests
      .filter((r) => r.toMemberId === Number(me) && r.status === 0)
      .map((r) => ({
        requestId: r.requestId,
        fromMember: userVO(r.fromMemberId),
        applyMessage: r.applyMessage,
        createTime: fmtTime(r.createTime),
      }))
  )
})

route('POST', /^\/api\/friend\/request\/add$/, ({ me, body }) => {
  const to = Number(body.toMemberId)
  if (!to) return fail(ERR.PARAM, '请选择好友')
  if (to === Number(me)) return fail(ERR.PARAM, '不能加自己为好友')
  if (isFriend(me, to)) return fail(ERR.REPEAT, '你们已经是好友了')
  const dup = state.requests.find(
    (r) => r.fromMemberId === Number(me) && r.toMemberId === to && r.status === 0
  )
  if (dup) return fail(ERR.REPEAT, '请求已发出，等 TA 确认')
  state.requests.push({
    requestId: state.nextId(), fromMemberId: Number(me), toMemberId: to,
    applyMessage: String(body.applyMessage || '').slice(0, 30), status: 0, createTime: Date.now(),
  })
  return ok('已发出')
})

function handleRequest(me, requestId, status) {
  const r = state.requests.find((x) => x.requestId === Number(requestId))
  if (!r) return fail(ERR.NOT_EXIST, '请求不存在')
  if (r.toMemberId !== Number(me)) return fail(ERR.NO_PERMISSION, '只能处理发给自己的请求')
  if (r.status !== 0) return fail(ERR.REPEAT, '该请求已处理')
  r.status = status
  if (status === 1) addFriend(me, r.fromMemberId)
  return ok(status === 1 ? '已加为好友' : '已拒绝')
}

route('POST', /^\/api\/friend\/request\/accept$/, ({ me, body }) => handleRequest(me, body.requestId, 1))
route('POST', /^\/api\/friend\/request\/reject$/, ({ me, body }) => handleRequest(me, body.requestId, 2))

route('GET', /^\/api\/friend\/invite$/, ({ me }) => {
  const m = memberOf(me)
  return ok({ inviteCode: m.inviteCode, sharePath: '/pages/launch/index?invite=' + m.inviteCode })
})

route('POST', /^\/api\/friend\/invite\/accept$/, ({ me, body }) => {
  const code = String(body.inviteCode || '').trim().toUpperCase()
  const target = state.members.find((m) => m.inviteCode === code)
  if (!target) return fail(ERR.NOT_EXIST, '邀请码不存在')
  if (target.memberId === Number(me)) return fail(ERR.PARAM, '不能加自己为好友')
  if (isFriend(me, target.memberId)) return fail(ERR.PARAM, '你们已经是好友了')
  addFriend(me, target.memberId)
  return ok('已加上 ' + target.nickname)
})

route('POST', /^\/api\/friend\/remove$/, ({ me, body }) => {
  const row = state.friends.find((f) => f.friendId === Number(body.friendId))
  if (!row) return fail(ERR.NOT_EXIST, '好友关系不存在')
  if (row.memberId !== Number(me)) return fail(ERR.NO_PERMISSION, '只能解除自己的好友')
  const other = row.friendMemberId
  state.friends = state.friends.filter(
    (f) =>
      !(
        (f.memberId === Number(me) && f.friendMemberId === other) ||
        (f.memberId === other && f.friendMemberId === Number(me))
      )
  )
  return ok('已解除')
})

function addFriend(a, b) {
  if (isFriend(a, b)) return
  state.friends.push({ friendId: state.nextId(), memberId: Number(a), friendMemberId: Number(b), remark: '', createTime: Date.now() })
  state.friends.push({ friendId: state.nextId(), memberId: Number(b), friendMemberId: Number(a), remark: '', createTime: Date.now() })
}

/* 服务通知 */

route('POST', /^\/api\/notice\/query$/, ({ me, body }) => {
  let rows = state.notices.filter((n) => n.toMemberId === Number(me))
  if (body.unreadFlag) rows = rows.filter((n) => !n.readFlag)

  const pageNum = Math.max(Number(body.pageNum) || 1, 1)
  const pageSize = Math.min(Number(body.pageSize) || 20, 500)
  const slice = rows.slice((pageNum - 1) * pageSize, pageNum * pageSize)

  return ok({
    pageNum,
    pageSize,
    total: rows.length,
    pages: Math.ceil(rows.length / pageSize),
    list: slice.map((n) => ({
      noticeId: n.noticeId,
      taskId: n.taskId,
      templateKey: n.templateKey,
      title: n.title,
      fields: n.fields,
      readFlag: n.readFlag,
      createTime: fmtTime(n.createTime),
    })),
    unreadCount: state.notices.filter((n) => n.toMemberId === Number(me) && !n.readFlag).length,
  })
})

route('GET', /^\/api\/notice\/unread-count$/, ({ me }) => {
  return ok(state.notices.filter((n) => n.toMemberId === Number(me) && !n.readFlag).length)
})

route('POST', /^\/api\/notice\/read$/, ({ me, body }) => {
  const ids = (body.noticeIds || []).map(Number)
  state.notices.forEach((n) => {
    if (n.toMemberId !== Number(me)) return
    if (body.allFlag || ids.indexOf(n.noticeId) >= 0) n.readFlag = true
  })
  return ok(state.notices.filter((n) => n.toMemberId === Number(me) && !n.readFlag).length)
})

/* 订阅消息（与 sa-app 的 /api/subscribe 对齐） */

/**
 * 契约替身里模板 id 一律为空（对应后端「模板审核中」的真实状态）：
 * list 返回 4 条 configured=false，record 记账成功但不下发。
 */
route('GET', /^\/api\/subscribe\/list$/, () =>
  ok(
    ['TASK_ASSIGNED', 'TASK_REMIND', 'TASK_COMPLETED', 'TASK_ALL_DONE'].map((templateKey) => ({
      templateKey,
      templateId: '',
      configured: false,
      remainCount: 0,
      status: 0,
    }))
  )
)

route('POST', /^\/api\/subscribe\/record$/, () => ok(''))

/* ---------------- 服务 ---------------- */

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      if (!raw) return resolve(null)
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        resolve(null)
      }
    })
  })
}

function tokenOf(req) {
  const header = req.headers['app-token'] || ''
  const value = String(header).trim()
  return value.indexOf('Bearer ') === 0 ? value.slice(7) : value
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost')
  const body = req.method === 'GET' ? null : await readBody(req)

  const query = {}
  url.searchParams.forEach((v, k) => (query[k] = v))

  let matched = null
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i]
    if (r.method !== req.method) continue
    const m = url.pathname.match(r.pattern)
    if (!m) continue
    matched = { r, params: m.slice(1) }
    break
  }

  if (!matched) {
    res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' })
    return res.end(JSON.stringify(fail(40400, '接口不存在: ' + req.method + ' ' + url.pathname)))
  }

  const token = tokenOf(req)
  const me = state.tokens[token]

  if (matched.r.needLogin && !me) {
    res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' })
    return res.end(JSON.stringify(fail(ERR.LOGIN, '您还未登录或登录失效，请重新登录！')))
  }

  let result
  try {
    result = matched.r.handler({ me, body, query, params: matched.params })
  } catch (e) {
    result = fail(50000, '服务开小差了：' + e.message)
  }

  res.writeHead(200, { 'Content-Type': 'application/json;charset=utf-8' })
  res.end(JSON.stringify(result))
}

/**
 * 启动契约服务
 * @param {{port?:number}} options
 * @returns {Promise<{port:number, close:Function, reset:Function}>}
 */
function start(options) {
  const port = options && options.port != null ? options.port : DEFAULT_PORT
  state = seed()

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      res.writeHead(500, { 'Content-Type': 'application/json;charset=utf-8' })
      res.end(JSON.stringify(fail(50000, e.message)))
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        close: () => new Promise((r) => server.close(r)),
        reset: () => {
          state = seed()
        },
        // 自检脚本要模拟「还没设定昵称头像的新用户」
        getState: () => state,
      })
    })
  })
}

module.exports = { start }

if (require.main === module) {
  start().then((s) => {
    console.log('契约服务已启动：http://127.0.0.1:' + s.port)
    console.log('鉴权头：App-Token: Bearer <token>，先 POST /api/auth/login')
    console.log('仅用于前端自测；真实联调请启动 sa-app（同一端口）。')
  })
}
