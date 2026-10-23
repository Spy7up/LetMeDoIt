/**
 * 服务通知（与微信「服务通知」同构）
 *
 * 两类来源：
 *  1. 微信订阅消息：用户在小程序外收到，样式由微信渲染，靠模板关键词决定左侧标签；
 *  2. 小程序内消息中心：同一份数据（t_notice），用 wx-card 复刻微信卡片，
 *     作为未授权 / 额度用尽时的兜底。
 *
 * 所以后端返回的 notice.fields 就是「标签 + 值」数组，
 * 与订阅消息模板的关键词一一对应（见 config/notify.js）。
 */
const { http } = require('../utils/request')
const adapt = require('./adapt')

const PAGE_SIZE = 20

/** 页面用 offset 游标，后端用 pageNum；这里换算，页面无感 */
function pageNumOf(cursor, limit) {
  const offset = Number(String(cursor || '').replace(/^o_/, ''))
  if (!offset || isNaN(offset)) return 1
  return Math.floor(offset / limit) + 1
}

/**
 * @param {{cursor?:string, limit?:number}} params
 * @returns {Promise<{list:Array, unreadCount:number, nextCursor:string, hasMore:boolean}>}
 */
function list(params) {
  const p = params || {}
  const limit = p.limit || PAGE_SIZE
  const offset = Number(String(p.cursor || '').replace(/^o_/, '')) || 0

  return http
    .post('/api/notice/query', { pageNum: pageNumOf(p.cursor, limit), pageSize: limit })
    .then((res) => {
      const rows = res.list || []
      const loaded = offset + rows.length
      const total = res.total || 0
      return {
        list: rows.map(adapt.notice),
        unreadCount: res.unreadCount || 0,
        nextCursor: loaded < total ? 'o_' + loaded : '',
        hasMore: loaded < total,
      }
    })
}

/**
 * 标记已读
 * @param {string[]|null} ids 传 null / 空数组表示全部已读
 * @returns {Promise<number>} 剩余未读数
 */
function markRead(ids) {
  const list = ids || []
  const body = list.length ? { noticeIds: list.map((v) => Number(v)) } : { allFlag: true }
  return http.post('/api/notice/read', body).then((n) => n || 0)
}

/** 未读数（列表页只关心这个） */
function unreadCount() {
  return http.get('/api/notice/unread-count').then((n) => n || 0)
}

module.exports = { list, markRead, unreadCount }
