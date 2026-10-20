/**
 * 时间格式化（纯函数，无 wx 依赖，可单测）
 * 规则见方案 8.7：今天 21:00 / 明天 08:00 / 周三 18:00 / 10月28日 14:00
 */

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

function startOfDay(d) {
  const x = new Date(d.getTime())
  x.setHours(0, 0, 0, 0)
  return x
}

function dayDiff(target, base) {
  const ms = startOfDay(target).getTime() - startOfDay(base).getTime()
  return Math.round(ms / 86400000)
}

function hm(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

/** 截止时间：带「今天/明天」语义 */
function formatDeadline(iso, now) {
  if (!iso) return ''
  const d = new Date(iso)
  const base = now ? new Date(now) : new Date()
  const diff = dayDiff(d, base)

  if (diff === 0) return '今天 ' + hm(d)
  if (diff === 1) return '明天 ' + hm(d)
  if (diff === 2) return '后天 ' + hm(d)
  if (diff > 2 && diff < 7) return WEEK[d.getDay()] + ' ' + hm(d)
  if (d.getFullYear() === base.getFullYear()) {
    return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + hm(d)
  }
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

/** 相对时间：10 分钟前 / 昨天 20:41 */
function formatRelative(iso, now) {
  if (!iso) return ''
  const d = new Date(iso)
  const base = now ? new Date(now) : new Date()
  const diffMs = base.getTime() - d.getTime()

  if (diffMs >= 0) {
    const min = Math.floor(diffMs / 60000)
    if (min < 1) return '刚刚'
    if (min < 60) return min + ' 分钟前'
    const hour = Math.floor(min / 60)
    if (hour < 24 && dayDiff(base, d) === 0) return hour + ' 小时前'
    if (dayDiff(base, d) === 1) return '昨天 ' + hm(d)
    if (dayDiff(base, d) === 2) return '前天 ' + hm(d)
  }
  return formatDeadline(iso, now)
}

/** 逾期时长：已逾期 2 小时 / 已逾期 20 分钟 */
function formatOverdue(deadline, now) {
  const base = now ? new Date(now) : new Date()
  const diffMs = base.getTime() - new Date(deadline).getTime()
  if (diffMs <= 0) return ''
  const min = Math.floor(diffMs / 60000)
  if (min < 60) return '已逾期 ' + Math.max(min, 1) + ' 分钟'
  const hour = Math.floor(min / 60)
  if (hour < 24) return '已逾期 ' + hour + ' 小时'
  return '已逾期 ' + Math.floor(hour / 24) + ' 天'
}

/** 表单默认截止时间：今天 21:00；若已过则顺延到明天 21:00 */
function defaultDeadline(now) {
  const base = now ? new Date(now) : new Date()
  const d = new Date(base.getTime())
  d.setHours(21, 0, 0, 0)
  if (d.getTime() <= base.getTime()) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

module.exports = {
  formatDeadline,
  formatRelative,
  formatOverdue,
  defaultDeadline,
  WEEK,
}
