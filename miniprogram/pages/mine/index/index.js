const { presentUser } = require('../../../utils/present')

Page({
  data: {
    user: null,
    stats: { sentCount: 0, completedCount: 0, onTimeRate: 1, friendCount: 0 },
    rateText: '100%',
    version: 'v1.1.0',
  },

  onLoad() {
    this.bootstrap()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    if (this.ready) this.load()
  },

  async bootstrap() {
    try {
      await getApp().ensureLogin()
    } catch (e) {
      getApp().redirectToLogin()
      return
    }
    this.ready = true
    this.load()
  },

  async load() {
    try {
      const user = await getApp().refreshUser()
      const s = user.stats || {}
      this.setData({
        user: presentUser(user),
        stats: s,
        rateText: Math.round((s.onTimeRate || 0) * 100) + '%',
      })
    } catch (e) {
      // 静默失败，保留上一次的资料
    }
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/mine/profile/index' })
  },

  goSettings() {
    wx.navigateTo({ url: '/pages/mine/settings/index' })
  },

  goMessages() {
    wx.navigateTo({ url: '/pages/messages/index/index' })
  },

  about() {
    wx.showModal({
      title: '让我做 ' + this.data.version,
      content: '别人让你做的小事，说一遍就够。\n\n有事直接说，别靠记性。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  privacy() {
    wx.showModal({
      title: '隐私说明',
      content: '仅收集头像、昵称用于在好友之间互相识别；任务内容只对参与者和布置者可见。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  logout() {
    wx.showModal({
      title: '退出登录？',
      content: '退出后需要重新授权才能继续使用。',
      confirmText: '退出',
      confirmColor: '#D64545',
      success: (res) => {
        if (!res.confirm) return
        require('../../../services/auth').logout()
      },
    })
  },

  async onPullDownRefresh() {
    await this.load()
    wx.stopPullDownRefresh()
  },
})
