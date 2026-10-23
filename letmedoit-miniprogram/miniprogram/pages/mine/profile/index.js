const auth = require('../../../services/auth')
const fileApi = require('../../../services/file')
const avatar = require('../../../utils/avatar')
const { presentUser } = require('../../../utils/present')

Page({
  data: {
    // 只作为 input 的初始 value，打字过程中绝不回写（回写会打断微信昵称的原生填充）
    nicknameInit: '',
    count: 0,
    avatarUrl: '',
    initial: '我',
    avatarStyle: '',
    saving: false,
    uploading: false,
  },

  async onLoad() {
    // 服务端已有的公网头像：保存时原样回传，避免把合法头像洗掉
    this.remoteAvatar = ''
    // 输入框的实时值放实例上，不参与渲染
    this.nickname = ''
    try {
      const user = await getApp().ensureLogin()
      const u = presentUser(user)
      this.remoteAvatar = u.avatarUrl || ''
      this.nickname = user.nickname || ''
      this.setData({
        nicknameInit: this.nickname,
        count: this.nickname.length,
        // 本机预览优先，其次服务端头像，都没有就走色块（initial + avatarStyle）
        avatarUrl: avatar.getLocal() || this.remoteAvatar,
        initial: u.initial,
        avatarStyle: u.avatarStyle,
      })
    } catch (e) {
      getApp().redirectToLogin()
    }
  },

  /**
   * 微信头像选择器
   * 拿到的是本机临时路径，先预览、再上传换公网 URL；传不上去就退回默认头像
   */
  async onChooseAvatar(e) {
    const path = (e.detail && e.detail.avatarUrl) || ''
    if (!path) return
    this.setData({ avatarUrl: path, uploading: true })
    avatar.setLocal(path)
    try {
      const file = await fileApi.uploadImage(path, 'avatar')
      this.remoteAvatar = file.url
      this.setData({ avatarUrl: file.url })
      avatar.clearLocal()
    } catch (err) {
      this.remoteAvatar = ''
      avatar.clearLocal()
      this.setData({ avatarUrl: '' })
      wx.showToast({ title: err.message || '头像没传上，先用默认的', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  /** 临时文件被回收：清掉缓存，模板自动回落成名字末字色块 */
  onAvatarError() {
    avatar.clearLocal()
    this.setData({ avatarUrl: '' })
  },

  /**
   * 昵称变化
   *
   * 坑：type="nickname" 从键盘上方选「微信昵称」是原生填充，过程中可能先来一次
   * blur（带旧值）。以前这里 setData({nickname}) 会把刚填进去的昵称覆盖回去，
   * 表现就是"选了微信名字但输入框没变化"。现在只更新实例变量和字数。
   */
  onNickname(e) {
    const value = (e.detail && e.detail.value) || ''
    this.nickname = value
    if (value.length !== this.data.count) {
      this.setData({ count: value.length })
    }
  },

  /** 昵称安全审核结果 */
  onNicknameReview(e) {
    const detail = (e && e.detail) || {}
    if (detail.pass === false) {
      wx.showToast({ title: '这个昵称没过审核，换一个吧', icon: 'none' })
    }
  },

  /**
   * 保存
   *
   * 昵称从 form 的 submit 里取：微信昵称是原生填充，可能不触发 bindinput，
   * 只有表单取值一定能拿到输入框当前内容。
   */
  async onSubmit(e) {
    if (this.data.uploading) {
      wx.showToast({ title: '头像还在上传，稍等一下', icon: 'none' })
      return
    }
    const fromForm = (e && e.detail && e.detail.value && e.detail.value.nickname) || ''
    const nickname = (fromForm || this.nickname || '').trim()
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
      setTimeout(() => wx.navigateBack(), 600)
    } catch (e2) {
      wx.showToast({ title: e2.message || '保存失败', icon: 'none' })
      this.setData({ saving: false })
    }
  },
})
