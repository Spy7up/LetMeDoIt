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

/* ---------------- 与后端的时间互转 ---------------- */

/**
 * 解析后端时间字符串
 *
 * sa-app 的 LocalDateTime 输出是 "2026-10-21 23:10:00"（无时区、无 T）。
 * 直接用 new Date() 在 iOS 上会得到 Invalid Date，所以这里手工拆字段按本地时间构造。
 *
 * @param {string|Date|number} value
 * @returns {Date|null}
 */
function parseTime(value) {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') return new Date(value)

  const text = String(value)

  // 带时区标记的 ISO（toISOString 的 "…Z" 或 "…+08:00"）必须交给 Date 解析，
  // 否则下面的正则会把 UTC 的 13:00 当成本地 13:00，整体偏移一个时区。
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const zoned = new Date(text)
    return isNaN(zoned.getTime()) ? null : zoned
  }

  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6] || 0)
    )
  }

  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Date / ISO 字符串 → 后端要的 "yyyy-MM-dd HH:mm:ss"
 * 秒不传时补 00。
 */
function apiTime(value) {
  const d = parseTime(value)
  if (!d) return ''
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    ' ' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes()) +
    ':' +
    pad(d.getSeconds())
  )
}

/**
 * 后端时间 → ISO 字符串
 * 展示层统一吃 ISO，new Date(iso) 在各端都能稳定解析。
 */
function toIso(value) {
  const d = parseTime(value)
  return d ? d.toISOString() : null
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
  parseTime,
  apiTime,
  toIso,
  formatDeadline,
  formatRelative,
  formatOverdue,
  defaultDeadline,
  WEEK,
}
