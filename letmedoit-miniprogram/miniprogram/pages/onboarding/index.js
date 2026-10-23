const auth = require('../../services/auth')
const fileApi = require('../../services/file')
const avatar = require('../../utils/avatar')
const { presentUser } = require('../../utils/present')

/** 底部 tab 页要用 switchTab 打开，否则会多压一层 */
const TABS = ['pages/tasks/index/index', 'pages/friends/index/index', 'pages/mine/index/index']

const DEFAULT_NEXT = 'pages/tasks/index/index'

Page({
  data: {
    statusBarHeight: 20,
    // 只作为 input 的初始 value，打字过程中绝不回写（回写会打断微信昵称的原生填充）
    nicknameInit: '',
    count: 0,
    avatarUrl: '',
    initial: '我',
    avatarStyle: '',
    saving: false,
    uploading: false,
  },

  async onLoad(options) {
    const next = (options && options.next && decodeURIComponent(options.next)) || ''
    // 只接受站内页面路径，防止外部拼参数把用户带到别处
    this.next = next.indexOf('pages/') === 0 ? next : DEFAULT_NEXT

    // 服务端已有的公网头像（首登通常为空），保存时原样回传，别把合法头像洗掉
    this.remoteAvatar = ''
    // 输入框的实时值放实例上，不参与渲染，避免受控 value 把用户的选择顶回去
    this.nickname = ''

    this.setData({ statusBarHeight: getApp().globalData.statusBarHeight })

    try {
      const user = await getApp().ensureLogin()
      const u = presentUser(user)
      this.remoteAvatar = u.avatarUrl || ''
      // 记住默认名（「用户XXXX」）：用户删空输入框时回填它，保证名字永远不空
      this.defaultName = user.nickname || ''
      this.nickname = this.defaultName
      this.setData({
        // 默认就用「用户XXXX」，用户想改再改
        nicknameInit: this.defaultName,
        count: this.defaultName.length,
        avatarUrl: avatar.getLocal() || this.remoteAvatar,
        initial: u.initial,
        avatarStyle: u.avatarStyle,
      })
    } catch (e) {
      getApp().redirectToLogin()
    }
  },

  /**
   * 选头像
   * chooseAvatar 是微信唯一可用的头像入口（点头像 = 从微信头像里挑）。
   * 拿到的只是本机临时路径，必须立刻传到对象存储换成公网 URL 才允许入库。
   */
  async onChooseAvatar(e) {
    const path = (e.detail && e.detail.avatarUrl) || ''
    if (!path) return
    // 先本地预览，选完立刻有反馈
    this.setData({ avatarUrl: path, uploading: true })
    avatar.setLocal(path)
    try {
      const file = await fileApi.uploadImage(path, 'avatar')
      this.remoteAvatar = file.url
      this.setData({ avatarUrl: file.url })
      // 有公网地址了，就不必再依赖本机预览
      avatar.clearLocal()
    } catch (err) {
      // 传不上去就退回默认头像：临时路径绝不入库，否则换台设备就是裂图
      this.remoteAvatar = ''
      avatar.clearLocal()
      this.setData({ avatarUrl: '' })
      wx.showToast({ title: err.message || '头像没传上，先用默认的', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  /** 临时文件被回收：清缓存，回落成名字末字色块（永远有头像） */
  onAvatarError() {
    avatar.clearLocal()
    this.setData({ avatarUrl: '' })
  },

  /**
   * 昵称变化
   *
   * 坑：input 是 type="nickname"，从键盘上方选「微信昵称」是**原生填充**，
   * 过程中可能先来一次 blur（带的是旧值）。以前这里 setData({nickname}) 会把
   * 刚填进去的昵称覆盖回去，表现就是"选了微信名字但输入框没变化"。
   * 现在只更新实例变量和字数，绝不回写 input 的 value。
   */
  onNickname(e) {
    const value = (e.detail && e.detail.value) || ''
    this.nickname = value
    if (value.length !== this.data.count) {
      this.setData({ count: value.length })
    }
  },

  /** 昵称安全审核结果（微信对 type=nickname 的昵称做机器审核） */
  onNicknameReview(e) {
    const detail = (e && e.detail) || {}
    if (detail.pass === false) {
      wx.showToast({ title: '这个昵称没过审核，换一个吧', icon: 'none' })
    }
  },

  /**
   * 就这么定
   *
   * 昵称从 form 的 submit 里取：微信昵称是**原生填充**，可能不触发 bindinput，
   * 只有表单取值一定能拿到输入框当前内容，所以这里是唯一的可信来源。
   */
  async onSubmit(e) {
    if (this.data.saving) return
    if (this.data.uploading) {
      wx.showToast({ title: '头像还在上传，稍等一下', icon: 'none' })
      return
    }

    const fromForm = (e && e.detail && e.detail.value && e.detail.value.nickname) || ''
    const typed = (fromForm || this.nickname || '').trim()
    // 用户把名字删空了：直接回到「用户XXXX」，不允许出现空名字
    const nickname = typed || this.defaultName || ''
    if (!nickname) {
      wx.showToast({ title: '写个名字吧', icon: 'none' })
      return
    }
    if (!typed) {
      // 回填给用户看到（这是主动改 value，属于预期行为）
      this.nickname = nickname
      this.setData({ nicknameInit: nickname, count: nickname.length })
    }

    this.setData({ saving: true })
    try {
      const user = await auth.updateProfile({ nickname, avatarUrl: this.remoteAvatar })
      getApp().setUser(user)
      wx.showToast({ title: '好了，开始吧', icon: 'none' })
      this.leave()
    } catch (e2) {
      wx.showToast({ title: e2.message || '没存上，再试一次', icon: 'none' })
      this.setData({ saving: false })
    }
  },

  /** 跳过：保留「用户XXXX」和服务端默认头像，直接进首页 */
  skip() {
    this.leave()
  },

  leave() {
    setTimeout(() => {
      if (TABS.indexOf(this.next) >= 0) {
        wx.switchTab({ url: '/' + this.next })
        return
      }
      wx.reLaunch({ url: '/' + this.next })
    }, 500)
  },
})
