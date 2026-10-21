/**
 * 订阅消息授权
 * 策略见方案 7.2：在「发布 / 接受 / 完成 / 打开设置」四个高意愿节点请求，攒下发额度。
 * 授权失败或被拒一律不阻断主流程。
 */
const { http } = require('../utils/request')
const config = require('../config/index')

const N = config.NOTIFY

const PENDING = 'TMPL_' // 未替换的占位模板 id 前缀

function idsOf(keys) {
  return keys
    .map((k) => (N[k] ? N[k].templateId : ''))
    .filter((id) => id && id.indexOf(PENDING) !== 0)
}

/**
 * @param {string[]} keys 例如 ['TASK_COMPLETED','TASK_REMIND']
 * @returns {Promise<{accepted:string[], raw:object}>}
 */
function requestSubscribe(keys) {
  const list = keys || []
  const tmplIds = idsOf(list)

  // 模板 id 未配置（本地 Mock 阶段）：直接返回空结果，不打断流程
  if (!tmplIds.length) {
    return Promise.resolve({ accepted: [], raw: {}, skipped: true })
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted = list.filter((k) => res[N[k].templateId] === 'accept')
        report(list, res)
        resolve({ accepted, raw: res })
      },
      fail: () => resolve({ accepted: [], raw: {} }),
    })
  })
}

/** 授权结果上报服务端记账，用于设置页提示「额度不足」 */
function report(keys, res) {
  keys.forEach((k) => {
    const id = N[k] && N[k].templateId
    http
      .post('/notify/subscribe', {
        templateKey: k,
        accepted: id ? res[id] === 'accept' : false,
      })
      .catch(() => {})
  })
}

module.exports = { requestSubscribe, idsOf }
