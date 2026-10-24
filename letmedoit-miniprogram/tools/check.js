/**
 * 静态自检：没有微信开发者工具时，用脚本兜住低级错误
 *  - 所有页面四件套是否齐全
 *  - JS 语法（vm 编译）
 *  - require 路径是否存在
 *  - WXML 里引用的图片是否存在
 *  - navigateTo/switchTab 目标是否在 app.json 里
 *  - app.json 里的 tabBar 图标是否存在
 *
 * 用法：node tools/check.js
 */
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '../miniprogram')
let errors = 0
let warns = 0

function fail(msg) {
  console.log('  ✗ ' + msg)
  errors++
}
function warn(msg) {
  console.log('  ! ' + msg)
  warns++
}
function ok(msg) {
  console.log('  ✓ ' + msg)
}

function walk(dir, out) {
  fs.readdirSync(dir).forEach((name) => {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  })
  return out
}

const files = walk(ROOT, [])

/* ---------- 0. node 脚本自身不参与 ---------- */

const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))

console.log('\n[1] 页面四件套')
appJson.pages.forEach((p) => {
  ;['js', 'json', 'wxml', 'wxss'].forEach((ext) => {
    const f = path.join(ROOT, p + '.' + ext)
    if (!fs.existsSync(f)) fail('缺少 ' + p + '.' + ext)
  })
})
ok(appJson.pages.length + ' 个页面')

/* ---------- 1. JS 语法 ---------- */

console.log('\n[2] JS 语法')
files
  .filter((f) => f.endsWith('.js'))
  .forEach((f) => {
    const code = fs.readFileSync(f, 'utf8')
    try {
      new vm.Script(code, { filename: f })
    } catch (e) {
      fail(path.relative(ROOT, f) + ' → ' + e.message)
    }
  })
ok('语法检查完成')

/* ---------- 2. JSON 可解析 ---------- */

console.log('\n[3] JSON')
files
  .filter((f) => f.endsWith('.json'))
  .forEach((f) => {
    try {
      JSON.parse(fs.readFileSync(f, 'utf8'))
    } catch (e) {
      fail(path.relative(ROOT, f) + ' → ' + e.message)
    }
  })
ok('JSON 检查完成')

/* ---------- 3. require 路径 ---------- */

console.log('\n[4] require 路径')
files
  .filter((f) => f.endsWith('.js'))
  .forEach((f) => {
    const code = fs.readFileSync(f, 'utf8')
    const re = /require\(['"]([^'"]+)['"]\)/g
    let m
    while ((m = re.exec(code))) {
      const spec = m[1]
      if (spec.startsWith('/')) continue
      const target = path.resolve(path.dirname(f), spec)
      const candidates = [target, target + '.js', path.join(target, 'index.js')]
      if (!candidates.some((c) => fs.existsSync(c) && fs.statSync(c).isFile())) {
        fail(path.relative(ROOT, f) + ' 引用不存在 → ' + spec)
      }
    }
  })
ok('require 检查完成')

/* ---------- 4. 图片引用 ---------- */

console.log('\n[5] 图片引用')
const imgRe = /src="(\/images\/[^"{}]+)"/g
const missing = {}
files
  .filter((f) => f.endsWith('.wxml'))
  .forEach((f) => {
    const code = fs.readFileSync(f, 'utf8')
    let m
    while ((m = imgRe.exec(code))) {
      const abs = path.join(ROOT, m[1])
      if (!fs.existsSync(abs)) {
        if (!missing[m[1]]) {
          missing[m[1]] = 1
          fail(path.relative(ROOT, f) + ' 图片不存在 → ' + m[1])
        }
      }
    }
  })
if (!Object.keys(missing).length) ok('图片全部存在')

/* ---------- 5. tabBar 图标 ---------- */

console.log('\n[6] tabBar')
;(appJson.tabBar.list || []).forEach((t) => {
  if (!appJson.pages.includes(t.pagePath)) fail('tabBar 页面不在 pages 里 → ' + t.pagePath)
  ;[t.iconPath, t.selectedIconPath].forEach((p) => {
    if (p && !fs.existsSync(path.join(ROOT, p))) fail('tabBar 图标不存在 → ' + p)
  })
})
if (appJson.tabBar.custom) {
  ;['js', 'json', 'wxml', 'wxss'].forEach((ext) => {
    const f = path.join(ROOT, 'custom-tab-bar/index.' + ext)
    if (!fs.existsSync(f)) fail('custom:true 但缺少 custom-tab-bar/index.' + ext)
  })
  ok('自定义 tabBar 组件齐全')
}
ok(appJson.tabBar.list.length + ' 个 tab')

/* ---------- 6. 跳转目标 ---------- */

console.log('\n[7] 页面跳转目标')
const navRe = /(?:navigateTo|redirectTo|switchTab|reLaunch)\(\{\s*url:\s*['"]\/([^'"?]+)/g
files
  .filter((f) => f.endsWith('.js'))
  .forEach((f) => {
    const code = fs.readFileSync(f, 'utf8')
    let m
    while ((m = navRe.exec(code))) {
      const target = m[1]
      if (!appJson.pages.includes(target)) {
        fail(path.relative(ROOT, f) + ' 跳转到未注册页面 → ' + target)
      }
    }
  })
ok('跳转检查完成')

/* ---------- 7. 事件处理函数是否存在 ---------- */

console.log('\n[8] WXML 事件绑定')
appJson.pages.forEach((p) => {
  const wxml = path.join(ROOT, p + '.wxml')
  const js = path.join(ROOT, p + '.js')
  if (!fs.existsSync(wxml) || !fs.existsSync(js)) return
  const markup = fs.readFileSync(wxml, 'utf8')
  const code = fs.readFileSync(js, 'utf8')
  const re = /(?:bind|catch)(?:tap|input|change|blur|chooseavatar)="([a-zA-Z_$][\w$]*)"/g
  let m
  const seen = {}
  while ((m = re.exec(markup))) {
    const fn = m[1]
    if (seen[fn]) continue
    seen[fn] = 1
    const defined =
      code.indexOf(fn + '(') >= 0 || code.indexOf(fn + ':') >= 0 || code.indexOf(fn + ' (') >= 0
    if (!defined) fail(p + ' 绑定了未定义的方法 → ' + fn)
  }
})
ok('事件绑定检查完成')

/* ---------- 8. WXML 标签平衡 ---------- */

console.log('\n[9] WXML 标签')
const tagProblems = {}
files
  .filter((f) => f.endsWith('.wxml'))
  .forEach((f) => {
    // 先把 {{ }} 表达式替换成占位符，否则里面的 > / < 会被当成标签边界
    const src = fs
      .readFileSync(f, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\{\{[^{}]*\}\}/g, 'X')
    const re = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
    const stack = []
    let m
    let bad = false
    while ((m = re.exec(src))) {
      const isClose = m[0].charAt(1) === '/'
      const tag = m[1]
      // 自闭合可能跨行（属性折行后 "/>" 单独一行），用整体匹配判断
      const selfClose = /\/\s*>$/.test(m[0])
      if (selfClose) continue
      if (isClose) {
        const top = stack.pop()
        if (top !== tag && !bad) {
          fail(path.relative(ROOT, f) + ' 标签不匹配：期望 </' + top + '>，实际 </' + tag + '>')
          bad = true
        }
      } else {
        stack.push(tag)
      }
    }
    if (stack.length && !bad) {
      fail(path.relative(ROOT, f) + ' 未闭合：' + stack.join(' > '))
    }
    if (bad) tagProblems[f] = 1
  })
ok('标签平衡检查完成')

/* ---------- 9. WXML 引用的变量必须在 data 里声明 ---------- */

console.log('\n[10] WXML 变量')
// 抓这类 bug：wxml 写 {{barMode}}，但 js 的 data 里只有 task.barMode
// 表现是「按钮/区块静默不显示」，肉眼极难发现（详情页底部操作条就这么空过一段时间）
const SKIP_VARS = new Set(['item', 'index', 'idx', 'i', 'j', 'true', 'false', 'null', 'undefined', 'Math'])
const BUILTIN = new Set(['length', 'slice', 'concat', 'indexOf', 'toFixed', 'split', 'join', 'substr', 'trim'])

function dataKeys(js) {
  const m = /\bdata\s*:\s*\{/.exec(js)
  if (!m) return new Set()
  let i = m.index + m[0].length - 1
  const start = i
  let depth = 0
  while (i < js.length) {
    if (js[i] === '{') depth++
    else if (js[i] === '}') {
      depth--
      if (depth === 0) break
    }
    i++
  }
  const keys = new Set()
  const re = /\n\s{2,6}([A-Za-z_$][\w$]*)\s*:/g
  let k
  const block = js.slice(start, i)
  while ((k = re.exec(block))) keys.add(k[1])
  return keys
}

let varProblems = 0
files
  .filter((f) => f.endsWith('.wxml') && f.indexOf(path.join(ROOT, 'pages')) === 0)
  .forEach((f) => {
    const jsPath = f.replace(/\.wxml$/, '.js')
    if (!fs.existsSync(jsPath)) return
    const wxml = fs.readFileSync(f, 'utf8')
    const allowed = dataKeys(fs.readFileSync(jsPath, 'utf8'))
    // wx:for-item / wx:for-index 定义的局部变量
    const local = wxml.match(/wx:for-(?:item|index)="[\w$]+"/g) || []
    local.forEach((s) => allowed.add(/="([\w$]+)"/.exec(s)[1]))
    BUILTIN.forEach((b) => allowed.add(b))

    const roots = new Set()
    ;(wxml.match(/\{\{[\s\S]*?\}\}/g) || []).forEach((raw) => {
      // 去掉字符串字面量，再把 a.b.c 这样的链取第一段
      const expr = raw.replace(/'[^']*'/g, ' ').replace(/"[^"]*"/g, ' ')
      const chain = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/g
      let c
      while ((c = chain.exec(expr))) {
        roots.add(c[0].split('.')[0].trim())
      }
    })

    const bad = [...roots].filter((n) => !allowed.has(n) && !SKIP_VARS.has(n))
    if (bad.length) {
      fail(path.relative(ROOT, f) + ' 用了未声明的变量：' + bad.join(', '))
      varProblems++
    }
  })
if (!varProblems) ok('变量声明检查完成')

/* ---------- 汇总 ---------- */

console.log('\n' + (errors === 0 ? '全部通过' : errors + ' 个错误') + (warns ? '，' + warns + ' 个警告' : ''))
console.log('文件数：' + files.length)
if (errors) process.exitCode = 1
