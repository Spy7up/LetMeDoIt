const taskApi = require('../../../services/task')
const notifyApi = require('../../../services/notify')
const friendApi = require('../../../services/friend')
const { REMIND_OPTIONS } = require('../../../constants/task')
const { presentUser } = require('../../../utils/present')
const { defaultDeadline } = require('../../../utils/format')

const REMIND = REMIND_OPTIONS.filter((o) => o.key !== 'custom')

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function splitISO(iso) {
  const d = new Date(iso)
  return {
    date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
    time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
  }
}

function humanOf(dateStr, timeStr) {
  const ymd = dateStr.split('-')
  const d = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]))
  const now = new Date()
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((d.getTime() - t0.getTime()) / 86400000)
  const day = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === 2 ? '后天' : ymd[1] + '月' + ymd[2] + '日'
  return day + ' ' + timeStr
}

function toISO(dateStr, timeStr) {
  const ymd = dateStr.split('-')
  const hm = timeStr.split(':')
  const d = new Date(
    Number(ymd[0]),
    Number(ymd[1]) - 1,
    Number(ymd[2]),
    Number(hm[0]),
    Number(hm[1]),
    0,
    0
  )
  return d.toISOString()
}

Page({
  data: {
    title: '',
    description: '',
    mode: 'all',
    participants: [],
    selectedIds: [],
    remindOptions: REMIND,
    remindKey: 'm10',
    remindLabel: '提前 10 分钟',
    deadlineDate: '',
    deadlineTime: '21:00',
    deadlineText: '',
    scheduled: false,
    startDate: '',
    startTime: '08:00',
    startText: '',
    submitting: false,
    canSubmit: false,
    today: '',
  },

  onLoad(options) {
    const def = defaultDeadline()
    const d = splitISO(def)
    this.setData({
      deadlineDate: d.date,
      deadlineTime: d.time,
      deadlineText: humanOf(d.date, d.time),
      startDate: d.date,
      startText: humanOf(d.date, '08:00'),
      today: d.date,
    })
    // 从好友页「派活」进来时，预选这个人
    if (options && options.assigneeIds) {
      this.prefill(options.assigneeIds.split(','))
    }
  },

  async prefill(ids) {
    try {
      const friends = await friendApi.list()
      const picked = friends
        .filter((f) => ids.indexOf(f.userId) >= 0)
        .map((f) => ({ id: f.userId, nickname: f.remark || f.nickname, avatarUrl: f.avatarUrl }))
      if (picked.length) this.applyParticipants(picked)
    } catch (e) {
      // 预选失败不影响手动选
    }
  },

  onUnload() {
    // 从详情页带回来的参与者选择结果已经由 eventChannel 处理
  },

  /* ---------------- 参与者 ---------------- */

  pickParticipants() {
    const page = this
    wx.navigateTo({
      url:
        '/pages/tasks/participants/index?mode=create&selected=' + this.data.selectedIds.join(','),
      events: {
        picked(users) {
          page.applyParticipants(users)
        },
      },
    })
  },

  applyParticipants(users) {
    const list = (users || []).map(presentUser)
    this.setData({
      participants: list,
      selectedIds: list.map((u) => u.id),
      canSubmit: !!this.data.title.trim() && list.length > 0,
    })
  },

  removeParticipant(e) {
    const id = e.currentTarget.dataset.id
    const list = this.data.participants.filter((p) => p.id !== id)
    const ids = list.map((p) => p.id)
    this.setData({
      participants: list,
      selectedIds: ids,
      canSubmit: !!this.data.title.trim() && ids.length > 0,
    })
  },

  /* ---------------- 表单 ---------------- */

  onTitle(e) {
    const v = e.detail.value
    this.setData({ title: v, canSubmit: !!v.trim() && this.data.selectedIds.length > 0 })
  },

  onDesc(e) {
    this.setData({ description: e.detail.value })
  },

  setMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode })
  },

  setRemind(e) {
    const key = e.currentTarget.dataset.key
    const opt = REMIND.find((o) => o.key === key)
    this.setData({ remindKey: key, remindLabel: opt ? opt.label : '' })
  },

  onDate(e) {
    const date = e.detail.value
    this.setData({ deadlineDate: date, deadlineText: humanOf(date, this.data.deadlineTime) })
  },

  onTime(e) {
    const time = e.detail.value
    this.setData({ deadlineTime: time, deadlineText: humanOf(this.data.deadlineDate, time) })
  },

  toggleSchedule(e) {
    this.setData({ scheduled: e.detail.value })
  },

  onStartDate(e) {
    this.setData({ startDate: e.detail.value, startText: humanOf(e.detail.value, this.data.startTime) })
  },

  onStartTime(e) {
    this.setData({ startTime: e.detail.value, startText: humanOf(this.data.startDate, e.detail.value) })
  },

  /* ---------------- 提交 ---------------- */

  async submit() {
    if (this.data.submitting) return

    const title = this.data.title.trim()
    if (!title) {
      wx.showToast({ title: '写一句要做什么吧', icon: 'none' })
      return
    }
    if (!this.data.selectedIds.length) {
      wx.showToast({ title: '至少选一个人', icon: 'none' })
      return
    }

    const deadline = toISO(this.data.deadlineDate, this.data.deadlineTime)
    if (new Date(deadline).getTime() < Date.now()) {
      wx.showToast({ title: '截止时间不能早于现在', icon: 'none' })
      return
    }

    let startAt = null
    if (this.data.scheduled) {
      startAt = toISO(this.data.startDate, this.data.startTime)
      if (new Date(startAt).getTime() <= Date.now()) {
        wx.showToast({ title: '定时开始时间要在以后', icon: 'none' })
        return
      }
      if (new Date(startAt).getTime() >= new Date(deadline).getTime()) {
        wx.showToast({ title: '开始时间要早于截止时间', icon: 'none' })
        return
      }
    }

    const opt = REMIND.find((o) => o.key === this.data.remindKey) || REMIND[0]
    this.setData({ submitting: true })

    try {
      // 发布时顺带攒一次订阅额度，用户拒绝也不影响发布
      await notifyApi.requestSubscribe(['TASK_ALL_DONE', 'TASK_REMIND'])

      await taskApi.create({
        title,
        description: this.data.description,
        participantIds: this.data.selectedIds,
        completionMode: this.data.mode,
        deadline,
        startAt,
        remindType: this.data.remindKey,
        remindMinutes: opt.minutes || 0,
      })

      getApp().globalData.needRefresh = true
      wx.showToast({ title: '已交给 TA，等回复', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 700)
    } catch (e) {
      wx.showToast({ title: e.message || '发布失败', icon: 'none' })
      this.setData({ submitting: false })
    }
  },
})
