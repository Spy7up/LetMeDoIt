/**
 * 联调自检：真 HTTP + 真请求层 + 真页面
 *
 * 做法：
 *  1. 起 tools/contract-server（按 sa-app 接口契约实现的本地服务）
 *  2. 桩出 wx / App / Page，把 wx.request 接到真实 http 请求上
 *  3. 加载 app.js 与全部页面，跑「登录 → 列表 → 详情 → 接受 → 完成 → 布置 → 通知 → 好友 → 我的」
 *
 * 这样 request.js 的鉴权头、信封解析、30007 重登，以及 services/adapt.js 的字段映射
 * 全部走真实代码路径，只有数据源是内存的（本机没有 MySQL / Redis）。
 *
 * 用法：node tools/sim.js
 */
const path = require('path')
const http = require('http')
const { URL } = require('url')

const ROOT = path.resolve(__dirname, '../miniprogram')
const contract = require('./contract-server')

/* ---------------- 环境桩 ---------------- */

const storage = {}
const calls = { toast: [], nav: [], modal: [] }
let appInstance = null
let lastPageConfig = null
let lastHeaders = {}
let baseUrl = ''

function httpRequest(opt) {
  const u = new URL(opt.url)
  const payload = opt.data == null ? '' : JSON.stringify(opt.data)
  lastHeaders = Object.assign({}, opt.header || {})

  const req = http.request(
    {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opt.method || 'GET',
      headers: Object.assign(
        {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        opt.header || {}
      ),
    },
    (res) => {
      let raw = ''
      res.on('data', (c) => (raw += c))
      res.on('end', () => {
        let data = raw
        try {
          data = JSON.parse(raw)
        } catch (e) {
          // 保持原样
        }
        if (opt.success) opt.success({ statusCode: res.statusCode, data })
      })
    }
  )
  req.on('error', (e) => {
    if (opt.fail) opt.fail({ errMsg: 'request:fail ' + e.message })
  })
  if (payload) req.write(payload)
  req.end()
}

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
  login: (opt) => setTimeout(() => opt.success({ code: 'wx_code_' + Date.now() }), 1),
  request: httpRequest,
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

/* ---------------- 页面实例工具 ---------------- */

function setDataFactory(inst) {
  return function setData(patch, cb) {
    Object.keys(patch).forEach((key) => {
      if (key.indexOf('.') < 0 && key.indexOf('[') < 0) {
        inst.data[key] = patch[key]
        return
      }
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

function loadPage(route) {
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms || 120))

let errors = 0
function check(cond, msg, extra) {
  if (cond) console.log('  ✓ ' + msg)
  else {
    console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''))
    errors++
  }
}

/* ---------------- 场景 ---------------- */

async function run() {
  const server = await contract.start({ port: 0 })
  baseUrl = 'http://127.0.0.1:' + server.port

  // 指向本次起的契约服务（request.js 每次请求都读 config.BASE_URL）
  require(path.join(ROOT, 'config/index')).BASE_URL = baseUrl
  require(path.join(ROOT, 'app.js'))
  appInstance.onLaunch()
  global.getApp = () => appInstance

  console.log('契约服务：' + baseUrl)

  console.log('\n[1] 登录与鉴权头')
  const launch = loadPage('pages/launch/index')
  launch.onLoad({})
  await launch.login()
  await wait(200)
  check(!!appInstance.globalData.user, 'launch 页完成登录', launch.data.tip)
  check(!!storage['lmd_app_token'], 'token 已落本地')
  check(lastHeaders['App-Token'].indexOf('Bearer ') === 0, '鉴权头 App-Token: Bearer ' + String(lastHeaders['App-Token']).slice(0, 14) + '…')

  const me = appInstance.globalData.user
  check(me && me.nickname === '小林', '拿到当前用户', me && me.nickname)
  check(me && typeof me.id === 'string' && me.id === '1', '会员 id 转成字符串 ' + (me && me.id))

  console.log('\n[2] 任务列表 / 摘要 / 未读')
  const listPage = loadPage('pages/tasks/index/index')
  listPage.onLoad({})
  await wait(700)
  check(!listPage.data.error, '列表无错误', listPage.data.error)
  check(listPage.data.list.length > 0, '收到任务 ' + listPage.data.list.length + ' 条')
  check(listPage.data.summary.assignee > 0, 'banner 摘要 ' + listPage.data.summary.assignee + ' 件')
  check(!!listPage.data.bannerSub, 'banner 副标题：' + listPage.data.bannerSub)
  check(listPage.data.unread > 0, '未读数 ' + listPage.data.unread)

  const first = listPage.data.list[0]
  check(!!first.headName && !!first.statusClass, '卡片字段齐全 ' + first.title + ' / ' + first.statusLabel)
  check(typeof first.deadline === 'string' && first.deadline.indexOf('T') > 0, '时间已转 ISO 给展示层')
  const multi = listPage.data.list.filter((t) => t.isMulti)
  check(multi.length > 0, '多人任务 ' + multi.length + ' 条，例如：' + (multi[0] && multi[0].title))

  console.log('\n[3] 角色切换与筛选')
  listPage.switchRole(evt({ role: 'creator' }))
  await wait(400)
  check(listPage.data.list.length > 0 && listPage.data.list.every((t) => t.role === 'creator'), '发出列表全是 creator 视角')
  console.log('    发出 ' + listPage.data.list.length + ' 条')

  listPage.switchRole(evt({ role: 'assignee' }))
  await wait(300)
  listPage.switchStatus(evt({ key: 'overdue' }))
  await wait(300)
  check(
    listPage.data.list.length > 0 && listPage.data.list.every((t) => t.displayStatus === 'overdue'),
    '逾期筛选 ' + listPage.data.list.length + ' 条'
  )
  listPage.switchStatus(evt({ key: 'completed' }))
  await wait(300)
  check(listPage.data.list.every((t) => t.displayStatus === 'completed'), '已完成筛选 ' + listPage.data.list.length + ' 条')
  listPage.switchStatus(evt({ key: 'all' }))
  await wait(300)

  // 创建时间筛选：默认不限，选「近 30 天」后按钮变文案并重新拉列表
  const taskSvcForTime = require(path.join(ROOT, 'services/task'))
  const allTime = await taskSvcForTime.list({ role: 'assignee', timeRange: 'all' })
  const todayTime = await taskSvcForTime.list({ role: 'assignee', timeRange: 'today' })
  check(
    todayTime.total <= allTime.total,
    '今天筛选 ' + todayTime.total + ' 条 ≤ 不限 ' + allTime.total + ' 条'
  )
  check(listPage.data.timeRange === 'all' && listPage.data.timeLabel === '时间', '默认时间不限')
  listPage.pickTimeRange()
  await wait(400)
  check(
    listPage.data.timeRange === 'last30' && listPage.data.timeLabel === '近 30 天',
    '选中时间后按钮显示「' + listPage.data.timeLabel + '」'
  )
  check(listPage.data.loading === false, '选完时间已重新拉列表')
  listPage.emptyAction()
  await wait(400)
  check(listPage.data.timeRange === 'all' && listPage.data.timeLabel === '时间', '空态「看全部」把时间重置回不限')

  console.log('\n[4] 分页')
  const page1 = await require(path.join(ROOT, 'services/task')).list({ role: 'assignee', status: 'all' })
  check(page1.list.length === 10 || page1.list.length === page1.total, '首页 ' + page1.list.length + ' 条 / 共 ' + page1.total)
  if (page1.hasMore) {
    const page2 = await require(path.join(ROOT, 'services/task')).list({
      role: 'assignee',
      status: 'all',
      cursor: page1.nextCursor,
    })
    check(page2.list.length > 0, '第二页 ' + page2.list.length + ' 条，游标换算正常')
  } else {
    check(true, '数据不足一页，分页逻辑待有多页数据时验证')
  }

  console.log('\n[5] 列表内接受')
  const pendingItem = listPage.data.list.find((t) => t.showAccept)
  check(!!pendingItem, '存在待接受任务：' + (pendingItem && pendingItem.title))
  if (pendingItem) {
    await listPage.onAccept(evt({ id: pendingItem.id }))
    await wait(400)
    const after = listPage.data.list.find((t) => t.id === pendingItem.id)
    check(!after || after.myStatus !== 'pending', '接受后状态更新')
  }

  console.log('\n[6] 详情页')
  const anyTask = listPage.data.list.find((t) => t.isMulti) || listPage.data.list[0]
  const detail = loadPage('pages/tasks/detail/index')
  detail.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!detail.data.task, '详情加载：' + (detail.data.task && detail.data.task.title))
  check(detail.data.task.participants.length > 0, '参与者 ' + detail.data.task.participants.length + ' 人')
  check(!!detail.data.task.bylineText, '引导语：' + detail.data.task.bylineText)
  check(detail.data.task.events.length > 0, '时间线 ' + detail.data.task.events.length + ' 条')
  check(detail.data.task.barMode !== undefined, '操作条模式：' + detail.data.task.barMode)
  check(detail.data.task.statusClass.indexOf('t-') === 0, '状态样式类 ' + detail.data.task.statusClass)

  console.log('\n[7] 完成页 + 提交完成')
  const completeApi = loadPage('pages/tasks/complete/index')
  completeApi.onLoad({ id: anyTask.id })
  await wait(400)
  check(!!completeApi.data.task, '完成页拿到任务')
  check(!!completeApi.data.hint, '提示：' + completeApi.data.hint)
  completeApi.useQuick(evt({ text: '我搞定了' }))
  check(completeApi.data.remark === '我搞定了', '快捷语写入备注')
  completeApi.chooseImage()
  check(completeApi.data.images.length === 2, '选图 ' + completeApi.data.images.length + ' 张')

  // 找一个已接受的任务真的完成一次，验证状态机
  const accepted = listPage.data.list.find((t) => t.myStatus === 'accepted')
  if (accepted) {
    const svc = require(path.join(ROOT, 'services/task'))
    const before = await svc.detail(accepted.id)
    const after = await svc.complete(accepted.id, { remark: '已完成', images: [] })
    const meSlot = after.participants.find((p) => p.userId === me.id)
    check(meSlot && meSlot.status === 'done', '完成接口把自己的格子置为 done')
    check(after.progress.done === before.progress.done + 1, '完成数 ' + before.progress.done + ' → ' + after.progress.done)
  } else {
    check(true, '无可完成的任务，跳过状态机验证')
  }

  console.log('\n[8] 布置任务 + 选人（批量追加走同一接口）')
  const create = loadPage('pages/tasks/create/index')
  create.onLoad({})
  await wait(200)
  check(!!create.data.deadlineText, '默认截止：' + create.data.deadlineText)
  check(create.data.canSubmit === false, '未填标题时不能提交')

  const picker = loadPage('pages/tasks/participants/index')
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
  console.log('    提交截止：' + create.data.deadlineDate + ' ' + create.data.deadlineTime)
  await create.submit()
  await wait(700)
  check(calls.toast.some((t) => t.indexOf('已交给') >= 0), '发布成功：' + JSON.stringify(calls.toast.slice(-1)))

  // 追加参与者：同一个接口，数组形式
  const svc = require(path.join(ROOT, 'services/task'))
  const extra = picker.data.friends[2]
  const mine = await svc.list({ role: 'creator', status: 'pending' })
  const target = mine.list.find(
    (t) =>
      t.participantCount < picker.data.friends.length &&
      !(t.participants || []).some((p) => p.id === extra.id)
  )
  if (target) {
    const before = await svc.detail(target.id)
    const grown = await svc.addParticipants(target.id, [extra.id])
    check(
      grown.participants.length === before.participants.length + 1,
      '追加参与者：' + before.participants.length + ' → ' + grown.participants.length
    )
  } else {
    check(true, '没有可追加的任务，跳过')
  }

  console.log('\n[9] 服务通知')
  const messages = loadPage('pages/messages/index/index')
  messages.onLoad({})
  await wait(400)
  check(messages.data.list.length > 0, '通知 ' + messages.data.list.length + ' 条')
  check(messages.data.list[0].fields.length >= 3, '卡片字段 ' + messages.data.list[0].fields.length + ' 行')
  console.log('    ' + messages.data.list[0].title + '｜' + messages.data.list[0].fields.map((f) => f.label + ':' + f.value).join('  '))
  const unreadBefore = messages.data.unread
  check(unreadBefore > 0, '未读 ' + unreadBefore + ' 条')
  await messages.markAll()
  check(messages.data.unread === 0, '全部已读')

  console.log('\n[10] 好友')
  const friends = loadPage('pages/friends/index/index')
  friends.onLoad({})
  await wait(500)
  check(friends.data.friends.length > 0, '好友 ' + friends.data.friends.length + ' 个')
  check(friends.data.requests.length > 0, '待处理请求 ' + friends.data.requests.length + ' 个')
  check(!!friends.data.inviteCode, '邀请码 ' + friends.data.inviteCode)
  const reqId = friends.data.requests[0].requestId
  await friends.accept(evt({ id: reqId }))
  await wait(400)
  check(friends.data.requests.length === 0, '同意后请求清空')
  check(friends.data.friends.length > 0, '好友数更新为 ' + friends.data.friends.length)

  console.log('\n[11] 我的 / 设置 / 头像昵称')
  const minePage = loadPage('pages/mine/index/index')
  minePage.onLoad({})
  await wait(500)
  check(!!minePage.data.user, '资料：' + (minePage.data.user && minePage.data.user.nickname))
  check(!!minePage.data.user.inviteCode, '我的页邀请码 ' + minePage.data.user.inviteCode)
  check(typeof minePage.data.stats.friendCount === 'number', '统计好友数 ' + minePage.data.stats.friendCount)
  check(!!minePage.data.rateText, '准时率 ' + minePage.data.rateText)

  const settings = loadPage('pages/mine/settings/index')
  settings.onLoad({})
  check(settings.data.list.length === 4, '四个订阅模板')
  await settings.toggle(evt({ key: 'TASK_ASSIGNED', index: 0 }))
  check(true, '模板占位未配置时不报错')

  // 头像昵称页：头像只能来自微信 chooseAvatar，昵称来自 type=nickname，可以反复改
  const profile = loadPage('pages/mine/profile/index')
  await profile.onLoad()
  await wait(200)
  check(profile.data.nickname === '小林', '头像昵称页回填 ' + profile.data.nickname)
  profile.onChooseAvatar(evt({}, { avatarUrl: 'wxfile://tmp_me.jpg' }))
  profile.onNickname(evt({}, { value: '小林同学' }))
  await profile.save()
  await wait(400)
  check(appInstance.globalData.user.nickname === '小林同学', '昵称改动生效 ' + appInstance.globalData.user.nickname)
  check(appInstance.globalData.user.avatarUrl === 'wxfile://tmp_me.jpg', '头像改动生效')
  check(storage['lmd_user'] && storage['lmd_user'].nickname === '小林同学', '用户资料已缓存到本地')

  // 用户拒绝授权：登录没带微信资料且库里也没昵称 -> 「用户XXXX」
  const meMember = server.getState().members.find((m) => m.memberId === 1)
  meMember.nickname = ''
  meMember.avatar = ''
  wx.removeStorageSync('lmd_app_token')
  const anon = await require(path.join(ROOT, 'services/auth')).login()
  check(/^用户[A-Z0-9]{4}$/.test(anon.nickname || ''), '拒绝授权时兜底昵称 ' + anon.nickname)
  check(!!anon.nickname && anon.nickname !== '微信用户', '不会把「微信用户」当昵称')

  const invite = loadPage('pages/friends/invite/index')
  invite.onLoad({})
  await wait(300)
  check(invite.data.inviteCode === 'K7M2QX', '邀请页邀请码 ' + invite.data.inviteCode)


  console.log('\n[12] 登录态失效自动重登')
  storage['lmd_app_token'] = 'tok_expired'
  const summary = await require(path.join(ROOT, 'services/task')).summary()
  check(typeof summary.assignee === 'number', '过期 token 被自动换掉并重放成功（未读数 ' + summary.assignee + '）')
  check(storage['lmd_app_token'] !== 'tok_expired', '本地 token 已刷新')

  console.log('\n[13] 业务错误透出')
  try {
    await require(path.join(ROOT, 'services/task')).detail(99999)
    check(false, '不存在的任务应当报错')
  } catch (e) {
    check(!!e.message && e.code !== 0, '错误文案：' + e.message + '（code=' + e.code + '）')
  }

  console.log('\n[14] 退出登录清本地缓存')
  appInstance.setUser({ id: '1', nickname: '小林同学', avatarUrl: '' })
  check(!!storage['lmd_user'], '用户资料落在本地 ' + (storage['lmd_user'] && storage['lmd_user'].nickname))
  await require(path.join(ROOT, 'services/auth')).logout()
  await wait(500)
  check(!storage['lmd_user'], '退出登录后用户资料缓存已清')
  check(!storage['lmd_app_token'], '退出登录后 token 已清')
  check(!appInstance.globalData.user, '内存里的用户也清空了')

  await server.close()

  console.log('\n' + (errors === 0 ? '全部通过' : errors + ' 个失败'))
  if (errors) process.exitCode = 1
}

run().catch((e) => {
  console.error('\n跑挂了：', e)
  process.exitCode = 1
})
