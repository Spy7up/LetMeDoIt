/**
 * 接收页（从分享卡片进来）
 *
 * 和 pages/tasks/detail 是<strong>两个页面</strong>，不是一个页面加参数：
 * 从微信聊天点进来的人，需要的只有四件事 —— 谁让我做、做什么、什么时候要、接受还是拒绝。
 * 时间线、参与者、编辑/撤回这些对他是噪音，所以这里一律不显示。
 *
 * 小程序内打开任务仍然走 detail 页（信息完整、带管理操作）。
 */
const taskApi = require('../../../services/task')
const notifyApi = require('../../../services/notify')
const entry = require('../../../utils/entry')
const { presentDetail } = require('../../../utils/present')

/** 每种场景顶部那句提示 */
const SCENE_HINT = {
  pending: '接受后，到期前会提醒你',
  accepted: '你已经接下了，记得在截止前做完',
  done: '你已经完成了这份',
  closed: '这条任务已经结束了',
  stranger: '你可以看看内容，但不能接受或拒绝',
}

Page({
  data: {
    task: null,
    loading: true,
    error: '',
    acting: '',
    /** pending / accepted / done / closed / stranger */
    scene: '',
    hint: '',
  },

  onLoad(options) {
    this.taskId = options.id || ''
    // 登录/引导完成后要回到这一页，路径带参数一起记下来
    this.route = entry.routeOf('pages/tasks/receive/index', options)
    if (!this.taskId) {
      this.setData({ loading: false, error: '链接里没有任务' })
      return
    }
    this.bootstrap()
  },

  /**
   * 分享卡片可能是冷启动直接进来，既不过首页也不经过登录页，
   * 所以这里自己兜住：没登录过 → 登录 → 首登引导 → 再回到这一页。
   */
  async bootstrap() {
    // 重试也走这里：先把「加载中」摆出来，避免点了没反应
    this.setData({ loading: true, error: '' })
    if (await entry.ensureEntry(this.route)) return
    this.load()
  },

  async load() {
    try {
      const d = await taskApi.detail(this.taskId)
      // 发布者点开自己分享的卡片：他要的是完整详情（能编辑/撤回/看进度），不是"接不接受"。
      // 用 redirectTo 而不是 navigateTo —— 接收页不该留在页面栈里。
      if (d.isCreator) {
        wx.redirectTo({ url: '/pages/tasks/detail/index?id=' + this.taskId })
        return
      }
      const scene = this.sceneOf(d)
      const t = presentDetail(d)
      this.setData({ task: t, scene, hint: SCENE_HINT[scene] || '', loading: false })
      this.setTitle(scene === 'pending' ? '有人托你做' : t.title)
    } catch (e) {
      this.setData({ loading: false, error: e.message || '没加载出来' })
    }
  },

  /** 改标题失败不能连累正文，所以单独兜一层 */
  setTitle(title) {
    try {
      if (wx.setNavigationBarTitle) {
        wx.setNavigationBarTitle({ title })
      }
    } catch (e) {
      // 忽略：标题只是锦上添花
    }
  },

  sceneOf(d) {
    if (!d.isCreator && !d.me) {
      return 'stranger'
    }
    if (d.me && d.me.canAccept) {
      return 'pending'
    }
    if (d.me && d.me.status === 'accepted') {
      return 'accepted'
    }
    if (d.me && d.me.status === 'done') {
      return 'done'
    }
    return 'closed'
  },

  /* ---------------- 操作 ---------------- */

  async onAccept() {
    if (this.data.acting) return
    this.setData({ acting: 'accept' })
    // 接受 = 承诺，是攒订阅额度通过率最高的时机。
    // 必须是 tap 回调里的第一个 await，中间夹异步会报 can only be invoked by user TAP gesture。
    await notifyApi.requestSubscribe(['TASK_REMIND', 'TASK_ASSIGNED'])
    try {
      const d = await taskApi.accept(this.taskId)
      const scene = this.sceneOf(d)
      const t = presentDetail(d)
      this.setData({ task: t, scene, hint: SCENE_HINT[scene] || '' })
      wx.vibrateShort({ type: 'light' })
      wx.showToast({ title: '已接下，开始吧', icon: 'none' })
    } catch (e) {
      wx.showToast({ title: e.message || '操作失败', icon: 'none' })
      this.load()
    } finally {
      this.setData({ acting: '' })
    }
  },

  onReject() {
    wx.showModal({
      title: '说说为什么',
      editable: true,
      placeholderText: '比如：今晚不在家',
      confirmText: '拒绝',
      success: (res) => {
        if (!res.confirm) return
        const reason = (res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '还是说一句吧', icon: 'none' })
          return
        }
        taskApi
          .reject(this.taskId, reason)
          .then((d) => {
            const scene = this.sceneOf(d)
            this.setData({ task: presentDetail(d), scene, hint: SCENE_HINT[scene] || '' })
            wx.showToast({ title: '已回复对方', icon: 'none' })
          })
          .catch((e) => wx.showToast({ title: e.message || '操作失败', icon: 'none' }))
      },
    })
  },

  goComplete() {
    wx.navigateTo({ url: '/pages/tasks/complete/index?id=' + this.taskId })
  },

  /** 看完整详情（参与者才有意义） */
  goFull() {
    wx.navigateTo({ url: '/pages/tasks/detail/index?id=' + this.taskId })
  },

  /** 点参考图看大图 */
  previewShot(e) {
    const list = (this.data.task && this.data.task.allShots) || []
    if (!list.length) return
    const idx = Number(e.currentTarget.dataset.index) || 0
    wx.previewImage({ current: list[idx] || list[0], urls: list })
  },
})
