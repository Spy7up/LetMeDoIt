const taskApi = require('../../../services/task')
const notifyApi = require('../../../services/notify')
const friendApi = require('../../../services/friend')
const { REMIND_OPTIONS } = require('../../../constants/task')
const { presentUser } = require('../../../utils/present')
const { defaultDeadline, isWholeDayDeadline } = require('../../../utils/format')

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

/** 截止时间至少留 2 小时 */
const MIN_AHEAD_MS = 2 * 3600 * 1000

function ymdOf(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/**
 * 「某一天」模式最早可选日期：
 * 当天 23:59:59 距现在不足 2 小时就没法选今天，顺延到明天
 */
function earliestDayDate() {
  const now = Date.now()
  const todayEnd = new Date()
  todayEnd.setHours(23, 59, 59, 0)
  const d = now + MIN_AHEAD_MS <= todayEnd.getTime() ? new Date(now) : new Date(now + 86400000)
  return ymdOf(d)
}

/** 「某一天」模式的截止：当天 23:59:59（约定，后端逾期判定照常用 deadline） */
function toEndOfDayISO(dateStr) {
  const ymd = dateStr.split('-')
  return new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]), 23, 59, 59, 0).toISOString()
}

/** 只到天的文案：今天 / 明天 / 后天 / 10月25日 */
function humanDay(dateStr) {
  const ymd = dateStr.split('-')
  const d = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]))
  const now = new Date()
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((d.getTime() - t0.getTime()) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === 2) return '后天'
  return ymd[1] + '月' + ymd[2] + '日'
}

/** 提醒分钟数 → chips 的 key */
function remindKeyOf(minutes) {
  const m = Number(minutes) || 0
  if (m === 0) return 'none'
  const hit = REMIND.find((o) => o.minutes === m)
  return hit ? hit.key : 'none'
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
    // 什么时候要：time = 某个时间点（至少 2 小时后）；day = 某一天（当天做完就行）
    dueMode: 'time',
    deadlineDate: '',
    deadlineTime: '21:00',
    deadlineText: '',
    deadlineMinDate: '',
    dayDate: '',
    dayText: '',
    dayMinDate: '',
    scheduled: false,
    startNotify: true,
    startDate: '',
    startTime: '08:00',
    startText: '',
    // 编辑模式下用来判断「预约中」的能不能改开始时间
    taskStatus: '',
    submitting: false,
    canSubmit: false,
    today: '',
    // 编辑模式：从详情页带 taskId 进来
    editing: false,
    taskId: '',
  },

  onLoad(options) {
    const def = defaultDeadline()
    const d = splitISO(def)
    const dayMin = earliestDayDate()
    this.setData({
      dueMode: 'time',
      deadlineDate: d.date,
      deadlineTime: d.time,
      deadlineText: humanOf(d.date, d.time),
      deadlineMinDate: ymdOf(new Date()),
      dayDate: dayMin,
      dayText: humanDay(dayMin),
      dayMinDate: dayMin,
      startDate: d.date,
      startText: humanOf(d.date, '08:00'),
      today: d.date,
    })
    // 从好友页「派活」进来时，预选这个人
    if (options && options.assigneeIds) {
      this.prefill(options.assigneeIds.split(','))
    }
    // 从详情页「编辑」进来
    if (options && options.taskId) {
      this.setData({ editing: true, taskId: options.taskId })
      this.loadForEdit(options.taskId)
    }
  },

  /** 编辑模式：回填已有任务（参与者只读，定时生效不可改） */
  async loadForEdit(taskId) {
    try {
      const d = await taskApi.detail(taskId)
      const dl = new Date(d.deadline)
      const dateStr = ymdOf(dl)
      const timeStr = pad(dl.getHours()) + ':' + pad(dl.getMinutes())
      const wholeDay = isWholeDayDeadline(d.deadline)
      const list = (d.participants || []).map(presentUser)
      const key = remindKeyOf(d.remindMinutes)
      const opt = REMIND.find((o) => o.key === key)

      // 原截止时间用于「没改就不强制 2 小时」
      this.originalDeadline = d.deadline

      const startAt = d.startAt ? splitISO(d.startAt) : null
      this.setData({
        taskStatus: d.status,
        title: d.title || '',
        description: d.description || '',
        mode: d.completionMode,
        scheduled: !!startAt,
        startNotify: d.startNotify !== false,
        startDate: startAt ? startAt.date : dateStr,
        startTime: startAt ? startAt.time : '08:00',
        startText: startAt ? humanOf(startAt.date, startAt.time) : '',
        participants: list,
        selectedIds: list.map((u) => u.id),
        dueMode: wholeDay ? 'day' : 'time',
        deadlineDate: dateStr,
        deadlineTime: timeStr,
        deadlineText: humanOf(dateStr, timeStr),
        dayDate: dateStr,
        dayText: humanDay(dateStr),
        dayMinDate: earliestDayDate(),
        remindKey: key,
        remindLabel: opt ? opt.label : '',
        canSubmit: !!d.title,
      })
      wx.setNavigationBarTitle({ title: '改一下这条任务' })
    } catch (e) {
      wx.showToast({ title: e.message || '任务加载失败', icon: 'none' })
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
    // 编辑模式不支持换人（后端编辑接口只改标题/内容/条件/时间/提醒）
    if (this.data.editing) return
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

  /** 切换「某个时间点 / 某一天」 */
  setDueMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (mode === this.data.dueMode) return
    if (mode === 'day') {
      // 切过来时兜一次：今天剩下的时间不够 2 小时就落到明天
      const min = earliestDayDate()
      const date = this.data.dayDate && this.data.dayDate >= min ? this.data.dayDate : min
      this.setData({ dueMode: mode, dayMinDate: min, dayDate: date, dayText: humanDay(date) })
      return
    }
    this.setData({ dueMode: mode })
  },

  onDayDate(e) {
    this.setData({ dayDate: e.detail.value, dayText: humanDay(e.detail.value) })
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

  toggleStartNotify(e) {
    this.setData({ startNotify: e.detail.value })
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
    if (!this.data.editing && !this.data.selectedIds.length) {
      wx.showToast({ title: '至少选一个人', icon: 'none' })
      return
    }

    // 什么时候要：时间点 >= 现在 + 2 小时；某一天 = 当天 23:59:59
    const isWholeDay = this.data.dueMode === 'day'
    const deadline = isWholeDay
      ? toEndOfDayISO(this.data.dayDate)
      : toISO(this.data.deadlineDate, this.data.deadlineTime)
    // 编辑时如果截止时间没动过，就不拿「至少 2 小时」卡人（老任务可能本来就快到了）
    const deadlineChanged = !this.originalDeadline || deadline !== this.originalDeadline
    if (deadlineChanged && new Date(deadline).getTime() < Date.now() + MIN_AHEAD_MS) {
      wx.showToast({
        title: isWholeDay ? '今天剩下的时间不够 2 小时，换一天吧' : '至少要留 2 小时',
        icon: 'none',
      })
      return
    }

    let startAt = null
    if (this.data.scheduled) {
      startAt = toISO(this.data.startDate, this.data.startTime)
      const startMs = new Date(startAt).getTime()
      if (startMs <= Date.now()) {
        wx.showToast({ title: '开始时间点要在以后', icon: 'none' })
        return
      }
      if (startMs >= new Date(deadline).getTime()) {
        wx.showToast({ title: '开始时间点要早于截止时间', icon: 'none' })
        return
      }
      // 「某一天」没有具体时刻，留出做事时间：开始不能晚于当天 22:00
      if (isWholeDay && this.data.startDate === this.data.dayDate) {
        const limit = new Date(this.data.dayDate + 'T22:00:00')
        if (startMs > limit.getTime()) {
          wx.showToast({ title: '「某一天」要在当天 22:00 前开始', icon: 'none' })
          return
        }
      }
    }

    // 某一天模式不设提前提醒，只在布置时发一条通知
    const opt = isWholeDay ? null : REMIND.find((o) => o.key === this.data.remindKey) || REMIND[0]
    this.setData({ submitting: true })

    try {
      // 发布时顺带攒一次订阅额度，用户拒绝也不影响发布
      await notifyApi.requestSubscribe(['TASK_ALL_DONE', 'TASK_REMIND'])

      const remindMinutes = opt ? opt.minutes || 0 : 0
      if (this.data.editing) {
        const payload = {
          title,
          description: this.data.description,
          completionMode: this.data.mode,
          deadline,
          remindMinutes,
        }
        // 只有预约中的任务能改开始时间点（后端同样只认这个状态）
        if (this.data.taskStatus === 'scheduled') {
          payload.startAt = startAt
          payload.startNotify = this.data.startNotify
          // 关掉开关 = 取消开始时间点，任务会退回待接受
          payload.removeStartTime = !startAt
        }
        await taskApi.update(this.data.taskId, payload)
        getApp().globalData.needRefresh = true
        wx.showToast({ title: '改好了', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 700)
        return
      }

      await taskApi.create({
        title,
        description: this.data.description,
        participantIds: this.data.selectedIds,
        completionMode: this.data.mode,
        deadline,
        startAt,
        startNotify: this.data.startNotify,
        remindMinutes,
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
