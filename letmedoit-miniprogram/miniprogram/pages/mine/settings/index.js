const notifyApi = require('../../../services/notify')
const TEMPLATES = require('../../../config/notify')

Page({
  data: {
    list: [],
  },

  onLoad() {
    const list = Object.keys(TEMPLATES).map((key) => ({
      key,
      title: TEMPLATES[key].title,
      desc: TEMPLATES[key].desc,
      on: false,
    }))
    this.setData({ list })
  },

  async toggle(e) {
    const key = e.currentTarget.dataset.key
    const idx = e.currentTarget.dataset.index

    const res = await notifyApi.requestSubscribe([key])

    if (res.skipped) {
      wx.showToast({ title: '模板还没配置，先用小程序内通知', icon: 'none' })
      return
    }

    const accepted = (res.accepted || []).indexOf(key) >= 0
    const patch = {}
    patch['list[' + idx + '].on'] = accepted
    this.setData(patch)
    wx.showToast({
      title: accepted ? '已开启，下次会提醒你' : '没开成，可以在微信设置里改',
      icon: 'none',
    })
  },

  explain() {
    wx.showModal({
      title: '关于服务通知',
      content:
        '微信的一次性订阅：开启一次，我们就能给你发一条通知。为了少打扰你，我们只在布置任务、接受任务、完成任务时顺带申请一次。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
