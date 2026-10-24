/**
 * 生成线性图标 PNG（48x48 RGBA），补齐 icons 里缺的几个图形。
 *
 * 项目原有图标是「单色线条 + 多色变体」的成套资源，但缺 share / edit / trash / close，
 * 这里用「线段距离场 + 1px 抗锯齿」画出来，风格和原有图标一致（线性、48px、圆头）。
 *
 * 用法：node tools/make-icons.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 48
const OUT = path.resolve(__dirname, '../miniprogram/images/icons')

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

function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- 绘制 ---------------- */

function distToSegment(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / len2
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = x0 + t * dx
  const cy = y0 + t * dy
  return Math.hypot(px - cx, py - cy)
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** segments: [[x0, y0, x1, y1, width], ...] */
function draw(segments, hex, file) {
  const [r, g, b] = hexToRgb(hex)
  const cov = new Float32Array(SIZE * SIZE)
  segments.forEach((seg) => {
    const [x0, y0, x1, y1] = seg
    const half = (seg[4] || 4) / 2
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const d = distToSegment(x + 0.5, y + 0.5, x0, y0, x1, y1)
        // half 内全实、外扩 1px 做抗锯齿
        const c = Math.max(0, Math.min(1, half + 0.5 - d))
        const i = y * SIZE + x
        if (c > cov[i]) cov[i] = c
      }
    }
  })
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  for (let i = 0; i < SIZE * SIZE; i++) {
    buf[i * 4] = r
    buf[i * 4 + 1] = g
    buf[i * 4 + 2] = b
    buf[i * 4 + 3] = Math.round(cov[i] * 255)
  }
  fs.writeFileSync(path.join(OUT, file), encodePng(SIZE, SIZE, buf))
  console.log('  ✓ ' + file)
}

/* ---------------- 图形定义 ---------------- */

// 分享：向上箭头 + 开口方框（iOS 分享的通用语义，用户一眼认得出）
const SHARE = [
  [24, 9, 24, 29, 4], // 竖杆
  [24, 9, 16, 17, 4], // 箭头左
  [24, 9, 32, 17, 4], // 箭头右
  [12, 24, 12, 39, 4], // 框左
  [12, 39, 36, 39, 4], // 框底
  [36, 39, 36, 24, 4], // 框右
]

// 编辑：斜放的铅笔（笔身两条长边 + 笔尖）
const EDIT = [
  [19, 30, 32, 17, 3.6], // 笔身一边
  [24, 35, 37, 22, 3.6], // 笔身另一边
  [19, 30, 24, 35, 3.6], // 笔尾封口
  [32, 17, 37, 22, 3.6], // 笔头封口
  [19, 30, 14, 33, 3.2], // 笔尖一边
  [24, 35, 14, 33, 3.2], // 笔尖另一边
]

// 撤回：垃圾桶
const TRASH = [
  [13, 15, 35, 15, 4], // 盖子
  [19, 15, 19, 10, 3.6], // 提手左
  [19, 10, 29, 10, 3.6], // 提手顶
  [29, 10, 29, 15, 3.6], // 提手右
  [16, 15, 18, 39, 3.6], // 桶身左
  [18, 39, 30, 39, 3.6], // 桶底
  [30, 39, 32, 15, 3.6], // 桶身右
  [24, 21, 24, 33, 2.6], // 中间竖纹
]

// 拒绝：叉
const CLOSE = [
  [17, 17, 31, 31, 4.4],
  [31, 17, 17, 31, 4.4],
]

console.log('生成图标 →', OUT)
draw(SHARE, '#D64C28', 'share-brand.png')
draw(SHARE, '#FFFFFF', 'share-white.png')
draw(EDIT, '#6B5BD2', 'edit-violet.png')
draw(TRASH, '#D64545', 'trash-danger.png')
draw(CLOSE, '#6B625B', 'close-ink.png')
draw(CLOSE, '#FFFFFF', 'close-white.png')
console.log('完成')
