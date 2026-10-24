/**
 * 生成分享卡片封面（500x400，微信推荐 5:4）
 *
 * 为什么用代码画而不是找图：分享卡片在聊天里只有 100x80 左右，
 * 细节全看不见，能起作用的只有「大色块 + 一个能认出的形状」。
 * 代码画的好处是配色直接复用主题令牌，以后换主题重跑一次就行。
 *
 * 用法：node tools/make-covers.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const W = 400
const H = 320
const OUT = path.resolve(__dirname, '../miniprogram/images/share')

/* ---------------- PNG 编码 ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(w, h, rgb) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2 // RGB（封面不需要透明，体积更小）
  const bpp = 3
  const stride = w * bpp
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) {
    const out = y * (stride + 1)
    // filter 2 (Up)：每字节减去上一行同位置的值。
    // 渐变封面横向相邻像素几乎一样，差分后大片是 0，deflate 能压到原来的 1/5。
    raw[out] = 2
    for (let i = 0; i < stride; i++) {
      const cur = rgb[y * stride + i]
      const up = y === 0 ? 0 : rgb[(y - 1) * stride + i]
      raw[out + 1 + i] = (cur - up) & 0xff
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- 绘制原语 ---------------- */

function hex(h) {
  const n = parseInt(h.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function blend(dst, color, alpha) {
  const a = Math.max(0, Math.min(1, alpha))
  dst[0] = dst[0] * (1 - a) + color[0] * a
  dst[1] = dst[1] * (1 - a) + color[1] * a
  dst[2] = dst[2] * (1 - a) + color[2] * a
}

/** 多段线性渐变，angle 单位度（135 = 左上 → 右下） */
function gradient(stops, angle) {
  const rad = (angle * Math.PI) / 180
  const dx = Math.cos(rad)
  const dy = Math.sin(rad)
  return (x, y) => {
    // 投影到渐变方向并归一化到 0..1
    let t = ((x / W - 0.5) * dx + (y / H - 0.5) * dy) / (Math.abs(dx) + Math.abs(dy)) + 0.5
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const seg = 1 / (stops.length - 1)
    const i = Math.min(stops.length - 2, Math.floor(t / seg))
    const local = (t - i * seg) / seg
    return mix(stops[i], stops[i + 1], local)
  }
}

/** 柔和径向光斑 */
function glow(cx, cy, r, color, maxAlpha) {
  return (x, y) => {
    const d = Math.hypot(x - cx * W, y - cy * H) / (r * W)
    if (d >= 1) return null
    const k = 1 - d
    return { color, alpha: k * k * maxAlpha }
  }
}

function ringPath(cx, cy, r, width, color, alpha) {
  return (x, y) => {
    const d = Math.abs(Math.hypot(x - cx * W, y - cy * H) - r * W)
    const edge = Math.max(0, Math.min(1, width * W * 0.5 + 0.5 - d))
    if (edge <= 0) return null
    return { color, alpha: edge * alpha }
  }
}

function discPath(cx, cy, r, color, alpha) {
  return (x, y) => {
    const d = Math.hypot(x - cx * W, y - cy * H)
    const edge = Math.max(0, Math.min(1, r * W + 0.5 - d))
    if (edge <= 0) return null
    return { color, alpha: edge * alpha }
  }
}

function segmentPath(x0, y0, x1, y1, width, color, alpha) {
  const ax = x0 * W
  const ay = y0 * H
  const bx = x1 * W
  const by = y1 * H
  const ddx = bx - ax
  const ddy = by - ay
  const len2 = ddx * ddx + ddy * ddy
  return (x, y) => {
    let t = len2 === 0 ? 0 : ((x - ax) * ddx + (y - ay) * ddy) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(x - (ax + t * ddx), y - (ay + t * ddy))
    const edge = Math.max(0, Math.min(1, (width * W) / 2 + 0.5 - d))
    if (edge <= 0) return null
    return { color, alpha: edge * alpha }
  }
}

/** 圆角矩形描边（距离场，参考 rounded box 的 SDF） */
function roundRectPath(cx, cy, halfW, halfH, radius, width, color, alpha) {
  const ccx = cx * W
  const ccy = cy * H
  const hw = halfW * W
  const hh = halfH * W
  const r = radius * W
  return (x, y) => {
    const dx = Math.abs(x - ccx) - (hw - r)
    const dy = Math.abs(y - ccy) - (hh - r)
    const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
    const inside = Math.min(Math.max(dx, dy), 0)
    const dist = Math.abs(outside + inside - r)
    const edge = Math.max(0, Math.min(1, (width * W) / 2 + 0.5 - dist))
    if (edge <= 0) return null
    return { color, alpha: edge * alpha }
  }
}

/* ---------------- 渲染 ---------------- */

function render(file, base, layers) {
  const buf = Buffer.alloc(W * H * 3)
  const white = [255, 255, 255]
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = base(x, y).slice()
      layers.forEach((layer) => {
        const hit = layer(x, y)
        if (hit) blend(px, hit.color, hit.alpha)
      })
      const i = (y * W + x) * 3
      buf[i] = Math.round(px[0])
      buf[i + 1] = Math.round(px[1])
      buf[i + 2] = Math.round(px[2])
    }
  }
  fs.writeFileSync(path.join(OUT, file), encodePng(W, H, buf))
  console.log('  ✓ ' + file)
}

/* ---------------- 任务封面 ---------------- */

// 和首页 banner 同一套渐变，用户从卡片点进来会觉得是一路的
const taskBase = gradient(['#FF6435', '#FF8F57', '#FFB887'].map(hex), 128)

render('task-cover.png', taskBase, [
  glow(0.88, 0.06, 0.5, [38, 200, 158], 0.55), // 右上青绿
  glow(0.06, 0.98, 0.46, [126, 140, 255], 0.4), // 左下蓝紫
  // 一个圆角勾选框 + 对勾：比圆环更能一眼认出"这是个待办"
  roundRectPath(0.29, 0.44, 0.115, 0.115, 0.038, 0.019, [255, 255, 255], 0.42),
  segmentPath(0.235, 0.445, 0.275, 0.5, 0.019, [255, 255, 255], 0.85),
  segmentPath(0.275, 0.5, 0.355, 0.375, 0.019, [255, 255, 255], 0.85),
  // 右下三个渐隐的小横线：暗示"还有一堆事"
  segmentPath(0.6, 0.76, 0.78, 0.76, 0.014, [255, 255, 255], 0.42),
  segmentPath(0.6, 0.855, 0.72, 0.855, 0.014, [255, 255, 255], 0.3),
  segmentPath(0.6, 0.95, 0.66, 0.95, 0.014, [255, 255, 255], 0.2),
])

/* ---------------- 好友邀请封面 ---------------- */

// 用薄荷绿：和任务卡片的橘色拉开，聊天里一眼能分出"这是加好友"
const friendBase = gradient(['#2EC093', '#1BAE83', '#0E8E68'].map(hex), 122)

render('friend-cover.png', friendBase, [
  glow(0.12, 0.08, 0.46, [255, 255, 255], 0.22),
  glow(0.9, 0.95, 0.42, [14, 118, 88], 0.5),
  // 两个交叠的圆环 = 两个人
  ringPath(0.38, 0.62, 0.135, 0.017, [255, 255, 255], 0.62),
  ringPath(0.57, 0.58, 0.135, 0.017, [255, 255, 255], 0.44),
  // 右上角的加号 = 加好友
  segmentPath(0.79, 0.2, 0.79, 0.34, 0.018, [255, 255, 255], 0.85),
  segmentPath(0.72, 0.27, 0.86, 0.27, 0.018, [255, 255, 255], 0.85),
])

console.log('封面生成完成 →', OUT)
