const friendApi = require('../../../services/friend')
const entry = require('../../../utils/entry')
const { presentUser } = require('../../../utils/present')
const { formatRelative } = require('../../../utils/format')

Page({
  data: {
    friends: [],
    requests: [],
    inviteCode: '',
    sharePath: '',
    inputCode: '',
    applying: false,
    keyword: '',
    loading: true,
  },

  onLoad() {
    this.bootstrap()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    if (this.ready) this.load()
  },

  async bootstrap() {
    if (await entry.ensureEntry('pages/friends/index/index')) return
    this.ready = true
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const [friends, requests, invite] = await Promise.all([
        friendApi.list(this.data.keyword),
        friendApi.listRequests(),
        friendApi.getInvite(),
      ])
      this.setData({
        friends: friends.map((f) =>
          Object.assign(presentUser({ id: f.userId, nickname: f.remark || f.nickname, avatarUrl: f.avatarUrl }), {
            // presentUser 只透传 id，这里补上 userId，避免下游误用成 undefined
            userId: f.userId,
            friendId: f.id,
            rawName: f.nickname,
            remark: f.remark,
            activeTaskCount: f.activeTaskCount,
            lastText: f.activeTaskCount ? f.activeTaskCount + ' 个任务进行中' : '上次互动 ' + formatRelative(f.lastActiveAt),
          })
        ),
        requests: requests.map((r) =>
          Object.assign(presentUser(r.fromUser), {
            requestId: r.id,
            message: r.message,
            timeText: formatRelative(r.createdAt),
          })
        ),
        inviteCode: invite.inviteCode,
        sharePath: invite.sharePath || '',
        loading: false,
      })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '加载失败', icon: 'none' })
    }
  },

  onKeyword(e) {
    this.setData({ keyword: e.detail.value })
    // 输入防抖，避免每敲一个字就打一次接口
    if (this._timer) clearTimeout(this._timer)
    this._timer = setTimeout(() => this.load(), 300)
  },

  async accept(e) {
    const id = e.currentTarget.dataset.id
    try {
      await friendApi.acceptRequest(id)
      wx.showToast({ title: '已加为好友', icon: 'none' })
      this.load()
    } catch (err) {
      wx.showToast({ title: err.message || '操作失败', icon: 'none' })
    }
  },

  async reject(e) {
    const id = e.currentTarget.dataset.id
    try {
      await friendApi.rejectRequest(id)
      this.load()
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  copyCode() {
    const code = this.data.inviteCode
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '已复制，发给家人吧', icon: 'none' }),
    })
  },

  onInputCode(e) {
    this.setData({ inputCode: String(e.detail.value || '').toUpperCase() })
  },

  /** 输对方的邀请码直接加好友，成功后原地刷新列表 */
  async applyCode() {
    if (this.data.applying) return
    const code = this.data.inputCode.trim()
    if (code.length !== 6) {
      wx.showToast({ title: '邀请码是 6 位', icon: 'none' })
      return
    }
    this.setData({ applying: true })
    try {
      const res = await friendApi.acceptInviteCode(code)
      wx.showToast({ title: res.message, icon: 'none' })
      getApp().globalData.needRefresh = true
      this.setData({ inputCode: '' })
      this.load()
    } catch (e) {
      wx.showToast({ title: e.message || '邀请码不对', icon: 'none' })
    }
    this.setData({ applying: false })
  },

  onShareAppMessage() {
    // 走「加好友页」而不是登录页：对方点开能先看清是谁邀请他，再决定加不加。
    // 封面用薄荷绿那张，和任务卡片的橘色区分开，聊天里一眼能认出来。
    const code = this.data.inviteCode || ''
    return {
      title: '加我一起用「让我做」，省得忘事',
      path: code ? '/pages/friends/invite/index?code=' + code : '/pages/tasks/index/index',
      imageUrl: '/images/share/friend-cover.png',
    }
  },

  goDetail(e) {
    const d = e.currentTarget.dataset
    wx.navigateTo({
      url:
        '/pages/friends/detail/index?uid=' +
        d.uid +
        '&fid=' +
        d.fid +
        '&name=' +
        encodeURIComponent(d.name || '') +
        '&count=' +
        (d.count || 0),
    })
  },

  assign(e) {
    const id = e.currentTarget.dataset.userid
    wx.navigateTo({ url: '/pages/tasks/create/index?assigneeIds=' + id })
  },

  async onPullDownRefresh() {
    await this.load()
    wx.stopPullDownRefresh()
  },
})
