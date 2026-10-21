/**
 * 订阅消息授权
 *
 * 策略见方案 7.2：在「发布 / 接受 / 完成 / 打开设置」四个高意愿节点请求，攒下发额度。
 * 授权失败或被拒一律不阻断主流程。
 *
 * 说明：授权结果只保留在本地。服务端目前不发订阅消息（投递能力未接），
 * 所以这里不向服务端上报，避免调用不存在的接口。
 */
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
 * @returns {Promise<{accepted:string[], raw:object, skipped?:boolean}>}
 */
function requestSubscribe(keys) {
  const list = keys || []
  const tmplIds = idsOf(list)

  // 模板 id 未配置：直接返回空结果，不打断流程
  if (!tmplIds.length) {
    return Promise.resolve({ accepted: [], raw: {}, skipped: true })
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res) => {
        const accepted = list.filter((k) => res[N[k].templateId] === 'accept')
        resolve({ accepted, raw: res })
      },
      fail: () => resolve({ accepted: [], raw: {} }),
    })
  })
}

module.exports = { requestSubscribe, idsOf }
