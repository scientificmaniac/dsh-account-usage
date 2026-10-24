#!/usr/bin/env node
/**
 * Preview builder: render the injected cards to static HTML with the test harness's React shim and place
 * them inside a mock Settings panel (light + dark), so the layout can be reviewed without relaunching DSH.
 *
 * The preview approximates DSH's CSS variables; the real thing is whatever the Settings panel renders.
 *
 * usage: node scripts/build-preview.mjs [--locale en|zh] [--bundle <client.js>]
 * output: docs/preview.html
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateBundle, loadBundleForTests } from './_harness.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '..', 'docs', 'preview.html')

const { target, text } = loadBundleForTests()
const { exports } = evaluateBundle(text, {
  exports: ['AccountUsageStatsSection', 'AccountUsageStatsInner', 'zh', 'en'],
  filename: target.path,
})
const test = exports.__test
if (test === undefined) throw new Error('test exports missing: patch not present in the bundle?')
const locale = process.argv.includes('--locale')
  ? process.argv[process.argv.indexOf('--locale') + 1]
  : 'zh'
const dict = locale === 'en' ? test.en : test.zh
if (dict === undefined) throw new Error(`no dictionary for locale ${locale}`)
const t = (key) => (typeof dict[key] === 'string' ? dict[key] : key)

const COPY = locale === 'en'
  ? { title: 'Settings → Account & balance (usage panel added below)', hint: 'Static preview; the real render is what the relaunched DSH Settings panel shows. DSH-like CSS variables approximate light and dark.', light: 'Light theme', dark: 'Dark theme', user: 'DeepSeek user', signedIn: 'Signed in with DeepSeek', more: 'More account info ↗', balance: 'Top-up balance', moreLabel: 'More', usage: 'Usage', topUp: 'Top up', initial: 'D' }
  : { title: '设置 → 账号与余额（下方新增用量统计）', hint: '静态预览：真实渲染以重启 DSH Desktop 后的设置页为准；此处用近似 CSS 变量还原浅色 / 深色两套主题。', light: '浅色主题', dark: '深色主题', user: 'DeepSeek 用户', signedIn: '已登录 DeepSeek', more: '更多账号信息 ↗', balance: '充值余额', moreLabel: '更多', usage: '查询用量', topUp: '充值', initial: 'D' }

const UNITLESS = new Set(['opacity', 'fontWeight', 'lineHeight', 'flexGrow', 'flexShrink', 'order', 'zIndex'])
function cssOf(style) {
  if (style === null || typeof style !== 'object') return ''
  const parts = []
  for (const [rawKey, value] of Object.entries(style)) {
    if (value === undefined || value === null) continue
    const key = rawKey.startsWith('--') ? rawKey : rawKey.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())
    const rendered = typeof value === 'number' ? (UNITLESS.has(rawKey) ? String(value) : `${value}px`) : String(value)
    parts.push(`${key}: ${rendered}`)
  }
  return parts.join('; ')
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
}
function render(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(render).join('')
  if (typeof node.type === 'function') {
    if (node.type.prototype && typeof node.type.prototype.render === 'function') {
      return render(new node.type(node.props).render())
    }
    return render(node.type(node.props))
  }
  const props = node.props ?? {}
  const attrs = []
  if (typeof props.title === 'string') attrs.push(`title="${escapeHtml(props.title)}"`)
  if (typeof props.role === 'string') attrs.push(`role="${escapeHtml(props.role)}"`)
  if (typeof props['aria-label'] === 'string') attrs.push(`aria-label="${escapeHtml(props['aria-label'])}"`)
  const style = cssOf(props.style)
  if (style !== '') attrs.push(`style="${style}"`)
  return `<${node.type}${attrs.length > 0 ? ' ' + attrs.join(' ') : ''}>${render(props.children)}</${node.type}>`
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
  byId: {
    s1: {
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 1900000, cacheReadTokens: 6800000, cacheWriteTokens: 420000, outputTokens: 610000 },
        contextActivity: {
          days: {
            [dayKey(0)]: { tokens: 1400000, requests: 18, turns: 6, toolCalls: 14 },
            [dayKey(1)]: { tokens: 980000, requests: 11, turns: 4, toolCalls: 8 },
            [dayKey(2)]: { tokens: 0, requests: 0, turns: 0, toolCalls: 0 },
            [dayKey(3)]: { tokens: 720000, requests: 9, turns: 3, toolCalls: 6 },
            [dayKey(4)]: { tokens: 1650000, requests: 21, turns: 7, toolCalls: 17 },
            [dayKey(5)]: { tokens: 320000, requests: 4, turns: 2, toolCalls: 1 },
            [dayKey(6)]: { tokens: 260000, requests: 3, turns: 1, toolCalls: 2 },
          },
        },
      },
    },
    s2: {
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 240000, cacheReadTokens: 510000, cacheWriteTokens: 0, outputTokens: 96000 },
        contextActivity: { days: { [dayKey(0)]: { tokens: 210000, requests: 3, turns: 1, toolCalls: 2 } } },
      },
    },
  },
}
const cardsHtml = render(test.AccountUsageStatsSection({
  useSessions: (selector) => selector(snapshot),
  refreshSessions: () => {},
  t,
}))

const accountCard = () => `
<div style="display:flex;flex-direction:column;gap:16px;padding:8px 0">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 16px;border:0.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill)">
    <div style="display:flex;align-items:center;gap:10px;min-height:44px">
      <span style="width:32px;height:32px;border-radius:50%;background:var(--dsw-alias-bg-skeleton);display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary);font-size:13px">${COPY.initial}</span>
      <div style="display:flex;flex-direction:column">
        <span style="font-size:14px;font-weight:500">${COPY.user}</span>
        <span style="font-size:13px;color:var(--dsw-alias-label-tertiary)">${COPY.signedIn}</span>
      </div>
    </div>
    <a style="font-size:13px;color:var(--dsw-alias-label-primary);text-decoration:none">${COPY.more}</a>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px;padding:12px 16px;border:0.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-xl);background:var(--dsw-alias-settings-card-fill)">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:40px;padding:6px 0">
      <span>${COPY.balance}</span><span style="font-variant-numeric:tabular-nums">¥128.40</span>
    </div>
    <div style="border-top:0.5px solid var(--dsw-alias-border-l2)"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:40px;padding:6px 0">
      <span style="color:var(--dsw-alias-label-tertiary)">${COPY.moreLabel}</span>
      <span style="display:flex;gap:10px">
        <span style="height:36px;min-width:58px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);font-size:14px">${COPY.usage}</span>
        <span style="height:36px;min-width:58px;padding:0 14px;display:inline-flex;align-items:center;justify-content:center;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);font-size:14px">${COPY.topUp}</span>
      </span>
    </div>
  </div>
  ${cardsHtml}
</div>`

const html = `<!doctype html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head>
<meta charset="utf-8">
<title>DSH Settings · Account &amp; balance · usage panel preview</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: #eeeeee; font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; color: #191919; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
  p.hint { margin: 0 0 24px; font-size: 12px; color: #666; }
  .row { display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  .pane { width: 600px; max-width: 100%; }
  .pane-title { font-size: 12px; color: #666; margin-bottom: 8px; }
  .panel { padding: 20px 24px 24px; border-radius: 16px; font-size: 13px; line-height: 22px; box-shadow: 0 8px 28px rgba(0,0,0,.12); }
  .light { background: #ffffff; color: #191919;
    --dsw-alias-label-primary: #191919; --dsw-alias-label-secondary: #5c5c5c; --dsw-alias-label-tertiary: #8c8c8c;
    --dsw-alias-settings-card-fill: #ffffff; --dsw-alias-settings-card-stroke: rgba(0,0,0,.1);
    --dsw-radius-xl: 16px; --dsw-radius-md: 8px; --dsw-alias-bg-skeleton: #ececec;
    --dsw-alias-border-l2: rgba(0,0,0,.08); --dsw-alias-border-l3: rgba(0,0,0,.16);
    --dsw-alias-state-business-primary: #4d6bfe; }
  .dark { background: #1e1e1e; color: #e6e6e6;
    --dsw-alias-label-primary: #ededed; --dsw-alias-label-secondary: #b0b0b0; --dsw-alias-label-tertiary: #8a8a8a;
    --dsw-alias-settings-card-fill: #262626; --dsw-alias-settings-card-stroke: rgba(255,255,255,.12);
    --dsw-radius-xl: 16px; --dsw-radius-md: 8px; --dsw-alias-bg-skeleton: #333333;
    --dsw-alias-border-l2: rgba(255,255,255,.1); --dsw-alias-border-l3: rgba(255,255,255,.18);
    --dsw-alias-state-business-primary: #7589ff; }
</style>
</head>
<body>
  <h1>${COPY.title}</h1>
  <p class="hint">${COPY.hint}</p>
  <div class="row">
    <div class="pane"><div class="pane-title">${COPY.light}</div><div class="panel light">${accountCard()}</div></div>
    <div class="pane"><div class="pane-title">${COPY.dark}</div><div class="panel dark">${accountCard()}</div></div>
  </div>
</body>
</html>`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html, 'utf8')
console.log(`preview written: ${OUT} (locale=${locale})`)
console.log(`  cards html: ${cardsHtml.length} chars`)
