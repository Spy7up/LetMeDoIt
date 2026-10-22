const auth = require('../../../services/auth')
const avatar = require('../../../utils/avatar')
const { presentUser } = require('../../../utils/present')

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    initial: '我',
    avatarStyle: '',
    saving: false,
    // 从登录引导进来（pages/mine/profile/index?from=launch）
    guide: false,
  },

  async onLoad(options) {
    this.guide = !!(options && options.from === 'launch')
    // 服务端已有的公网头像：保存时原样回传，避免把合法头像洗掉
    this.remoteAvatar = ''
    try {
      const user = await getApp().ensureLogin()
      const u = presentUser(user)
      this.remoteAvatar = u.avatarUrl || ''
      this.setData({
        nickname: user.nickname || '',
        // 本机预览优先，其次服务端头像，都没有就走色块（initial + avatarStyle）
        avatarUrl: avatar.getLocal() || this.remoteAvatar,
        initial: u.initial,
        avatarStyle: u.avatarStyle,
        guide: this.guide,
      })
    } catch (e) {
      getApp().redirectToLogin()
    }
  },

  /**
   * 微信头像选择器
   * 拿到的是本机临时路径（wxfile:// / http://tmp/），只做预览、不上传、不写库
   */
  onChooseAvatar(e) {
    const url = (e.detail && e.detail.avatarUrl) || ''
    if (!url) return
    this.setData({ avatarUrl: url })
    avatar.setLocal(url)
  },

  /** 临时文件被回收：清掉缓存，模板自动回落成名字首字色块 */
  onAvatarError() {
    avatar.clearLocal()
    this.setData({ avatarUrl: '' })
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
      // 只提交昵称：本机头像路径不是可访问 URL，存进库换台设备就是裂图。
      // 回传服务端原有公网头像（通常为空），顺带把历史脏数据洗干净。
      const user = await auth.updateProfile({ nickname, avatarUrl: this.remoteAvatar })
      getApp().setUser(user)
      wx.showToast({ title: '改好了', icon: 'none' })
      this.leave()
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' })
      this.setData({ saving: false })
    }
  },

  /** 引导模式允许跳过：名字保留「用户XXXX」，头像用默认色块 */
  skip() {
    this.leave()
  },

  leave() {
    setTimeout(() => {
      if (this.guide) {
        // 引导页是 redirectTo 进来的（栈底），不能用 navigateBack
        wx.reLaunch({ url: '/pages/tasks/index/index' })
        return
      }
      wx.navigateBack()
    }, 600)
  },
})
