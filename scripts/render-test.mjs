#!/usr/bin/env node
/**
 * Render test: load the injected components out of the (patched) bundle, run them with the harness's
 * minimal React shim, and serialize the element tree to check the three cards' copy, figures and shape.
 *
 * Why not react-dom: DSH Desktop ships only `react` (the DOM renderer comes from the web shell's
 * vendored modules), and the components only build element trees — serializing those is enough.
 *
 * Skips with exit code 0 when no DSH install is present.
 */

import { evaluateBundle, loadBundleForTests } from './_harness.mjs'

const { target, text } = loadBundleForTests()
const { exports } = evaluateBundle(text, {
  exports: ['AccountUsageStatsSection', 'AccountUsageStatsInner', 'accountStatsOf', 'zh', 'en'],
  filename: target.path,
})
const test = exports.__test
if (test === undefined) throw new Error('test exports missing: patch not present in the bundle?')
for (const name of ['AccountUsageStatsSection', 'AccountUsageStatsInner']) {
  if (typeof test[name] !== 'function') throw new Error(`${name} is not a component`)
}
const zh = test.zh
if (zh === undefined || typeof zh.statsTokenTitle !== 'string') throw new Error('zh dictionary lacks stats copy')

/** Element tree → text, keeping sibling separation so adjacent labels do not fuse. */
function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node.type === 'function') {
    if (node.type.prototype && typeof node.type.prototype.render === 'function') {
      return textOf(new node.type(node.props).render())
    }
    return textOf(node.type(node.props))
  }
  return textOf(node.props?.children)
}

/** Element tree → tag names, for structural sanity (outer wrapper + three cards). */
function tagsOf(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push('#text')
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) tagsOf(item, out)
    return out
  }
  if (typeof node.type === 'function') {
    if (node.type.prototype && typeof node.type.prototype.render === 'function') {
      return tagsOf(new node.type(node.props).render(), out)
    }
    return tagsOf(node.type(node.props), out)
  }
  out.push(node.type)
  return tagsOf(node.props?.children, out)
}

const now = Date.now()
const dayKey = (offset) => {
  const date = new Date(now)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const snapshot = {
  phase: 'ready',
  ids: ['s1', 's2'],
  byId: {
    s1: {
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 1200000, cacheReadTokens: 4000000, cacheWriteTokens: 300000, outputTokens: 250000 },
        contextActivity: {
          days: {
            [dayKey(0)]: { tokens: 900000, requests: 12, turns: 4, toolCalls: 9 },
            [dayKey(1)]: { tokens: 640000, requests: 8, turns: 3, toolCalls: 5 },
            [dayKey(3)]: { tokens: 320000, requests: 5, turns: 2, toolCalls: 2 },
          },
        },
      },
    },
    s2: {
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 100000, cacheReadTokens: 50000, cacheWriteTokens: 0, outputTokens: 40000 },
        contextActivity: { days: { [dayKey(2)]: { tokens: 210000, requests: 3, turns: 1, toolCalls: 1 } } },
      },
    },
  },
}
const t = (key) => (typeof zh[key] === 'string' ? zh[key] : key)

const tree = test.AccountUsageStatsSection({
  useSessions: (selector) => selector(snapshot),
  refreshSessions: () => {},
  t,
})
const body = textOf(tree)
const tags = tagsOf(tree)

let failures = 0
function expect(label, needle) {
  if (!body.includes(needle)) {
    failures += 1
    console.error(`FAIL ${label}: "${needle}" not found in output`)
  } else {
    console.log(`ok   ${label}`)
  }
}

expect('token card title', 'Token 统计')
expect('scope label', '全部会话')
expect('total figure', '5.9M')
expect('week card title', '近 7 天用量')
expect('activity card title', '活跃度')
expect('active days', '活跃天数 4/7')
expect('input bucket', '输入')
expect('cache read bucket', '缓存命中')
expect('cache write bucket', '缓存写入')
expect('output bucket', '输出')
expect('request tally', '模型请求 28')
expect('turn tally', '回合 10')
expect('tool tally', '工具调用 17')
expect('streak', '连续 4 天')
expect('daily average', '日均')
expect('units', 'tokens')

const divs = tags.filter((tag) => tag === 'div').length
if (divs < 10) {
  failures += 1
  console.error(`FAIL structure: only ${divs} divs in the card tree`)
} else {
  console.log(`ok   structure (${divs} divs)`)
}

const empty = textOf(test.AccountUsageStatsSection({
  useSessions: (selector) => selector({ byId: {} }),
  refreshSessions: () => {},
  t,
}))
if (!empty.includes(zh.statsEmpty)) {
  failures += 1
  console.error('FAIL empty state: hint missing')
} else {
  console.log('ok   empty state hint')
}

if (test.AccountUsageStatsSection({ t }) !== null) {
  failures += 1
  console.error('FAIL guard: expected null without useSessions')
} else {
  console.log('ok   guard without useSessions')
}

const guarded = test.AccountUsageStatsSection({ useSessions: () => ({ byId: {} }), refreshSessions: () => {}, t })
if (guarded === null || guarded === undefined) {
  failures += 1
  console.error('FAIL error boundary wrapper missing')
} else {
  console.log('ok   error boundary wrapper')
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nrender test passed')
