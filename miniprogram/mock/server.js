/**
 * Mock 服务端：把 services 里的领域调用映射成「和真实后端一致」的响应信封。
 * 关闭 Mock 后（config.ENV = 'dev'），本文件不再被加载。
 *
 * 聚合状态、权限位、每人完成状态全部在本层计算，前端只读——
 * 与后端约定一致，避免两端规则漂移。
 */
const config = require('../config/index')
const db = require('./db')

const ME = db.ME
const LIMIT = 10

/* ---------------- 工具 ---------------- */

const delay = () =>
  new Promise((r) =>
    setTimeout(r, config.MOCK.LATENCY_MIN + Math.random() * (config.MOCK.LATENCY_MAX - config.MOCK.LATENCY_MIN))
  )

const ok = (data) => ({ code: 0, message: 'ok', data: data === undefined ? null : data, traceId: 'mock' })
const fail = (code, message, field) => ({ code, message, field, traceId: 'mock' })

function parse(url) {
  const [path, qs] = url.split('?')
  const query = {}
  if (qs) {
    qs.split('&').forEach((kv) => {
      const [k, v] = kv.split('=')
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '')
    })
  }
  return { path, query }
}

function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.floor(Math.random() * 1000)
}

function nowIso() {
  return new Date().toISOString()
}

/* ---------------- 视图组装 ---------------- */

function briefParticipant(p) {
  const u = db.briefUser(p.userId)
  return {
    userId: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    status: p.status,
    completedAt: p.completedAt,
    remark: p.remark || '',
    images: p.images || [],
    rejectReason: p.rejectReason || '',
  }
}

function progressOf(task) {
  const ps = task.participants || []
  return {
    total: ps.length,
    done: ps.filter((p) => p.status === 'done').length,
    accepted: ps.filter((p) => p.status === 'accepted' || p.status === 'done').length,
    rejected: ps.filter((p) => p.status === 'rejected').length,
    skipped: ps.filter((p) => p.status === 'skipped').length,
  }
}

function toListItem(task, me) {
  const iAmParticipant = db.isParticipant(task, me)
  const role = iAmParticipant ? 'assignee' : 'creator'
  const mine = iAmParticipant ? task.participants.find((p) => p.userId === me) : null
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    isOverdue: db.isOverdue(task),
    deadline: task.deadline,
    role,
    completionMode: task.completionMode,
    participantCount: task.participants.length,
    progress: progressOf(task),
    participants: task.participants.slice(0, 4).map(briefParticipant),
    counterpart: db.briefUser(task.creatorId),
    myStatus: mine ? mine.status : null,
    hasProof: task.participants.some((p) => (p.images || []).length > 0),
    updatedAt: task.updatedAt,
  }
}

function toDetail(task, me) {
  const mine = task.participants.find((p) => p.userId === me) || null
  const isCreator = task.creatorId === me
  const active = ['pending', 'in_progress'].includes(task.status)
  const mineActionable = !!mine && task.status !== 'scheduled' && task.status !== 'completed'

  return {
    id: task.id,
    title: task.title,
    description: task.description || '',
    creator: db.briefUser(task.creatorId),
    participants: task.participants.map(briefParticipant),
    completionMode: task.completionMode,
    progress: progressOf(task),
    status: task.status,
    startAt: task.startAt || null,
    deadline: task.deadline,
    remindType: task.remindType,
    remindMinutes: task.remindMinutes,
    isOverdue: db.isOverdue(task),

    // 我在这条任务里的身份与操作权限
    me: mine
      ? {
          userId: mine.userId,
          status: mine.status,
          completedAt: mine.completedAt,
          remark: mine.remark || '',
          canAccept: mine.status === 'pending' && active,
          canReject: mine.status === 'pending' && active,
          canComplete: mine.status === 'accepted' && active,
        }
      : null,
    isCreator,
    canCancel: isCreator && active,
    canRemind: isCreator && active,
    canAddParticipant: isCreator && ['pending', 'scheduled'].includes(task.status) && task.participants.length < 10,
    canEdit: isCreator && ['pending', 'scheduled'].includes(task.status),

    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    events: db.state.events
      .filter((e) => e.taskId === task.id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((e) => ({
        id: e.id,
        type: e.type,
        text: e.text,
        actor: e.actorId ? db.briefUser(e.actorId) : null,
        createdAt: e.createdAt,
      })),
  }
}

function toFriend(f, me) {
  const otherId = f.friendUserId === me ? f.userId : f.friendUserId
  const u = db.briefUser(otherId)
  const activeCount = db.state.tasks.filter(
    (t) =>
      ['scheduled', 'pending', 'in_progress'].includes(t.status) &&
      ((t.creatorId === me && db.isParticipant(t, otherId)) ||
        (t.creatorId === otherId && db.isParticipant(t, me)))
  ).length
  const last = db.state.tasks
    .filter((t) => t.creatorId === otherId || db.isParticipant(t, otherId))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]
  return {
    id: f.id,
    userId: u.id,
    nickname: u.nickname,
    avatarUrl: u.avatarUrl,
    remark: f.remark || '',
    activeTaskCount: activeCount,
    lastActiveAt: last ? last.updatedAt : f.createdAt,
    createdAt: f.createdAt,
  }
}

function findTask(id) {
  return db.state.tasks.find((t) => t.id === id)
}

function pushEvent(taskId, actorId, type, text) {
  db.state.events.push({ id: uid('e'), taskId, actorId, type, text, createdAt: nowIso() })
}

function pushMessage(taskId, templateKey, title, fields, toUserIds) {
  const targets = (Array.isArray(toUserIds) ? toUserIds : [toUserIds]).filter(Boolean)
  targets.forEach((toUserId) => {
    db.state.messages.unshift({
      id: uid('m'),
      taskId,
      templateKey,
      title,
      fields,
      toUserId,
      read: false,
      createdAt: nowIso(),
    })
  })
}

/** 状态变更后统一重算聚合状态 + 更新时间 */
function recalc(task) {
  task.status = db.aggregate(task)
  task.updatedAt = nowIso()
  return task
}

function guardTask(id, me, needCreator) {
  const t = findTask(id)
  if (!t) return { error: fail(40400, '任务不存在或已被删除') }
  const isMine = t.creatorId === me || db.isParticipant(t, me)
  if (!isMine) return { error: fail(40300, '这不是你的任务') }
  if (needCreator && t.creatorId !== me) return { error: fail(40300, '只有布置的人能操作') }
  return { task: t }
}

function mySlot(t, me) {
  return t.participants.find((p) => p.userId === me) || null
}

/* ---------------- 路由表 ---------------- */

const routes = [
  /* 认证与资料 */
  ['POST', /^\/auth\/login$/, ({ data }) => {
    if (!data || !data.code) return fail(42200, '缺少 code', 'code')
    const me = db.user(ME)
    return ok({
      accessToken: 'mock_token_' + Date.now(),
      refreshToken: 'mock_refresh_' + Date.now(),
      user: Object.assign({}, me, { stats: db.stats(ME) }),
    })
  }],

  ['GET', /^\/users\/me$/, () => {
    const me = db.user(ME)
    return ok(Object.assign({}, me, { stats: db.stats(ME) }))
  }],

  ['PATCH', /^\/users\/me$/, ({ data }) => {
    const me = db.user(ME)
    if (data.nickname) {
      if (data.nickname.length > 20) return fail(42200, '昵称最多 20 个字', 'nickname')
      me.nickname = data.nickname
    }
    if (data.avatarUrl !== undefined) me.avatarUrl = data.avatarUrl
    return ok(Object.assign({}, me, { stats: db.stats(ME) }))
  }],

  /* 服务通知 */
  ['GET', /^\/messages$/, ({ query }) => {
    const offset = Number(query.offset || 0)
    const all = db.state.messages.filter((m) => m.toUserId === ME)
    const slice = all.slice(offset, offset + LIMIT)
    const nextOffset = offset + slice.length
    return ok({
      list: slice,
      unreadCount: all.filter((m) => !m.read).length,
      nextCursor: nextOffset < all.length ? 'o_' + nextOffset : null,
      hasMore: nextOffset < all.length,
    })
  }],

  ['POST', /^\/messages\/read$/, ({ data }) => {
    const ids = (data && data.ids) || null
    db.state.messages.forEach((m) => {
      if (m.toUserId !== ME) return
      if (!ids || ids.indexOf(m.id) >= 0) m.read = true
    })
    return ok({ unreadCount: db.state.messages.filter((m) => m.toUserId === ME && !m.read).length })
  }],

  /* 好友 */
  ['GET', /^\/friends\/invite$/, () => {
    const me = db.user(ME)
    return ok({ inviteCode: me.inviteCode, sharePath: '/pages/launch/index?invite=' + me.inviteCode })
  }],

  ['GET', /^\/friends\/requests$/, () => {
    const list = db.state.friendRequests
      .filter((r) => r.toUserId === ME && r.status === 'pending')
      .map((r) => ({
        id: r.id,
        fromUser: db.briefUser(r.fromUserId),
        message: r.message,
        status: r.status,
        createdAt: r.createdAt,
      }))
    return ok({ list, nextCursor: null, hasMore: false })
  }],

  ['POST', /^\/friends\/requests$/, ({ data }) => {
    if (!data || !data.toUserId) return fail(42200, '请选择好友', 'toUserId')
    if (db.friendIds(ME).includes(data.toUserId)) return fail(40900, '你们已经是好友了')
    const dup = db.state.friendRequests.find(
      (r) => r.fromUserId === ME && r.toUserId === data.toUserId && r.status === 'pending'
    )
    if (dup) return fail(40900, '请求已发出，等 TA 确认')
    const req = {
      id: uid('r'),
      fromUserId: ME,
      toUserId: data.toUserId,
      message: (data.message || '').slice(0, 30),
      status: 'pending',
      createdAt: nowIso(),
    }
    db.state.friendRequests.push(req)
    return ok({ id: req.id, status: req.status })
  }],

  ['POST', /^\/friends\/requests\/([^/]+)\/accept$/, ({ params }) => {
    const req = db.state.friendRequests.find((r) => r.id === params[0])
    if (!req) return fail(40400, '请求不存在')
    if (req.status !== 'pending') return fail(40900, '该请求已处理')
    req.status = 'accepted'
    addFriend(ME, req.fromUserId)
    return ok({ success: true })
  }],

  ['POST', /^\/friends\/requests\/([^/]+)\/reject$/, ({ params }) => {
    const req = db.state.friendRequests.find((r) => r.id === params[0])
    if (!req) return fail(40400, '请求不存在')
    req.status = 'rejected'
    return ok({ success: true })
  }],

  ['POST', /^\/friends\/invite\/accept$/, ({ data }) => {
    const code = ((data && data.code) || '').trim().toUpperCase()
    const target = db.USERS.find((u) => u.inviteCode === code)
    if (!target) return fail(40400, '邀请码不存在')
    if (target.id === ME) return fail(42200, '不能加自己为好友')
    addFriend(ME, target.id)
    return ok({ friend: db.briefUser(target.id) })
  }],

  ['GET', /^\/friends$/, ({ query }) => {
    let list = db.state.friends.filter((f) => f.userId === ME).map((f) => toFriend(f, ME))
    if (query.keyword) {
      const kw = query.keyword
      list = list.filter((f) => f.nickname.includes(kw) || f.remark.includes(kw))
    }
    list.sort((a, b) => new Date(b.lastActiveAt) - new Date(a.lastActiveAt))
    return ok({ list, nextCursor: null, hasMore: false })
  }],

  ['DELETE', /^\/friends\/([^/]+)$/, ({ params }) => {
    const f = db.state.friends.find((x) => x.id === params[0] && x.userId === ME)
    if (!f) return fail(40400, '好友不存在')
    const other = f.friendUserId
    db.state.friends = db.state.friends.filter(
      (x) => !((x.userId === ME && x.friendUserId === other) || (x.userId === other && x.friendUserId === ME))
    )
    return ok({ success: true })
  }],

  /* 任务 */
  ['GET', /^\/tasks\/stats$/, () => ok(db.stats(ME))],

  /** 首页摘要：等我回应的 / 我派出的 / 逾期，供液态玻璃 banner 与分段角标使用 */
  ['GET', /^\/tasks\/summary$/, () => {
    const mine = db.state.tasks.filter((t) => db.isParticipant(t, ME))
    const actionable = mine.filter((t) => {
      const p = t.participants.find((x) => x.userId === ME)
      return p && (p.status === 'pending' || p.status === 'accepted') &&
        ['pending', 'in_progress'].includes(t.status)
    })
    const sentActive = db.state.tasks.filter(
      (t) => t.creatorId === ME && ['scheduled', 'pending', 'in_progress'].includes(t.status)
    )
    const overdue = mine.filter((t) => db.isOverdue(t)).length

    const seen = {}
    const waitingUsers = []
    actionable.forEach((t) => {
      const u = db.briefUser(t.creatorId)
      if (!seen[u.id] && u.id !== ME) {
        seen[u.id] = 1
        waitingUsers.push(u)
      }
    })

    return ok({
      assignee: actionable.length,
      creator: sentActive.length,
      overdue,
      waitingUsers: waitingUsers.slice(0, 3),
      overdueTitle: actionable.length ? '' : '',
    })
  }],

  ['GET', /^\/tasks$/, ({ query }) => {
    const role = query.role === 'creator' ? 'creator' : 'assignee'
    const status = query.status || 'all'
    const offset = Number(query.offset || 0)

    let list = db.state.tasks.filter((t) =>
      role === 'creator' ? t.creatorId === ME : db.isParticipant(t, ME)
    )
    if (status !== 'all') {
      if (status === 'overdue') {
        list = list.filter((t) => db.isOverdue(t))
      } else {
        list = list.filter((t) => t.status === status)
      }
    }
    list = list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))

    const slice = list.slice(offset, offset + LIMIT).map((t) => toListItem(t, ME))
    const nextOffset = offset + slice.length
    return ok({
      list: slice,
      nextCursor: nextOffset < list.length ? 'o_' + nextOffset : null,
      hasMore: nextOffset < list.length,
    })
  }],

  ['GET', /^\/tasks\/([^/]+)$/, ({ params }) => {
    const { task, error } = guardTask(params[0], ME, false)
    if (error) return error
    return ok(toDetail(task, ME))
  }],

  ['POST', /^\/tasks$/, ({ data }) => {
    if (!data) return fail(42200, '缺少参数')
    const title = (data.title || '').trim()
    if (!title) return fail(42200, '写一句要做什么吧', 'title')
    if (title.length > 30) return fail(42200, '标题最多 30 个字', 'title')

    const ids = Array.isArray(data.participantIds) ? data.participantIds : []
    if (!ids.length) return fail(42200, '至少选一个人', 'participantIds')
    if (ids.length > 10) return fail(42200, '一条任务最多 10 个人', 'participantIds')
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dup.length) return fail(42200, '同一个人只能选一次', 'participantIds')
    const strangers = ids.filter((id) => id !== ME && !db.friendIds(ME).includes(id))
    if (strangers.length) return fail(40300, '有参与者还不是你的好友')

    if (!data.deadline) return fail(42200, '请选择截止时间', 'deadline')
    if (new Date(data.deadline).getTime() < Date.now() - 60 * 1000) {
      return fail(42200, '截止时间不能早于现在', 'deadline')
    }

    const mode = data.completionMode === 'all' ? 'all' : 'any'
    const startAt = data.startAt || null
    const task = {
      id: uid('t'),
      title,
      description: (data.description || '').slice(0, 200),
      creatorId: ME,
      participants: ids.map((id) => ({
        userId: id,
        status: 'pending',
        completedAt: null,
        remark: '',
        images: [],
        rejectReason: '',
      })),
      completionMode: mode,
      status: 'pending',
      startAt,
      deadline: data.deadline,
      remindType: data.remindType || 'none',
      remindMinutes: data.remindMinutes || 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    db.state.tasks.unshift(task)
    recalc(task)

    pushEvent(task.id, ME, 'created', '布置了任务')
    if (ids.length > 1) pushEvent(task.id, ME, 'invited', `邀请了 ${ids.length} 人`)

    pushMessage(task.id, 'TASK_ASSIGNED', '任务委托通知', [
      { label: '任务名称', value: task.title },
      { label: '委托人', value: db.briefUser(ME).nickname },
      { label: '参与人数', value: `${ids.length} 人（${mode === 'all' ? '需全员完成' : '任一人完成'}）` },
      { label: '截止时间', value: db.fmtCn(new Date(task.deadline).getTime()) },
    ], ids.filter((id) => id !== ME))
    return ok(toDetail(task, ME))
  }],

  ['PATCH', /^\/tasks\/([^/]+)$/, ({ params, data }) => {
    const { task: t, error } = guardTask(params[0], ME, true)
    if (error) return error
    if (!['pending', 'scheduled'].includes(t.status)) return fail(40900, 'TA 已经接了，改不了了')
    if (data.title !== undefined) t.title = String(data.title).slice(0, 30)
    if (data.description !== undefined) t.description = String(data.description).slice(0, 200)
    if (data.deadline) t.deadline = data.deadline
    if (data.remindType) t.remindType = data.remindType
    if (data.remindMinutes !== undefined) t.remindMinutes = data.remindMinutes
    if (data.completionMode) t.completionMode = data.completionMode === 'all' ? 'all' : 'any'
    return ok(toDetail(recalc(t), ME))
  }],

  /** 追加参与者（仅布置者，且尚未被接受） */
  ['POST', /^\/tasks\/([^/]+)\/participants$/, ({ params, data }) => {
    const { task: t, error } = guardTask(params[0], ME, true)
    if (error) return error
    if (!['pending', 'scheduled'].includes(t.status)) return fail(40900, '已经开始了，加不了人')
    const id = data && data.userId
    if (!id) return fail(42200, '请选择要加的人', 'userId')
    if (id !== ME && !db.friendIds(ME).includes(id)) return fail(40300, 'TA 还不是你的好友')
    if (db.isParticipant(t, id)) return fail(40900, 'TA 已经在任务里了')
    if (t.participants.length >= 10) return fail(42200, '一条任务最多 10 个人')
    t.participants.push({
      userId: id, status: 'pending', completedAt: null, remark: '', images: [], rejectReason: '',
    })
    pushEvent(t.id, ME, 'invited', `邀请了 ${db.briefUser(id).nickname}`)
    return ok(toDetail(recalc(t), ME))
  }],

  ['POST', /^\/tasks\/([^/]+)\/accept$/, ({ params }) => {
    const { task: t, error } = guardTask(params[0], ME, false)
    if (error) return error
    const slot = mySlot(t, ME)
    if (!slot) return fail(40300, '你不在这个任务里')
    if (slot.status !== 'pending') return fail(40900, '你已经处理过了')
    if (!['pending', 'in_progress'].includes(t.status)) return fail(40900, '任务已经不在可接受状态')

    slot.status = 'accepted'
    recalc(t)
    pushEvent(t.id, ME, 'accepted', '接受了任务')
    return ok(toDetail(t, ME))
  }],

  ['POST', /^\/tasks\/([^/]+)\/reject$/, ({ params, data }) => {
    const { task: t, error } = guardTask(params[0], ME, false)
    if (error) return error
    const slot = mySlot(t, ME)
    if (!slot) return fail(40300, '你不在这个任务里')
    if (slot.status !== 'pending') return fail(40900, '你已经处理过了')
    const reason = ((data && data.reason) || '').trim()
    if (!reason) return fail(42200, '说一句为什么吧', 'reason')

    slot.status = 'rejected'
    slot.rejectReason = reason.slice(0, 100)
    recalc(t)
    pushEvent(t.id, ME, 'rejected', '拒绝了任务：' + slot.rejectReason)
    return ok(toDetail(t, ME))
  }],

  ['POST', /^\/tasks\/([^/]+)\/complete$/, ({ params, data }) => {
    const { task: t, error } = guardTask(params[0], ME, false)
    if (error) return error
    const slot = mySlot(t, ME)
    if (!slot) return fail(40300, '你不在这个任务里')
    if (slot.status === 'done') return fail(40900, '你已经完成过了')
    if (slot.status !== 'accepted') return fail(40900, '先接受任务才能完成')

    const images = (data && data.images) || []
    if (images.length > 3) return fail(42200, '最多 3 张凭证', 'images')

    slot.status = 'done'
    slot.completedAt = nowIso()
    slot.remark = ((data && data.remark) || '').slice(0, 200)
    slot.images = images

    // 「任一人完成即可」：其余未完成的人自动跳过
    if (t.completionMode === 'any') {
      t.participants.forEach((p) => {
        if (p.userId !== ME && (p.status === 'pending' || p.status === 'accepted')) p.status = 'skipped'
      })
    }

    recalc(t)
    const who = db.briefUser(ME).nickname
    pushEvent(t.id, ME, 'completed', '完成了自己那份' + (slot.remark ? '：' + slot.remark : ''))

    const isAllDone = t.participants.every((p) => p.status === 'done' || p.status === 'skipped')
    pushMessage(t.id, isAllDone ? 'TASK_ALL_DONE' : 'TASK_COMPLETED',
      isAllDone ? '全员完成通知' : '任务完成通知', [
        { label: '任务名称', value: t.title },
        { label: '完成人', value: who },
        { label: '完成时间', value: db.fmtCn(Date.now()) },
        { label: '完成进度', value: `${t.participants.filter((p) => p.status === 'done').length}/${t.participants.length} 人已完成` },
      ], t.creatorId !== ME ? t.creatorId : null)
    return ok(toDetail(t, ME))
  }],

  ['POST', /^\/tasks\/([^/]+)\/cancel$/, ({ params, data }) => {
    const { task: t, error } = guardTask(params[0], ME, true)
    if (error) return error
    if (!['scheduled', 'pending', 'in_progress'].includes(t.status)) return fail(40900, '这个任务已经结束了')
    t.status = 'cancelled'
    t.cancelReason = (data && data.reason) || ''
    t.updatedAt = nowIso()
    pushEvent(t.id, ME, 'cancelled', '撤回了任务')
    return ok(toDetail(t, ME))
  }],

  ['POST', /^\/tasks\/([^/]+)\/remind$/, ({ params }) => {
    const { task: t, error } = guardTask(params[0], ME, true)
    if (error) return error
    if (!['pending', 'in_progress'].includes(t.status)) return fail(40900, '这个任务不用催了')
    if (t.lastRemindAt && Date.now() - new Date(t.lastRemindAt).getTime() < 60 * 1000) {
      return fail(42900, '刚催过啦，TA 马上就看得到')
    }
    t.lastRemindAt = nowIso()

    const waiting = t.participants.filter((p) => p.status !== 'done' && p.status !== 'skipped')
    pushEvent(t.id, ME, 'reminded', `提醒了 ${waiting.length} 人`)
    pushMessage(t.id, 'TASK_REMIND', '任务到期提醒', [
      { label: '任务名称', value: t.title },
      { label: '委托人', value: db.briefUser(ME).nickname },
      { label: '截止时间', value: db.fmtCn(new Date(t.deadline).getTime()) },
      { label: '提示', value: '对方在等你了' },
    ], waiting.map((p) => p.userId))
    return ok({ success: true })
  }],

  /* 订阅消息授权记账 */
  ['POST', /^\/notify\/subscribe$/, ({ data }) => {
    db.state.notifyLog.push({
      id: uid('n'),
      taskId: null,
      toUserId: ME,
      templateKey: (data && data.templateKey) || 'unknown',
      status: data && data.accepted ? 'granted' : 'denied',
      sentAt: nowIso(),
    })
    return ok({ success: true })
  }],
]

function addFriend(a, b) {
  const s = db.state
  const has = s.friends.some((f) => f.userId === a && f.friendUserId === b)
  if (has) return
  s.friends.push({ id: uid('f'), userId: a, friendUserId: b, remark: '', createdAt: nowIso() })
  s.friends.push({ id: uid('f'), userId: b, friendUserId: a, remark: '', createdAt: nowIso() })
}

/* ---------------- 入口 ---------------- */

async function handle({ url, method = 'GET', data }) {
  await delay()

  if (Math.random() < (config.MOCK.FAULT_RATE || 0)) {
    throw Object.assign(new Error('网络不可用，请检查网络后重试'), { code: -1 })
  }

  const { path, query } = parse(url)

  for (let i = 0; i < routes.length; i++) {
    const [m, pattern, handler] = routes[i]
    if (m !== method) continue
    const match = path.match(pattern)
    if (!match) continue
    const params = match.slice(1).map(decodeURIComponent)
    return handler({ params, query, data })
  }

  return fail(40400, '接口不存在: ' + method + ' ' + path)
}

module.exports = { handle, reset: db.reset }
