/**
 * 任务领域服务
 *
 * 页面只调用这里的方法，不接触 URL、信封、枚举数值。
 * 后端接口见 letmedoit-api/docs/让我做-接口说明与联调.md 第 2.1 节。
 */
const { http } = require('../utils/request')
const adapt = require('./adapt')
const { resolveDisplayStatus, STATUS_FILTER_QUERY } = require('../constants/task')
const { apiTime } = require('../utils/format')

const PAGE_SIZE = 10

function decorate(item) {
  return Object.assign({}, item, { displayStatus: resolveDisplayStatus(item) })
}

/** 页面用 offset 游标，后端用 pageNum；这里换算，页面无感 */
function pageNumOf(cursor, limit) {
  const offset = Number(String(cursor || '').replace(/^o_/, ''))
  if (!offset || isNaN(offset)) return 1
  return Math.floor(offset / limit) + 1
}

function toIdList(ids) {
  return (ids || [])
    .map((v) => Number(v))
    .filter((v) => !isNaN(v) && v > 0)
}

/**
 * 任务列表
 * @param {{role:'assignee'|'creator', status?:string, cursor?:string, limit?:number}} params
 */
function list(params) {
  const p = params || {}
  const limit = p.limit || PAGE_SIZE
  const offset = Number(String(p.cursor || '').replace(/^o_/, '')) || 0
  const filter = STATUS_FILTER_QUERY[p.status] || {}

  const body = Object.assign(
    {
      role: p.role === 'creator' ? 2 : 1,
      pageNum: pageNumOf(p.cursor, limit),
      pageSize: limit,
    },
    filter
  )

  return http.post('/api/task/query', body).then((res) => {
    const rows = res.list || []
    const loaded = offset + rows.length
    const total = res.total || 0
    return {
      list: rows.map((row) => decorate(adapt.listItem(row))),
      nextCursor: loaded < total ? 'o_' + loaded : '',
      hasMore: loaded < total,
      total,
    }
  })
}

function detail(id) {
  return http.get('/api/task/get/' + id).then((res) => decorate(adapt.detail(res)))
}

/**
 * 布置任务
 * @param {{title:string, description?:string, participantIds:string[],
 *          completionMode:'any'|'all', deadline:string, startAt?:string,
 *          remindMinutes?:number}} dto
 */
function create(dto) {
  const body = {
    title: dto.title,
    description: dto.description || '',
    memberIds: toIdList(dto.participantIds),
    completionMode: dto.completionMode === 'any' ? 1 : 2,
    deadline: apiTime(dto.deadline),
    startTime: dto.startAt ? apiTime(dto.startAt) : null,
    remindMinutes: dto.remindMinutes || 0,
  }
  return http.post('/api/task/add', body, { loading: '布置中…' }).then((res) => decorate(adapt.detail(res)))
}

/**
 * 编辑任务
 * @param {string} id
 * @param {{title?:string, description?:string, completionMode?:string,
 *          deadline?:string, remindMinutes?:number}} dto
 */
function update(id, dto) {
  const body = { taskId: Number(id) }
  if (dto.title !== undefined) body.title = dto.title
  if (dto.description !== undefined) body.description = dto.description
  if (dto.completionMode !== undefined) body.completionMode = dto.completionMode === 'any' ? 1 : 2
  if (dto.deadline) body.deadline = apiTime(dto.deadline)
  if (dto.remindMinutes !== undefined) body.remindMinutes = dto.remindMinutes
  return http.post('/api/task/update', body).then((res) => decorate(adapt.detail(res)))
}

/** 追加参与者（布置者，任务尚未被接受） */
function addParticipants(id, memberIds) {
  return http
    .post('/api/task/participant/add', {
      taskId: Number(id),
      memberIds: toIdList(memberIds),
    })
    .then((res) => decorate(adapt.detail(res)))
}

/** 我接受这条任务里的自己那份 */
function accept(id) {
  return http
    .post('/api/task/accept', { taskId: Number(id) })
    .then((res) => decorate(adapt.detail(res)))
}

function reject(id, reason) {
  return http
    .post('/api/task/reject', { taskId: Number(id), reason: reason || '' })
    .then((res) => decorate(adapt.detail(res)))
}

/** 完成自己那份；多人任务下不影响其他人 */
function complete(id, payload) {
  const body = payload || {}
  return http
    .post('/api/task/complete', {
      taskId: Number(id),
      remark: body.remark || '',
      images: body.images || [],
    })
    .then((res) => decorate(adapt.detail(res)))
}

/** 撤回（后端不接受撤回理由，只有 taskId） */
function cancel(id) {
  return http
    .post('/api/task/cancel', { taskId: Number(id) })
    .then((res) => decorate(adapt.detail(res)))
}

/** 催一下，后端返回最新详情 */
function remind(id) {
  return http
    .post('/api/task/remind', { taskId: Number(id) })
    .then((res) => decorate(adapt.detail(res)))
}

/** 我的统计：布置/参与/完成/准时率/好友数 */
function stats() {
  return http.get('/api/task/stats').then((res) => ({
    sentCount: res.sentCount || 0,
    receivedCount: res.receivedCount || 0,
    completedCount: res.completedCount || 0,
    onTimeCount: res.onTimeCount || 0,
    onTimeRate: res.onTimeRate == null ? 0 : Number(res.onTimeRate),
    friendCount: res.friendCount || 0,
  }))
}

/** 首页摘要：等我回应的、我派出的、逾期、在等我的人 */
function summary() {
  return http.get('/api/task/summary').then((res) => ({
    assignee: res.assigneeCount || 0,
    creator: res.creatorCount || 0,
    overdue: res.overdueCount || 0,
    waitingUsers: (res.waitingUsers || []).map(adapt.user),
  }))
}

/* ---------------- 展示层派生（不改数据） ---------------- */

/** 参与者头像堆叠最多显示几个，多余进 +N */
const AVATAR_MAX = 3

function avatarStack(task) {
  const ps = task.participants || []
  return {
    shown: ps.slice(0, AVATAR_MAX),
    overflow: Math.max(ps.length - AVATAR_MAX, 0),
  }
}

/** 我在这条任务里的进度文案 */
function mineText(task) {
  if (!task.me) return ''
  switch (task.me.status) {
    case 'pending':
      return '等你接受'
    case 'accepted':
      return '轮到你做了'
    case 'done':
      return '你已完成'
    case 'rejected':
      return '你拒绝了这个任务'
    case 'skipped':
      return '别人已经做完了'
    default:
      return ''
  }
}

module.exports = {
  list,
  detail,
  create,
  update,
  addParticipants,
  accept,
  reject,
  complete,
  cancel,
  remind,
  stats,
  summary,
  avatarStack,
  mineText,
  PAGE_SIZE,
  AVATAR_MAX,
}
