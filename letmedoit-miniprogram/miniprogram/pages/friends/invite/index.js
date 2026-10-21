const friendApi = require('../../../services/friend')

Page({
  data: {
    inviteCode: '',
    sharePath: '',
    inputCode: '',
    submitting: false,
  },

  async onLoad() {
    try {
      await getApp().ensureLogin()
    } catch (e) {
      getApp().redirectToLogin()
      return
    }
    try {
      const invite = await friendApi.getInvite()
      this.setData({ inviteCode: invite.inviteCode, sharePath: invite.sharePath })
    } catch (e) {
      wx.showToast({ title: '邀请码加载失败', icon: 'none' })
    }
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '已复制，发给家人吧', icon: 'none' }),
    })
  },

  onInputCode(e) {
    this.setData({ inputCode: e.detail.value.toUpperCase() })
  },

  async applyCode() {
    const code = this.data.inputCode.trim()
    if (code.length !== 6) {
      wx.showToast({ title: '邀请码是 6 位', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      const res = await friendApi.acceptInviteCode(code)
      // 后端直接返回文案（「已加上 妈妈」），不再返回好友对象
      wx.showToast({ title: res.message, icon: 'none' })
      getApp().globalData.needRefresh = true
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      wx.showToast({ title: e.message || '邀请码不对', icon: 'none' })
      this.setData({ submitting: false })
    }
  },

  onShareAppMessage() {
    return {
      title: '加我一起用「让我做」，省得忘事',
      path: this.data.sharePath || '/pages/tasks/index/index',
    }
  },
})
