const taskApi = require('../../../services/task')
const friendApi = require('../../../services/friend')
const avatar = require('../../../utils/avatar')
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
    let user = null
    try {
      user = await getApp().refreshUser()
      // 本机预览头像只对「我」生效，所以只在这里叠加，其余页面统一走默认头像
      this.setData({ user: avatar.withLocalAvatar(presentUser(user)) })
    } catch (e) {
      // 资料失败就保留上一次，统计继续拉
    }

    // 会员资料里暂时可能没有邀请码（老版本接口），用好友邀请码接口兜住，别让页面空着
    if (user && !user.inviteCode) {
      try {
        const invite = await friendApi.getInvite()
        if (invite && invite.inviteCode) this.setData({ 'user.inviteCode': invite.inviteCode })
      } catch (e) {
        // 邀请码取不到就显示占位符
      }
    }

    try {
      const s = await taskApi.stats()
      this.setData({
        stats: s,
        rateText: Math.round((s.onTimeRate || 0) * 100) + '%',
      })
    } catch (e) {
      // 统计失败不影响页面主体
    }
  },

  goProfile() {
    wx.navigateTo({ url: '/pages/mine/profile/index' })
  },

  /**
   * 本机预览的头像失效了（微信回收了临时文件）：清掉缓存，模板自动回落成名字首字色块。
   * 这是"永远有头像"的兜底，别删。
   */
  onAvatarError() {
    avatar.clearLocal()
    if (this.data.user) this.setData({ 'user.avatarUrl': '' })
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
