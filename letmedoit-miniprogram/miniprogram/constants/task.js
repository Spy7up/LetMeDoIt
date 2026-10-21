/**
 * 任务常量与展示映射（唯一出口）
 * 任何页面/组件需要「状态文案 + 色值」都从这里取，禁止各自硬编码。
 */

const TaskStatus = {
  SCHEDULED: 'scheduled',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  // 派生状态，仅存在于展示层，不参与写操作
  OVERDUE: 'overdue',
}

/** 单个参与者在任务里的状态 */
const ParticipantStatus = {
  PENDING: 'pending', // 待接受
  ACCEPTED: 'accepted', // 已接受
  DONE: 'done', // 已完成自己那份
  REJECTED: 'rejected', // 拒绝参与
  SKIPPED: 'skipped', // 任一人模式被他人完成后，跳过
}

/** 完成条件 */
const CompletionMode = {
  ANY: 'any', // 任一人完成即整单完成
  ALL: 'all', // 所有人都完成才算完成
}

const STATUS_MAP = {
  scheduled: { label: '预约中', color: '#6B5BD2', bg: '#EFECFC' },
  pending: { label: '待接受', color: '#E08A00', bg: '#FDF3E2' },
  in_progress: { label: '进行中', color: '#D64C28', bg: '#FFEDE7' },
  overdue: { label: '已逾期', color: '#D64545', bg: '#FCEBEB' },
  completed: { label: '已完成', color: '#17A67C', bg: '#E4F6EF' },
  rejected: { label: '已拒绝', color: '#8C8279', bg: '#F1EDE9' },
  cancelled: { label: '已撤回', color: '#8C8279', bg: '#F1EDE9' },
}

const PARTICIPANT_STATUS_MAP = {
  pending: { label: '待接受', color: '#E08A00', bg: '#FDF3E2' },
  accepted: { label: '在做', color: '#D64C28', bg: '#FFEDE7' },
  done: { label: '已完成', color: '#17A67C', bg: '#E4F6EF' },
  rejected: { label: '已拒绝', color: '#8C8279', bg: '#F1EDE9' },
  skipped: { label: '无需参与', color: '#8C8279', bg: '#F1EDE9' },
}

const COMPLETION_MODE_MAP = {
  any: { label: '任一人完成即可', short: '任一人', hint: '谁先做完，这单就算完成' },
  all: { label: '所有人都要完成', short: '全员', hint: '每个人都要做自己那份' },
}

/* ---------------- 与后端约定的数值枚举 ----------------
 * 对应 sa-app 的 TaskStatusEnum / ParticipantStatusEnum / TaskRoleEnum / CompletionModeEnum。
 * 展示层一律用字符串，只在 services/adapt.js 的边界上互转，
 * 这样以后后端改数值也不用动页面。
 */
const TASK_STATUS_CODE = {
  0: 'scheduled',
  1: 'pending',
  2: 'in_progress',
  3: 'completed',
  4: 'rejected',
  5: 'cancelled',
}

const PARTICIPANT_STATUS_CODE = {
  0: 'pending',
  1: 'accepted',
  2: 'done',
  3: 'rejected',
  4: 'skipped',
}

/** 1 我收到的（我是参与者）／2 我发出的（我是委托人） */
const ROLE_CODE = { 1: 'assignee', 2: 'creator' }

/** 1 任一人完成 ／ 2 全员完成 */
const COMPLETION_MODE_CODE = { 1: 'any', 2: 'all' }

/** 列表筛选选项：order 决定 chips 顺序 */
const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待接受' },
  { key: 'in_progress', label: '进行中' },
  { key: 'completed', label: '已完成' },
  { key: 'overdue', label: '已逾期' },
]

/**
 * 列表筛选 → /api/task/query 的查询条件
 * 逾期是派生状态（status IN (1,2) AND deadline < now），不是 status 的取值。
 */
const STATUS_FILTER_QUERY = {
  all: {},
  pending: { status: 1 },
  in_progress: { status: 2 },
  completed: { status: 3 },
  overdue: { overdueFlag: true },
}

/**
 * 创建时间筛选：默认「不限」，列表本身按更新时间倒序
 * label 显示在筛选按钮上，code 对应后端 TaskTimeRangeEnum
 */
const TIME_RANGES = [
  { key: 'all', label: '不限', code: 0 },
  { key: 'today', label: '今天', code: 1 },
  { key: 'last7', label: '近 7 天', code: 2 },
  { key: 'last30', label: '近 30 天', code: 3 },
]

const TIME_RANGE_MAP = TIME_RANGES.reduce((acc, item) => {
  acc[item.key] = item
  return acc
}, {})

const REMIND_OPTIONS = [
  { key: 'none', label: '不提醒', minutes: 0 },
  { key: 'm10', label: '提前 10 分钟', minutes: 10 },
  { key: 'h1', label: '提前 1 小时', minutes: 60 },
  { key: 'd1', label: '提前 1 天', minutes: 1440 },
  { key: 'custom', label: '自定义', minutes: null },
]

/**
 * 计算展示状态（只做「逾期」这一层派生，聚合状态由服务端给）
 * @param {{status:string, deadline:string, isOverdue?:boolean}} task
 */
function resolveDisplayStatus(task) {
  const active = task.status === TaskStatus.PENDING || task.status === TaskStatus.IN_PROGRESS
  const overdue = typeof task.isOverdue === 'boolean'
    ? task.isOverdue
    : active && new Date(task.deadline).getTime() < Date.now()
  if (active && overdue) return TaskStatus.OVERDUE
  return task.status
}

function statusStyle(status) {
  return STATUS_MAP[status] || STATUS_MAP.pending
}

function participantStyle(status) {
  return PARTICIPANT_STATUS_MAP[status] || PARTICIPANT_STATUS_MAP.pending
}

/**
 * 角色化文案：同一状态，收到方与发出方说法不同
 * 多人任务下，"收到"指我在参与者里。
 */
function roleText(status, role) {
  const received = role === 'assignee'
  switch (status) {
    case 'pending':
      return received ? '等你回应' : '等 TA 们接单'
    case 'in_progress':
      return received ? '该你出手了' : '正在做'
    case 'overdue':
      return received ? '已经晚啦' : '还没做完'
    case 'completed':
      return received ? '已交差' : '已完成'
    case 'rejected':
      return '没人接'
    case 'scheduled':
      return '还没开始'
    case 'cancelled':
      return '已撤回'
    default:
      return ''
  }
}

/**
 * 一个人的完成情况摘要，用于卡片副标题
 * @param {{participants:Array, completionMode:string}} task
 */
function progressText(task) {
  const ps = task.participants || []
  const done = ps.filter((p) => p.status === 'done').length
  const total = ps.length
  if (task.completionMode === CompletionMode.ANY) {
    return total > 1 ? `${total} 人参与 · 谁先做完都算` : '等你完成'
  }
  return `${done}/${total} 人已完成`
}

module.exports = {
  TaskStatus,
  ParticipantStatus,
  CompletionMode,
  STATUS_MAP,
  PARTICIPANT_STATUS_MAP,
  COMPLETION_MODE_MAP,
  TASK_STATUS_CODE,
  PARTICIPANT_STATUS_CODE,
  ROLE_CODE,
  COMPLETION_MODE_CODE,
  STATUS_FILTERS,
  STATUS_FILTER_QUERY,
  TIME_RANGES,
  TIME_RANGE_MAP,
  REMIND_OPTIONS,
  resolveDisplayStatus,
  statusStyle,
  participantStyle,
  roleText,
  progressText,
}
