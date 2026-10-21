const friendApi = require('../../../services/friend')
const taskApi = require('../../../services/task')
const { presentUser } = require('../../../utils/present')

const MAX = 10

Page({
  data: {
    mode: 'create',
    keyword: '',
    friends: [],
    all: [],
    selected: [],
    loading: true,
    submitting: false,
    max: MAX,
  },

  async onLoad(options) {
    this.taskId = options.taskId || ''
    this.setData({ mode: options.mode === 'add' ? 'add' : 'create' })
    this.initialSelected = (options.selected || '')
      .split(',')
      .filter(function (s) {
        return !!s
      })

    try {
      await getApp().ensureLogin()
    } catch (e) {
      getApp().redirectToLogin()
      return
    }
    this.load()
  },

  async load() {
    this.setData({ loading: true })
    try {
      const raw = await friendApi.list()
      // 注意：friend.id 是关系 id，选中与建任务用的是 userId
      const list = raw.map((f) =>
        Object.assign(
          presentUser({ id: f.userId, nickname: f.remark || f.nickname, avatarUrl: f.avatarUrl }),
          { userId: f.userId, friendId: f.id, remark: f.remark, activeTaskCount: f.activeTaskCount }
        )
      )
      let friends = list
      // 追加模式：已经在任务里的人不再出现
      if (this.data.mode === 'add' && this.taskId) {
        try {
          const t = await taskApi.detail(this.taskId)
          const exists = (t.participants || []).map((p) => p.userId)
          friends = list.filter((f) => exists.indexOf(f.userId) < 0)
        } catch (e) {
          // 拿不到就不过滤
        }
      }
      const selected = friends.filter((f) => this.initialSelected.indexOf(f.userId) >= 0).map((f) => f.userId)
      this.setData({ all: friends, friends, selected, loading: false })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: e.message || '好友加载失败', icon: 'none' })
    }
  },

  onKeyword(e) {
    const kw = e.detail.value.trim()
    const all = this.data.all
    this.setData({
      keyword: kw,
      friends: kw ? all.filter((f) => f.nickname.indexOf(kw) >= 0 || (f.remark || '').indexOf(kw) >= 0) : all,
    })
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id
    const selected = this.data.selected.slice()
    const idx = selected.indexOf(id)
    if (idx >= 0) {
      selected.splice(idx, 1)
    } else {
      if (selected.length >= MAX) {
        wx.showToast({ title: '一条任务最多 10 个人', icon: 'none' })
        return
      }
      selected.push(id)
    }
    this.setData({ selected })
  },

  async confirm() {
    if (this.data.submitting) return
    if (!this.data.selected.length) {
      wx.showToast({ title: '至少选一个人', icon: 'none' })
      return
    }

    const picked = this.data.all.filter((f) => this.data.selected.indexOf(f.id) >= 0)

    if (this.data.mode === 'create') {
      const channel = this.getOpenerEventChannel && this.getOpenerEventChannel()
      if (channel && channel.emit) channel.emit('picked', picked)
      wx.navigateBack()
      return
    }

    // 追加模式：一次请求带全部 memberIds（后端 /participant/add 接受数组）
    this.setData({ submitting: true })
    try {
      await taskApi.addParticipants(
        this.taskId,
        picked.map((u) => u.id)
      )
      getApp().globalData.needRefresh = true
      wx.showToast({ title: '加进来了', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 500)
    } catch (e) {
      wx.showToast({ title: e.message || '添加失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  },
})
