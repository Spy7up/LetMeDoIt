const auth = require('../../../services/auth')
const { presentUser } = require('../../../utils/present')

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    initial: '我',
    avatarStyle: '',
    saving: false,
  },

  async onLoad() {
    try {
      const user = await getApp().ensureLogin()
      const u = presentUser(user)
      this.setData({
        nickname: user.nickname || '',
        avatarUrl: user.avatarUrl || '',
        initial: u.initial,
        avatarStyle: u.avatarStyle,
      })
    } catch (e) {
      getApp().redirectToLogin()
    }
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  onNickname(e) {
    this.setData({ nickname: e.detail.value })
  },

  async save() {
    const nickname = (this.data.nickname || '').trim()
    if (!nickname) {
      wx.showToast({ title: '起个名字吧', icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const user = await auth.updateProfile({ nickname, avatarUrl: this.data.avatarUrl })
      getApp().setUser(user)
      wx.showToast({ title: '改好了', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
      this.setData({ saving: false })
    }
  },
})
