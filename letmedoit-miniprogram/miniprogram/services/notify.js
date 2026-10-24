/**
 * 订阅消息：授权申请 + 额度上报 + 额度查询
 *
 * 一次性订阅的规则（不要在这里做"优化"）：
 *   点一次「允许」= 服务端获得 1 条下发额度，发一条就扣光。
 *   所以每次授权成功都必须上报记账，否则服务端以为没额度，永远不发。
 *
 * 授权失败、被拒、模板未配置，一律不阻断主流程 —— 调用方不要 try/catch 它。
 */
const { http } = require('../utils/request')
const config = require('../config/index')
const adapt = require('./adapt')

const N = config.NOTIFY

/** 未替换的占位模板 id 前缀（历史写法，兼容用） */
const PENDING = 'TMPL_'

/**
 * 取出真正可用的模板 id：空串和占位符都过滤掉
 * @param {string[]} keys
 * @returns {string[]}
 */
function idsOf(keys) {
  return (keys || [])
    .map((k) => (N[k] ? N[k].templateId : ''))
    .filter((id) => id && id.indexOf(PENDING) !== 0)
}

/**
 * 上报一次授权结果，给服务端记账
 * 失败只吞掉：记账失败最多导致这条通知发不出去，不该影响用户操作
 */
function report(key) {
  const tpl = N[key]
  if (!tpl || !tpl.templateId) return
  http
    .post('/api/subscribe/record', {
      templateId: tpl.templateId,
      scene: key,
      count: 1,
    })
    .catch(() => {})
}

/**
 * 申请订阅授权
 *
 * ⚠️ 必须在用户点击事件的回调里、并且在**第一个 await 之前**调用，
 *    一旦中途有 await（或放在 showModal 的回调里），微信会报
 *    requestSubscribeMessage:fail can only be invoked by user TAP gesture。
 *
 * @param {string[]} keys 例如 ['TASK_STATUS','TASK_REMIND']，微信一次最多 3 个
 * @returns {Promise<{accepted:string[], raw:object, skipped?:boolean}>}
 */
function requestSubscribe(keys) {
  const list = keys || []
  const tmplIds = idsOf(list)

  // 模板 id 还没配（审核中）：直接返回空结果，不弹窗、不打断流程
  if (!tmplIds.length) {
    return Promise.resolve({ accepted: [], raw: {}, skipped: true })
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted = list.filter((k) => res[N[k].templateId] === 'accept')
        // 立刻记账，等页面去 await 上报会丢（用户可能直接退出）
        accepted.forEach((k) => report(k))
        resolve({ accepted, raw: res })
      },
      fail: () => resolve({ accepted: [], raw: {} }),
    })
  })
}

/**
 * 我的订阅额度（设置页回显）
 * @returns {Promise<Array<{templateKey:string, remainCount:number, configured:boolean, on:boolean}>>}
 */
function list() {
  return http.get('/api/subscribe/list').then((rows) => (rows || []).map(adapt.subscribeQuota))
}

module.exports = { requestSubscribe, list, idsOf }
