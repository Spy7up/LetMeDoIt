/**
 * 任务领域服务
 * 页面只调用这里的方法，不接触 URL 与信封。
 */
const { http } = require('../utils/request')
const { resolveDisplayStatus } = require('../constants/task')

const PAGE_SIZE = 10

function decorate(item) {
  return Object.assign({}, item, { displayStatus: resolveDisplayStatus(item) })
}

function parseCursor(cursor) {
  if (!cursor) return 0
  const n = Number(String(cursor).replace(/^o_/, ''))
  return isNaN(n) ? 0 : n
}

/**
 * @param {{role:'assignee'|'creator', status?:string, cursor?:string}} params
 */
function list(params) {
  const p = params || {}
  return http
    .get('/tasks', {
      role: p.role || 'assignee',
      status: p.status || 'all',
      offset: parseCursor(p.cursor),
      limit: p.limit || PAGE_SIZE,
    })
    .then((res) => ({
      list: res.list.map(decorate),
      nextCursor: res.nextCursor,
      hasMore: res.hasMore,
    }))
}

function detail(id) {
  return http.get('/tasks/' + id).then(decorate)
}

/**
 * 布置任务
 * @param {{title:string, description?:string, participantIds:string[],
 *          completionMode:'any'|'all', deadline:string, startAt?:string,
 *          remindType?:string, remindMinutes?:number}} dto
 */
function create(dto) {
  return http
    .post(
      '/tasks',
      Object.assign({}, dto, { clientRequestId: dto.clientRequestId || genRequestId() }),
      { loading: '布置中…' }
    )
    .then(decorate)
}

function update(id, dto) {
  return http.patch('/tasks/' + id, dto).then(decorate)
}

/** 追加参与者（布置者，任务未开始时） */
function addParticipant(id, userId) {
  return http.post('/tasks/' + id + '/participants', { userId }).then(decorate)
}

/** 我接受这条任务里的自己那份 */
function accept(id) {
  return http.post('/tasks/' + id + '/accept').then(decorate)
}

function reject(id, reason) {
  return http.post('/tasks/' + id + '/reject', { reason }).then(decorate)
}

/** 完成自己那份；多人任务下不影响其他人 */
function complete(id, payload) {
  const body = payload || {}
  return http
    .post('/tasks/' + id + '/complete', {
      remark: body.remark || '',
      images: body.images || [],
    })
    .then(decorate)
}

function cancel(id, reason) {
  return http.post('/tasks/' + id + '/cancel', { reason: reason || '' }).then(decorate)
}

function remind(id) {
  return http.post('/tasks/' + id + '/remind')
}

function stats() {
  return http.get('/tasks/stats')
}

/** 首页摘要：等我回应的数量、我派出的数量、逾期数、在等我的人 */
function summary() {
  return http.get('/tasks/summary')
}

function genRequestId() {
  return 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
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
  addParticipant,
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
