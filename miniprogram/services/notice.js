/**
 * 服务通知（与微信「服务通知」同构）
 *
 * 两类来源：
 *  1. 微信订阅消息：用户在小程序外收到，样式由微信渲染，靠模板关键词决定左侧标签；
 *  2. 小程序内消息中心：同一份数据，用 wx-card 复刻微信卡片，作为未授权/额度用尽时的兜底。
 *
 * 所以后端返回的 message.fields 就是「标签 + 值」数组，
 * 与订阅消息模板的关键词一一对应（见 config/notify.js）。
 */
const { http } = require('../utils/request')

function parseCursor(cursor) {
  if (!cursor) return 0
  const n = Number(String(cursor).replace(/^o_/, ''))
  return isNaN(n) ? 0 : n
}

/**
 * @param {{cursor?:string, limit?:number}} params
 */
function list(params) {
  const p = params || {}
  return http.get('/messages', { offset: parseCursor(p.cursor), limit: p.limit || 20 })
}

/** @param {string[]|null} ids 传 null 表示全部已读 */
function markRead(ids) {
  return http.post('/messages/read', { ids: ids || null })
}

/** 未读数（列表页只关心这个） */
function unreadCount() {
  return list({ limit: 1 }).then((res) => res.unreadCount || 0)
}

module.exports = { list, markRead, unreadCount }
