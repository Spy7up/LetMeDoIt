const friendApi = require('../../../services/friend')
const { presentUser } = require('../../../utils/present')
const { formatRelative } = require('../../../utils/format')

Page({
  data: {
    friends: [],
    requests: [],
    inviteCode: '',
    keyword: '',
    loading: true,
  },

  onLoad() {
    this.bootstrap()
  },

  onShow() {
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

  goInvite() {
    wx.navigateTo({ url: '/pages/friends/invite/index' })
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
