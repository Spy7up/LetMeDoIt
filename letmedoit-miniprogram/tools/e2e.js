/**
 * 真实后端联调（真 sa-app + 真 MySQL + 真 Redis）
 *
 * 与 sim.js 的区别：
 *  - sim.js 连 tools/contract-server（内存假数据），只验证前端链路自洽
 *  - 本脚本连 sa-app，验证前后端字段/枚举/路径真的对得上
 *
 * 只桩 wx，services/* 与 utils/request.js 全部走真实代码路径。
 *
 * 用法：
 *   node tools/e2e.js                  # 默认用 config 里的 dev 地址
 *   node tools/e2e.js http://x:8081    # 指定后端
 *
 * 前置：
 *   - sa-app 已启动，且已执行 docs/sql/letmedoit_task.sql
 *   - 该实例的 wx.miniapp.mock 必须为 true：脚本用假 code 登录，
 *     关掉 mock 后 code 换不到 openid（真实登录只能在微信开发者工具里跑）
 */
const path = require('path')

const ROOT = path.resolve(__dirname, '../miniprogram')
/** 默认跟随小程序当前环境，改 config 的 ENV 后脚本自动指向同一后端 */
const BASE = process.argv[2] || require(path.join(ROOT, 'config/index')).BASE_URL

/* ---------------- wx 桩 ---------------- */

const storage = {}
let loginCode = 'e2e_base'
let lastHeaders = {}

function httpRequest(opt) {
  const payload = opt.data == null ? '' : JSON.stringify(opt.data)
  lastHeaders = Object.assign({}, opt.header || {})
  const u = new URL(opt.url)
  const http = require('http')
  const req = http.request(
    {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: opt.method || 'GET',
      headers: Object.assign(
        { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
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
        } catch (e) {}
        if (opt.success) opt.success({ statusCode: res.statusCode, data })
      })
    }
  )
  req.on('error', (e) => opt.fail && opt.fail({ errMsg: 'request:fail ' + e.message }))
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
  login: (opt) => setTimeout(() => opt.success({ code: loginCode }), 1),
  request: httpRequest,
  requestSubscribeMessage: (opt) => opt.success({}),
  showToast: () => {},
  showLoading: () => {},
  hideLoading: () => {},
  showModal: (o) => o.success && o.success({ confirm: true, content: '测试' }),
  showActionSheet: (o) => o.success && o.success({ tapIndex: 0 }),
  navigateTo: () => {},
  redirectTo: () => {},
  switchTab: () => {},
  reLaunch: () => {},
  navigateBack: () => {},
  stopPullDownRefresh: () => {},
  vibrateShort: () => {},
  chooseMedia: (o) =>
    o.success({ tempFiles: [{ tempFilePath: 'wxfile://a.jpg' }, { tempFilePath: 'wxfile://b.jpg' }] }),
  previewImage: () => {},
  setClipboardData: (o) => o.success && o.success(),
}
global.getApp = () => null
global.getCurrentPages = () => []
global.App = () => {}
global.Page = () => {}
global.Component = () => {}

/* ---------------- 断言 ---------------- */

let pass = 0
const fails = []
function check(cond, msg, extra) {
  if (cond) {
    pass++
    console.log('  ✓ ' + msg)
  } else {
    fails.push(msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''))
    console.log('  ✗ ' + msg + (extra !== undefined ? ' → ' + JSON.stringify(extra) : ''))
  }
}
function section(t) {
  console.log('\n' + t)
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms || 80))
const api = (m) => require(path.join(ROOT, 'services/' + m))

/* ---------------- 账号 ---------------- */

const ACC = {
  granny: 'e2e_granny_v1',
  kid: 'e2e_kid_v1',
  // 每次跑用全新会员，保证「申请 → 同意」链路可重复验证（固定 code 第二次会撞「已经是好友了」）
  third: 'e2e_third_' + Date.now(),
}
const users = {}
/** 每个账号登录一次就复用 token：sa-app 对同一 IP 有 30 次/分钟的登录限频 */
const tokenCache = {}

/** 切号：优先复用 token，没有才真登录 */
async function as(name, nickname) {
  loginCode = ACC[name]
  const auth = api('auth')

  if (!tokenCache[name]) {
    wx.removeStorageSync('lmd_app_token')
    users[name] = await auth.login()
    tokenCache[name] = storage['lmd_app_token']
  }
  wx.setStorageSync('lmd_app_token', tokenCache[name])

  let me = users[name] || (await auth.getProfile())
  if (nickname && me.nickname !== nickname) {
    me = await auth.updateProfile({ nickname })
  }
  users[name] = me
  return me
}

/* ---------------- 场景 ---------------- */

async function run() {
  require(path.join(ROOT, 'config/index')).BASE_URL = BASE
  console.log('后端：' + BASE)

  section('[1] 微信登录（mock openid）+ 鉴权头')
  let granny
  try {
    granny = await as('granny', '奶奶')
  } catch (e) {
    if (/微信登录失败/.test(e.message || '')) {
      console.error('\n该后端 wx.miniapp.mock 已关闭，脚本的假 code 换不到 openid。')
      console.error('要跑本脚本，请把该实例的 mock 打开（wx.miniapp.mock: true 并重启）。')
      console.error('真实登录链路只能在微信开发者工具里验证。')
      process.exitCode = 2
      return
    }
    throw e
  }
  check(!!granny && !!granny.id, '登录拿到会员：' + (granny && granny.nickname) + ' / id=' + (granny && granny.id))
  check(!!storage['lmd_app_token'], 'token 已落本地')
  check(typeof granny.id === 'string', 'Long 型 id 被转成字符串 ' + granny.id)

  // login 本身免鉴权，所以鉴权头要在一次真实业务请求之后再查
  await api('auth').getProfile()
  check(
    String(lastHeaders['App-Token'] || '').indexOf('Bearer ') === 0,
    '鉴权头 App-Token: Bearer …',
    lastHeaders['App-Token']
  )

  section('[2] 邀请码加好友（面对面路径，无需确认）')
  const friendSvc = api('friend')
  const invite = await friendSvc.getInvite()
  check(!!invite.inviteCode, '奶奶的邀请码 ' + invite.inviteCode)
  check(!!invite.sharePath, '分享路径 ' + invite.sharePath)

  const kid = await as('kid', '小明')
  check(kid.id !== granny.id, '两个 mock code 得到两个不同会员 ' + granny.id + ' / ' + kid.id)

  let kidFriends = await friendSvc.list()
  const already = kidFriends.some((f) => f.userId === granny.id)
  if (!already) {
    await friendSvc.acceptInviteCode(invite.inviteCode)
  }
  kidFriends = await friendSvc.list()
  const grannyInKid = kidFriends.find((f) => f.userId === granny.id)
  check(!!grannyInKid, '小明的好友列表里有奶奶（好友 ' + kidFriends.length + ' 人）')
  check(!!grannyInKid && !!grannyInKid.id, '好友项带 friendId ' + (grannyInKid && grannyInKid.id))
  check(
    !!grannyInKid && !!grannyInKid.displayName,
    'displayName 回退昵称：' + (grannyInKid && grannyInKid.displayName)
  )

  section('[3] 好友申请 → 同意（双向）')
  const third = await as('third', '表姐')
  const reqs = await friendSvc.listRequests()
  if (!reqs.some((r) => r.fromUser && r.fromUser.id === granny.id)) {
    await friendSvc.request(granny.id, '我是奶奶')
  }
  const mine = await as('granny', '奶奶')
  check(mine.id === granny.id, '切回奶奶账号，token 独立生效')
  const inbox = await friendSvc.listRequests()
  const fromThird = inbox.find((r) => r.fromUser && r.fromUser.id === third.id)
  check(!!fromThird, '奶奶收到表姐的申请 ' + (fromThird && fromThird.message))
  if (fromThird) {
    await friendSvc.acceptRequest(fromThird.id)
    const after = await friendSvc.list()
    check(after.some((f) => f.userId === third.id), '同意后成为好友，奶奶好友 ' + after.length + ' 人')
  }

  section('[4] 布置任务（多人 · 全员完成）')
  // 表姐要能把任务布置给小明的任务，先让两人成为好友（后端要求参与者必须是好友）
  await as('kid', '小明')
  const kidInvite = await friendSvc.getInvite()
  await as('third', '表姐')
  const thirdFriends = await friendSvc.list()
  if (!thirdFriends.some((f) => f.userId === users.kid.id)) {
    await friendSvc.acceptInviteCode(kidInvite.inviteCode)
  }
  check(
    (await friendSvc.list()).some((f) => f.userId === users.kid.id),
    '表姐与小明互为好友（第三方任务的前提）'
  )

  await as('granny', '奶奶')
  const taskSvc = api('task')
  const deadline = new Date(Date.now() + 3 * 3600 * 1000)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  const dl =
    deadline.getFullYear() +
    '-' + pad(deadline.getMonth() + 1) +
    '-' + pad(deadline.getDate()) +
    ' ' + pad(deadline.getHours()) +
    ':' + pad(deadline.getMinutes()) +
    ':' + pad(deadline.getSeconds())

  const created = await taskSvc.create({
    title: '联调-晾衣服',
    description: '阳台的衣服',
    participantIds: [kid.id, third.id],
    completionMode: 'all',
    deadline: dl,
    remindMinutes: 10,
  })
  check(!!created && !!created.id, '创建成功 taskId=' + (created && created.id))
  check(created && created.participants.length === 2, '参与者 ' + (created && created.participants.length) + ' 人')
  check(created && created.status === 'pending', '初始聚合状态 = ' + (created && created.status))
  check(created && created.isCreator === true, '创建者视角 isCreator=true')
  check(created && created.canEdit === true, '待接受时可编辑 canEdit=true')
  check(created && created.events.length >= 1, '时间线 ' + (created && created.events.length) + ' 条')
  check(created && created.deadline.indexOf('T') > 0, '时间已转 ISO 给展示层 ' + (created && created.deadline))

  const taskId = created.id

  section('[5] 收到方视角：列表 / 详情 / 权限位')
  await as('kid', '小明')
  const listAll = await taskSvc.list({ role: 'assignee', status: 'all' })
  const row = listAll.list.find((t) => t.id === taskId)
  check(!!row, '小明的收到列表里有该任务（共 ' + listAll.list.length + ' 条）')
  check(!!row && row.role === 'assignee', 'role 正确 ' + (row && row.role))
  check(!!row && row.myStatus === 'pending', '我在任务里的状态 pending')
  check(!!row && row.counterpart && row.counterpart.id === granny.id, 'counterpart 是委托人')
  check(!!row && typeof row.progress.total === 'number', 'progress ' + JSON.stringify(row && row.progress))

  const detail = await taskSvc.detail(taskId)
  check(detail.me && detail.me.canAccept === true, 'canAccept=true（服务端算的权限位）')
  check(detail.me && detail.me.canComplete === false, 'canComplete=false（还没接受）')
  check(detail.canCancel === false, '非创建者不能撤回')
  check(detail.participants.length === 2, '参与者明细 ' + detail.participants.length + ' 人')
  check(
    detail.participants.every((p) => typeof p.status === 'string'),
    '参与者状态已转字符串 ' + detail.participants.map((p) => p.status).join('/')
  )

  section('[6] 状态机：接受 → 完成（一人完成，他人不受影响）')
  const accepted = await taskSvc.accept(taskId)
  check(accepted.status === 'in_progress', '接受后聚合状态 ' + accepted.status)
  check(accepted.me && accepted.me.status === 'accepted', '我的格子 accepted')
  check(accepted.me && accepted.me.canComplete === true, '接受后 canComplete=true')

  const done = await taskSvc.complete(taskId, { remark: '晾好了', images: [] })
  check(done.me && done.me.status === 'done', '完成接口把本格置 done')
  check(done.progress.done === 1, '完成数 ' + done.progress.done + '/2 仍进行中（全员完成模式）')
  check(done.status === 'in_progress', '聚合状态仍是 ' + done.status)

  section('[7] 委托方视角：进度 / 催办限频 / 撤回权限')
  await as('granny', '奶奶')
  const fromCreator = await taskSvc.detail(taskId)
  check(fromCreator.progress.done === 1, '委托方看到完成进度 ' + fromCreator.progress.done + '/' + fromCreator.progress.total)
  check(fromCreator.canEdit === false, '进行中不可编辑 canEdit=false（只允许预约中/待接受改）')
  check(fromCreator.canRemind === true, '可催办 canRemind=true')

  const reminded = await taskSvc.remind(taskId)
  check(!!reminded && reminded.id === taskId, '催办成功，返回最新详情')
  let limited = false
  try {
    await taskSvc.remind(taskId)
  } catch (e) {
    limited = e.code === 30001
    if (!limited) console.log('    非限频错误：' + e.message + ' code=' + e.code)
  }
  check(limited, '60 秒内重复催办被拦（code=30001）')

  section('[8] 服务通知（任务事件驱动）')
  const noticeSvc = api('notice')
  await as('third', '表姐')
  const notices = await noticeSvc.list({ unreadFlag: true, limit: 10 })
  check(Array.isArray(notices.list), '通知返回列表 ' + notices.list.length + ' 条')
  check(typeof notices.unreadCount === 'number', '未读数 ' + notices.unreadCount)
  const hit = notices.list.find((n) => n.taskId === taskId)
  check(!!hit, '表姐收到该任务的通知：' + (hit && hit.title))
  check(!!hit && hit.fields.length >= 1, '卡片字段 ' + (hit && hit.fields.length) + ' 行：' + JSON.stringify(hit && hit.fields))
  check(!!hit && typeof hit.read === 'boolean', 'read 字段已布尔化 ' + (hit && hit.read))

  const unread = await noticeSvc.unreadCount()
  check(typeof unread === 'number', '未读数接口 ' + unread)
  if (hit) {
    const left = await noticeSvc.markRead([hit.id])
    check(typeof left === 'number', '标记已读后剩余未读 ' + left)
  }

  section('[9] 摘要 / 统计 / 好友数')
  await as('kid', '小明')
  const summary = await taskSvc.summary()
  check(typeof summary.assignee === 'number', '摘要-等我回应 ' + summary.assignee)
  check(typeof summary.overdue === 'number', '摘要-逾期 ' + summary.overdue)
  check(Array.isArray(summary.waitingUsers), '摘要-等我的人 ' + summary.waitingUsers.length + ' 位')

  const stats = await taskSvc.stats()
  check(typeof stats.receivedCount === 'number', '统计-收到 ' + stats.receivedCount)
  check(typeof stats.onTimeRate === 'number', '统计-准时率 ' + stats.onTimeRate)
  check(stats.friendCount >= 1, '统计-好友数 ' + stats.friendCount)

  section('[10] 列表筛选（枚举 → 后端查询）')
  const pendingList = await taskSvc.list({ role: 'assignee', status: 'pending' })
  check(
    pendingList.list.every((t) => t.status === 'pending'),
    '待接受筛选 ' + pendingList.list.length + ' 条'
  )
  const overdueList = await taskSvc.list({ role: 'assignee', status: 'overdue' })
  check(
    overdueList.list.every((t) => t.displayStatus === 'overdue'),
    '逾期筛选 ' + overdueList.list.length + ' 条'
  )

  section('[11] 拒绝自己那一格')
  const dl2 = new Date(Date.now() + 2 * 3600 * 1000)
  const dl2s =
    dl2.getFullYear() + '-' + pad(dl2.getMonth() + 1) + '-' + pad(dl2.getDate()) +
    ' ' + pad(dl2.getHours()) + ':' + pad(dl2.getMinutes()) + ':00'
  await as('third', '表姐')
  const t2 = await taskSvc.create({
    title: '联调-取快递',
    participantIds: [kid.id],
    completionMode: 'any',
    deadline: dl2s,
    remindMinutes: 0,
  })
  await as('kid', '小明')
  const rejected = await taskSvc.reject(t2.id, '今晚不在家')
  const meSlot = rejected.participants.find((p) => p.userId === users.kid.id)
  check(meSlot && meSlot.status === 'rejected', '拒绝后我的格子 = ' + (meSlot && meSlot.status))
  check(meSlot && meSlot.rejectReason === '今晚不在家', '拒绝理由落库')
  check(rejected.status === 'rejected', '单人拒绝时任务聚合状态 = ' + rejected.status)

  section('[12] 撤回')
  await as('third', '表姐')
  const dl3 = new Date(Date.now() + 5 * 3600 * 1000)
  const dl3s =
    dl3.getFullYear() + '-' + pad(dl3.getMonth() + 1) + '-' + pad(dl3.getDate()) +
    ' ' + pad(dl3.getHours()) + ':' + pad(dl3.getMinutes()) + ':00'
  const t3 = await taskSvc.create({
    title: '联调-撤回我',
    participantIds: [kid.id],
    completionMode: 'any',
    deadline: dl3s,
    remindMinutes: 0,
  })
  const cancelled = await taskSvc.cancel(t3.id)
  check(cancelled.status === 'cancelled', '撤回后状态 ' + cancelled.status)

  section('[13] 任一人完成 → 其他人自动跳过')
  await as('granny', '奶奶')
  const dl4 = new Date(Date.now() + 6 * 3600 * 1000)
  const dl4s =
    dl4.getFullYear() + '-' + pad(dl4.getMonth() + 1) + '-' + pad(dl4.getDate()) +
    ' ' + pad(dl4.getHours()) + ':' + pad(dl4.getMinutes()) + ':00'
  const t4 = await taskSvc.create({
    title: '联调-任一人完成',
    participantIds: [kid.id, third.id],
    completionMode: 'any',
    deadline: dl4s,
    remindMinutes: 0,
  })
  check(t4.completionMode === 'any', '完成条件 any')

  await as('kid', '小明')
  await taskSvc.accept(t4.id)
  const anyDone = await taskSvc.complete(t4.id, { remark: '我先做完了' })
  check(anyDone.status === 'completed', '任一人完成后整单状态 ' + anyDone.status)
  const thirdSlot = anyDone.participants.find((p) => p.userId === users.third.id)
  check(thirdSlot && thirdSlot.status === 'skipped', '另一人的格子被跳过 = ' + (thirdSlot && thirdSlot.status))
  check(anyDone.progress.skipped === 1, '跳过计数 ' + anyDone.progress.skipped)

  await as('third', '表姐')
  const thirdView = await taskSvc.detail(t4.id)
  check(thirdView.status === 'completed', '被跳过的人看到任务已完成')
  check(thirdView.me && thirdView.me.status === 'skipped', '被跳过的人 me.status = ' + (thirdView.me && thirdView.me.status))
  check(!thirdView.me || thirdView.me.canComplete === false, '被跳过的人不能再完成')

  section('[14] 错误路径')
  try {
    await taskSvc.detail(99999999)
    check(false, '不存在的任务应报错')
  } catch (e) {
    check(!!e.message && e.code !== 0, '不存在任务返回 code=' + e.code + ' msg=' + e.message)
  }
  try {
    await taskSvc.complete(t2.id, { remark: 'x' })
    check(false, '已拒绝任务不应能完成')
  } catch (e) {
    check(!!e.message, '非法状态流转被拦：' + e.message)
  }

  section('[15] 登录态失效自动重登')
  storage['lmd_app_token'] = 'tok_expired_for_e2e'
  const after = await taskSvc.summary()
  check(typeof after.assignee === 'number', '过期 token 自动换新并重放成功')
  check(storage['lmd_app_token'] !== 'tok_expired_for_e2e', '本地 token 已刷新')

  section('结果')
  console.log('  通过 ' + pass + ' 项，失败 ' + fails.length + ' 项')
  if (fails.length) {
    console.log('\n失败明细：')
    fails.forEach((f, i) => console.log('  ' + (i + 1) + '. ' + f))
    process.exitCode = 1
  }
}

run().catch((e) => {
  console.error('\n跑挂了：', e.message || e)
  if (e && e.raw) console.error('  后端返回：', JSON.stringify(e.raw))
  process.exitCode = 1
})
