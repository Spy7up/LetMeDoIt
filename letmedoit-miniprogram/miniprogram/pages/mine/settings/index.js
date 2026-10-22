const notifyApi = require('../../../services/notify')
const TEMPLATES = require('../../../config/notify')

const NO_QUOTA = '还有通知没开，点一下就能收到微信提醒'

/**
 * 把「模板配置」和「服务端额度」合起来渲染
 * 服务端返回的 configured=false 说明模板还在审核，这时不能显示成"已关闭"
 */
function buildList(quotaMap) {
  return Object.keys(TEMPLATES).map((key) => {
    const quota = quotaMap[key] || null
    const remain = quota ? quota.remainCount : 0
    const configured = !!(quota && quota.configured)
    return {
      key,
      title: TEMPLATES[key].title,
      desc: TEMPLATES[key].desc,
      configured,
      remain,
      on: !!(quota && quota.on),
      hint: !configured
        ? '模板审核中，暂时只能在小程序内收到'
        : remain > 0
        ? '还能收到 ' + remain + ' 条'
        : NO_QUOTA,
    }
  })
}

Page({
  data: {
    list: [],
  },

  onLoad() {
    this.setData({ list: buildList({}) })
    this.syncQuota()
  },

  onShow() {
    // 用户可能刚从微信「设置-消息通知」回来，重新拉一次额度
    this.syncQuota()
  },

  async syncQuota() {
    try {
      const rows = await notifyApi.list()
      const map = {}
      ;(rows || []).forEach((item) => {
        if (item && item.templateKey) map[item.templateKey] = item
      })
      this.setData({ list: buildList(map) })
    } catch (e) {
      // 拉不到额度不影响授权：保持上一次的展示即可
    }
  },

  async toggle(e) {
    const key = e.currentTarget.dataset.key
    const idx = e.currentTarget.dataset.index

    // 必须是 tap 回调里的第一个 await，否则微信拒绝弹窗
    const res = await notifyApi.requestSubscribe([key])

    if (res.skipped) {
      wx.showToast({ title: '模板审核中，先用小程序内通知', icon: 'none' })
      return
    }

    const accepted = (res.accepted || []).indexOf(key) >= 0
    if (!accepted) {
      this.setData({ ['list[' + idx + '].on']: false })
      wx.showToast({ title: '没开成，可以在微信设置里改', icon: 'none' })
      return
    }

    // 授权成功：先乐观 +1，再以服务端为准
    const current = this.data.list[idx]
    this.setData({
      ['list[' + idx + '].on']: true,
      ['list[' + idx + '].remain']: (current.remain || 0) + 1,
      ['list[' + idx + '].hint']: '还能收到 ' + ((current.remain || 0) + 1) + ' 条',
    })
    wx.showToast({ title: '已开启，下次会提醒你', icon: 'none' })
  },

  explain() {
    wx.showModal({
      title: '关于服务通知',
      content:
        '微信的一次性订阅：开启一次，我们就能给你发一条通知。为了少打扰你，我们只在布置任务、接受任务时顺带申请一次。没收到卡片也别担心，小程序里的消息中心一定有。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
