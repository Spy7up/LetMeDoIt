/**
 * 图标生成器
 * 小程序 tabBar 只认图片路径，WXML 里也没有 SVG sprite，
 * 所以用画线 + 超采样 + 手写 PNG 编码生成一套单色图标。
 *
 * 用法：node tools/gen-assets.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

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
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

function encodePNG(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------- 几何（24×24 设计坐标） ---------------- */

const P = (x, y) => ({ x, y })

function seg(x1, y1, x2, y2, w) {
  return { kind: 'seg', a: P(x1, y1), b: P(x2, y2), w }
}
function circle(cx, cy, r, w) {
  return { kind: 'ring', c: P(cx, cy), r, w }
}
function disc(cx, cy, r) {
  return { kind: 'disc', c: P(cx, cy), r }
}
function rrect(x, y, w, h, r, sw) {
  return { kind: 'rrect', x, y, w, h, r, sw }
}
/** 角度用度数，0° 指向右，顺时针为正（y 向下） */
function arc(cx, cy, r, a0, a1, w, steps = 24) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180
    pts.push(P(cx + r * Math.cos(a), cy + r * Math.sin(a)))
  }
  return { kind: 'poly', pts, w }
}
function poly(pts, w) {
  return { kind: 'poly', pts: pts.map((p) => P(p[0], p[1])), w }
}

function distToSeg(px, py, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(px - cx, py - cy)
}

function hit(shape, px, py) {
  switch (shape.kind) {
    case 'seg':
      return distToSeg(px, py, shape.a, shape.b) <= shape.w / 2
    case 'ring':
      return Math.abs(Math.hypot(px - shape.c.x, py - shape.c.y) - shape.r) <= shape.w / 2
    case 'disc':
      return Math.hypot(px - shape.c.x, py - shape.c.y) <= shape.r
    case 'rrect': {
      const { x, y, w, h, r, sw } = shape
      const cx = x + w / 2
      const cy = y + h / 2
      const bx = w / 2 - r
      const by = h / 2 - r
      const qx = Math.abs(px - cx) - bx
      const qy = Math.abs(py - cy) - by
      const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
      return Math.abs(d) <= sw / 2
    }
    case 'poly': {
      for (let i = 0; i < shape.pts.length - 1; i++) {
        if (distToSeg(px, py, shape.pts[i], shape.pts[i + 1]) <= shape.w / 2) return true
      }
      return false
    }
    default:
      return false
  }
}

/* ---------------- 图标定义 ---------------- */

const W = 1.9 // 默认描边宽度（24 单位空间）

const ICONS = {
  bell: [
    arc(12, 11.2, 5.2, 180, 360, W),
    seg(6.8, 11.2, 6.8, 15.4, W),
    seg(17.2, 11.2, 17.2, 15.4, W),
    seg(5.6, 15.4, 18.4, 15.4, W),
    arc(12, 17.2, 1.7, 0, 180, W),
  ],
  clock: [
    circle(12, 12, 8, W),
    seg(12, 12, 12, 7.2, W),
    seg(12, 12, 15.4, 13.8, W),
  ],
  plus: [seg(12, 5, 12, 19, W), seg(5, 12, 19, 12, W)],
  check: [poly([[5, 12.6], [10, 17.4], [19, 7.2]], W + 0.2)],
  chevron: [poly([[9.4, 5], [16.4, 12], [9.4, 19]], W)],
  camera: [
    rrect(3, 7.4, 18, 12, 2.2, W),
    rrect(8.6, 4.8, 6.8, 3.4, 1.2, W),
    circle(12, 13.4, 3, W),
  ],
  search: [circle(11, 11, 6.2, W), seg(15.6, 15.6, 20, 20, W)],
  task: [rrect(4, 4, 16, 16, 4.5, W), poly([[8.4, 12.3], [10.7, 14.6], [15.6, 9.7]], W)],
  users: [
    circle(9, 8, 3.2, W),
    arc(9, 18.8, 5.2, 180, 360, W),
    circle(17, 8.6, 2.4, W),
    arc(17, 18.8, 3.9, 180, 360, W),
  ],
  me: [circle(12, 8, 3.4, W), arc(12, 20, 7.4, 180, 360, W)],
}

/* ---------------- 渲染 ---------------- */

function render(shapes, size, hex) {
  const rgb = hexToRgb(hex)
  const buf = Buffer.alloc(size * size * 4)
  const scale = size / 24
  const SS = 4
  const step = 1 / SS

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hitCount = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) * step) / scale
          const py = (y + (sy + 0.5) * step) / scale
          for (let i = 0; i < shapes.length; i++) {
            if (hit(shapes[i], px, py)) {
              hitCount++
              break
            }
          }
        }
      }
      const a = Math.round((hitCount / (SS * SS)) * 255)
      const o = (y * size + x) * 4
      buf[o] = rgb[0]
      buf[o + 1] = rgb[1]
      buf[o + 2] = rgb[2]
      buf[o + 3] = a
    }
  }
  return encodePNG(size, size, buf)
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/* ---------------- 输出 ---------------- */

const COLORS = {
  muted: '#A69C93',
  ink: '#1E1B18',
  brand: '#D64C28',
  white: '#FFFFFF',
  ghost: '#CFC6BD',
  mint: '#17A67C',
  blue: '#576B95',
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

let count = 0

// tabBar 图标：81×81，两态
;['task', 'users', 'me'].forEach((name) => {
  fs.writeFileSync(path.join(OUT, `tab-${name}.png`), render(ICONS[name], 81, COLORS.muted))
  fs.writeFileSync(path.join(OUT, `tab-${name}-on.png`), render(ICONS[name], 81, COLORS.brand))
  count += 2
})

// 内联图标：48×48
Object.keys(ICONS).forEach((name) => {
  Object.keys(COLORS).forEach((color) => {
    fs.writeFileSync(path.join(OUT, `${name}-${color}.png`), render(ICONS[name], 48, COLORS[color]))
    count++
  })
})

console.log(`generated ${count} icons → ${OUT}`)
