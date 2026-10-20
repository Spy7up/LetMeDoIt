/**
 * 运行时自检：用桩模拟小程序环境，把页面逻辑真正跑一遍
 * （没有微信开发者工具时，这是最接近真机的验证方式）
 *
 * 用法：node tools/sim.js
 */
const path = require('path')
const ROOT = path.resolve(__dirname, '../miniprogram')

// 测试里关掉 mock 的随机延迟，逻辑不变、跑得快且确定
const config = require(path.join(ROOT, 'config/index'))
config.MOCK.LATENCY_MIN = 0
config.MOCK.LATENCY_MAX = 0

/* ---------------- 环境桩 ---------------- */

const storage = {}
const calls = { toast: [], nav: [], modal: [] }
let appInstance = null
let lastPageConfig = null

global.wx = {
  getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375 }),
  getSystemInfoSync: () => ({ statusBarHeight: 44 }),
  getMenuButtonBoundingClientRect: () => ({ top: 48, height: 32, width: 87, right: 368 }),
  getStorageSync: (k) => (storage[k] === undefined ? '' : storage[k]),
  setStorageSync: (k, v) => {
    storage[k] = v
  },
  removeStorageSync: (k) => {
    delete storage[k]
  },
  login: (opt) => setTimeout(() => opt.success({ code: 'mock_code' }), 1),
  request: () => {},
  requestSubscribeMessage: (opt) => opt.success({}),
  showToast: (o) => calls.toast.push(o.title),
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => {
    calls.modal.push(o.title)
    if (o.success) o.success({ confirm: true, content: '今晚不在家' })
  },
  showActionSheet: (o) => {
    if (o.success) o.success({ tapIndex: o.itemList.length - 1 })
  },
  navigateTo: (o) => {
    calls.nav.push(o.url)
    if (o.events) o.__events = o.events
  },
  redirectTo: (o) => calls.nav.push(o.url),
  switchTab: (o) => calls.nav.push(o.url),
  reLaunch: (o) => calls.nav.push(o.url),
  navigateBack: () => calls.nav.push('back'),
  stopPullDownRefresh: () => {},
  vibrateShort: () => {},
  chooseMedia: (o) =>
    o.success({ tempFiles: [{ tempFilePath: 'wxfile://tmp_a.jpg' }, { tempFilePath: 'wxfile://tmp_b.jpg' }] }),
  previewImage: () => {},
  setClipboardData: (o) => o.success && o.success(),
}

global.App = (cfg) => {
  appInstance = cfg
}
global.getApp = () => appInstance
global.getCurrentPages = () => []
global.Page = (cfg) => {
  lastPageConfig = cfg
}
global.Component = () => {}

/* ---------------- 加载 app ---------------- */

require(path.join(ROOT, 'app.js'))
appInstance.onLaunch()
global.getApp = () => appInstance

/* ---------------- 页面实例工具 ---------------- */

function setDataFactory(inst) {
  return function setData(patch, cb) {
    Object.keys(patch).forEach((key) => {
      if (key.indexOf('.') < 0 && key.indexOf('[') < 0) {
        inst.data[key] = patch[key]
        return
      }
      // 支持 'list[0].on' 这种路径
      const segs = key.replace(/\[(\d+)\]/g, '.$1').split('.')
      let cur = inst.data
      for (let i = 0; i < segs.length - 1; i++) {
        const s = segs[i]
        if (cur[s] === undefined) cur[s] = {}
        cur = cur[s]
      }
      cur[segs[segs.length - 1]] = patch[key]
    })
    if (cb) cb()
  }
}

function loadPage(route, options) {
  const file = path.join(ROOT, route + '.js')
  delete require.cache[require.resolve(file)]
  lastPageConfig = null
  require(file)
  if (!lastPageConfig) throw new Error('页面没有调用 Page(): ' + route)

  const inst = Object.create(null)
  Object.keys(lastPageConfig).forEach((k) => {
    inst[k] = lastPageConfig[k]
  })
  inst.data = JSON.parse(JSON.stringify(lastPageConfig.data || {}))
  inst.setData = setDataFactory(inst)
  inst.route = route
  // 事件通道桩
  inst.__emitted = {}
  inst.getOpenerEventChannel = () => ({
    emit: (name, payload) => {
      inst.__emitted[name] = payload
    },
  })
  return inst
}

function evt(dataset, detail) {
  return { currentTarget: { dataset: dataset || {} }, detail: detail || {}, target: { dataset: dataset || {} } }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms || 80))

let errors = 0
function check(cond, msg, extra) {
  if (cond) console.log('  ✓ ' + msg)
  else {
    console.log('  ✗ ' + msg + (extra ? ' → ' + JSON.stringify(extra) : ''))
    errors++
  }
}

/* ---------------- 场景 ---------------- */

async function run() {
  console.log('\n[1] 登录与资料')
  const launch = loadPage('pages/launch/index', {})
  launch.onLoad({})
  await launch.login()
  await wait(300)
  check(!!appInstance.globalData.user, 'launch 页完成登录', launch.data.tip)

  const me = appInstance.globalData.user
  check(me && me.nickname === '小林', '拿到当前用户', me && me.nickname)

  console.log('\n[2] 任务列表')
  const listPage = loadPage('pages/tasks/index/index', {})
  listPage.onLoad({})
  await wait(500)
  check(!listPage.data.error, '列表无错误', listPage.data.error)
  check(listPage.data.list.length > 0, '收到任务 ' + listPage.data.list.length + ' 条')
  check(listPage.data.summary.assignee > 0, 'banner 摘要 ' + listPage.data.summary.assignee + ' 件')
  check(!!listPage.data.bannerSub, 'banner 副标题：' + listPage.data.bannerSub)

  const first = listPage.data.list[0]
  check(!!first.headName && !!first.statusClass, '卡片字段齐全 ' + first.title + ' / ' + first.statusLabel)
  const multi = listPage.data.list.filter((t) => t.isMulti)
  check(multi.length > 0, '多人任务 ' + multi.length + ' 条，例如：' + (multi[0] && multi[0].title))

  console.log('\n[3] 切换角色与筛选')
  listPage.switchRole(evt({ role: 'creator' }))
  await wait(400)
  check(listPage.data.list.every((t) => t.role === 'creator'), '发出列表全部是 creator 视角')
  console.log('    发出 ' + listPage.data.list.length + ' 条')

  listPage.switchRole(evt({ role: 'assignee' }))
  await wait(300)
  listPage.switchStatus(evt({ key: 'overdue' }))
  await wait(300)
  check(
    listPage.data.list.length > 0 && listPage.data.list.every((t) => t.displayStatus === 'overdue'),
    '逾期筛选 ' + listPage.data.list.length + ' 条'
  )
  listPage.switchStatus(evt({ key: 'all' }))
  await wait(300)

  console.log('\n[4] 列表上的操作：接受')
  const pendingItem = listPage.data.list.find((t) => t.showAccept)
  check(!!pendingItem, '存在待接受任务：' + (pendingItem && pendingItem.title))
  if (pendingItem) {
    await listPage.onAccept(evt({ id: pendingItem.id }))
    await wait(400)
    const after = listPage.data.list.find((t) => t.id === pendingItem.id)
    check(!after || after.myStatus !== 'pending', '接受后状态更新')
  }

  console.log('\n[5] 详情页')
  const anyTask = listPage.data.list.find((t) => t.isMulti) || listPage.data.list[0]
  const detail = loadPage('pages/tasks/detail/index', {})
  detail.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!detail.data.task, '详情加载：' + (detail.data.task && detail.data.task.title))
  check(detail.data.task.participants.length > 0, '参与者 ' + detail.data.task.participants.length + ' 人')
  check(!!detail.data.task.bylineText, '引导语：' + detail.data.task.bylineText)
  check(detail.data.task.barMode !== undefined, '操作条模式：' + detail.data.task.barMode)

  console.log('\n[6] 完成页')
  const complete = loadPage('pages/tasks/complete/index', {})
  complete.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!complete.data.task, '完成页拿到任务')
  check(!!complete.data.hint, '提示：' + complete.data.hint)
  complete.useQuick(evt({ text: '我搞定了' }))
  check(complete.data.remark === '我搞定了', '快捷语写入备注')
  complete.chooseImage()
  check(complete.data.images.length === 2, '选图 ' + complete.data.images.length + ' 张')
  complete.removeImage(evt({ index: 0 }))
  check(complete.data.images.length === 1, '删图后剩 1 张')

  console.log('\n[7] 布置任务 + 选人')
  const create = loadPage('pages/tasks/create/index', {})
  create.onLoad({})
  await wait(300)
  check(!!create.data.deadlineText, '默认截止：' + create.data.deadlineText)
  check(create.data.canSubmit === false, '未填标题时不能提交')

  const picker = loadPage('pages/tasks/participants/index', {})
  picker.onLoad({ mode: 'create', selected: '' })
  await wait(400)
  check(picker.data.friends.length > 0, '好友可选 ' + picker.data.friends.length + ' 人')
  picker.toggle(evt({ id: picker.data.friends[0].id }))
  picker.toggle(evt({ id: picker.data.friends[1].id }))
  check(picker.data.selected.length === 2, '选了两个')
  const pickedUsers = picker.data.all.filter((f) => picker.data.selected.indexOf(f.id) >= 0)
  create.applyParticipants(pickedUsers)
  check(create.data.participants.length === 2, '创建页收到 2 个参与者')

  create.onTitle(evt({}, { value: '换一下客厅的灯泡' }))
  check(create.data.canSubmit === true, '填完可以提交')
  await create.submit()
  await wait(700)
  const created = calls.nav[calls.nav.length - 1]
  check(calls.toast.some((t) => t.indexOf('已交给') >= 0) || created === 'back', '发布成功：' + JSON.stringify(calls.toast.slice(-1)))

  console.log('\n[8] 服务通知')
  const messages = loadPage('pages/messages/index/index', {})
  messages.onLoad({})
  await wait(400)
  check(messages.data.list.length > 0, '通知 ' + messages.data.list.length + ' 条')
  check(messages.data.list[0].fields.length >= 3, '卡片字段 ' + messages.data.list[0].fields.length + ' 行')
  console.log('    ' + messages.data.list[0].title + '｜' + messages.data.list[0].fields.map((f) => f.label + ':' + f.value).join('  '))
  await messages.markAll()
  check(messages.data.unread === 0, '全部已读')

  console.log('\n[9] 好友')
  const friends = loadPage('pages/friends/index/index', {})
  friends.onLoad({})
  await wait(500)
  check(friends.data.friends.length > 0, '好友 ' + friends.data.friends.length + ' 个')
  check(friends.data.requests.length > 0, '待处理请求 ' + friends.data.requests.length + ' 个')
  check(!!friends.data.inviteCode, '邀请码 ' + friends.data.inviteCode)
  const reqId = friends.data.requests[0].requestId
  await friends.accept(evt({ id: reqId }))
  await wait(400)
  check(friends.data.requests.length === 0, '同意后请求清空')

  console.log('\n[10] 我的 / 设置')
  const mine = loadPage('pages/mine/index/index', {})
  mine.onLoad({})
  await wait(400)
  check(!!mine.data.user, '资料：' + (mine.data.user && mine.data.user.nickname))
  check(typeof mine.data.stats.friendCount === 'number', '统计好友数 ' + mine.data.stats.friendCount)
  check(!!mine.data.rateText, '准时率 ' + mine.data.rateText)

  const settings = loadPage('pages/mine/settings/index', {})
  settings.onLoad({})
  check(settings.data.list.length === 4, '四个订阅模板')
  await settings.toggle(evt({ key: 'TASK_ASSIGNED', index: 0 }))
  check(true, '模板占位未配置时不报错')

  const profile = loadPage('pages/mine/profile/index', {})
  profile.onLoad({})
  await wait(300)
  check(profile.data.nickname === '小林', '资料页回填 ' + profile.data.nickname)

  const invite = loadPage('pages/friends/invite/index', {})
  invite.onLoad({})
  await wait(300)
  check(!!invite.data.inviteCode, '邀请页邀请码 ' + invite.data.inviteCode)

  console.log('\n' + (errors === 0 ? '全部通过' : errors + ' 个失败'))
  if (errors) process.exitCode = 1
}

run().catch((e) => {
  console.error('\n跑挂了：', e)
  process.exitCode = 1
})
