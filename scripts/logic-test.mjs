#!/usr/bin/env node
/**
 * Logic test: evaluate the aggregation functions from src/snippet.js (everything before the React
 * components) and verify token totals, the 7-day window, activity/streak math and hostile-data
 * degradation. No DSH install needed — this is the test CI runs.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(HERE, '..', 'src', 'snippet.js'), 'utf8')
const cut = source.indexOf('/** 近 7 天每日用量柱')
if (cut < 0) throw new Error('cannot find the React component boundary in src/snippet.js')
const core = source.slice(0, cut)
const api = new Function(
  `${core}\nreturn { ACCOUNT_STATS_DAYS, accountStatsCount, accountStatsFmt, accountStatsShare, accountStatsDayKeyOf, accountStatsWindow, accountStatsEmpty, accountStatsOf }`,
)()

let failures = 0
function equal(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) console.log(`ok   ${name}`)
  else {
    failures += 1
    console.error(`FAIL ${name}\n     expected ${JSON.stringify(expected)}\n     actual   ${JSON.stringify(actual)}`)
  }
}
function near(name, actual, expected, tolerance = 1e-6) {
  const ok = typeof actual === 'number' && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
  if (ok) console.log(`ok   ${name}`)
  else {
    failures += 1
    console.error(`FAIL ${name}\n     expected ~${expected}\n     actual   ${actual}`)
  }
}

const NOW = new Date(2026, 9, 24, 15, 30, 0).getTime() // local 2026-10-24 15:30
const dayKey = (offset) => {
  const date = new Date(NOW)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - offset)
  return api.accountStatsDayKeyOf(date)
}

// formatting
equal('fmt 0', api.accountStatsFmt(0), '0')
equal('fmt 999', api.accountStatsFmt(999), '999')
equal('fmt 1500', api.accountStatsFmt(1500), '1.5k')
equal('fmt 15000', api.accountStatsFmt(15000), '15k')
equal('fmt 1.5M', api.accountStatsFmt(1500000), '1.5M')
equal('fmt 2.3B', api.accountStatsFmt(2.3e9), '2.3B')
equal('count clamps negatives', api.accountStatsCount(-5), 0)
equal('count clamps NaN', api.accountStatsCount(Number.NaN), 0)
equal('share 0%', api.accountStatsShare(0, 100), '0%')
equal('share 25%', api.accountStatsShare(25, 100), '25%')
equal('share tiny', api.accountStatsShare(0.01, 100), '<0.1%')

// window
const window = api.accountStatsWindow(7, NOW)
equal('window length', window.length, 7)
equal('window ends today', window[6].today, true)
equal('window today date', window[6].day, 24)
equal('window first date', window[0].day, 18)
equal('window dates ascend', window.map((day) => day.day), [18, 19, 20, 21, 22, 23, 24])

// empty snapshot
const empty = api.accountStatsOf(null, NOW)
equal('empty snapshot has no usage', empty.hasUsage, false)
equal('empty snapshot total 0', empty.total, 0)
equal('empty snapshot keeps window', empty.days.length, 7)

// two sessions: tokenUsage + contextActivity
const snapshot = {
  phase: 'ready',
  ids: ['a', 'b'],
  byId: {
    a: {
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 500, outputTokens: 300 },
        contextActivity: {
          days: {
            [dayKey(0)]: { tokens: 900, requests: 2, turns: 1, toolCalls: 3 },
            [dayKey(1)]: { tokens: 400, requests: 1, turns: 1, toolCalls: 0 },
            [dayKey(30)]: { tokens: 7000, requests: 5, turns: 2, toolCalls: 1 },
          },
        },
      },
    },
    b: {
      projectionValues: {
        tokenUsage: { uncachedInputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100 },
        contextActivity: { days: { [dayKey(2)]: { tokens: 250, requests: 1, turns: 1 } } },
      },
    },
  },
}
const stats = api.accountStatsOf(snapshot, NOW)
near('four-bucket total', stats.total, 1000 + 2000 + 500 + 300 + 500 + 100)
near('last-7-days tokens', stats.weekTokens, 900 + 400 + 250)
equal('active days', stats.activeDays, 3)
equal('streak from today', stats.streak, 3)
equal('7-day requests', stats.requests, 2 + 1 + 1)
equal('7-day turns', stats.turns, 1 + 1 + 1)
equal('7-day tool calls', stats.toolCalls, 3)
equal('session count', stats.sessions, 2)
equal('old data stays out of the window', stats.days.every((day) => day.tokens < 7000), true)

// activity-only session: totals fall back to the day ledger
const activityOnly = api.accountStatsOf({
  byId: {
    x: { projectionValues: { contextActivity: { days: { [dayKey(0)]: { tokens: 1200, requests: 1 }, [dayKey(9)]: { tokens: 800, requests: 1 } } } } },
  },
}, NOW)
near('missing buckets fall back to ledger', activityOnly.total, 2000)
near('fallback fills the input bucket', activityOnly.buckets.input, 2000)
near('window excludes older days', activityOnly.weekTokens, 1200)

// hostile / malformed rows
const hostile = api.accountStatsOf({
  byId: {
    bad1: { projectionValues: null },
    bad2: { projectionValues: { tokenUsage: 'nope', contextActivity: { days: { [dayKey(0)]: null } } } },
    bad3: { projectionValues: { tokenUsage: { uncachedInputTokens: -10, outputTokens: Number.NaN }, contextActivity: { days: { [dayKey(1)]: { tokens: Number.POSITIVE_INFINITY, requests: -3 } } } } },
    bad4: { projectionValues: { contextActivity: { days: { [dayKey(2)]: { tokens: 100, requests: 1, turns: 1, toolCalls: 2 } } } } },
  },
}, NOW)
equal('hostile input never yields negatives', Object.values(hostile.buckets).every((value) => value >= 0), true)
near('hostile rows keep only valid sessions', hostile.weekTokens, 100)
equal('hostile snapshot does not throw', typeof hostile.total, 'number')

// data entirely outside the window
const oldOnly = api.accountStatsOf({
  byId: { y: { projectionValues: { contextActivity: { days: { [dayKey(40)]: { tokens: 500, requests: 2, turns: 1 } } } } } },
}, NOW)
equal('no in-window tokens', oldOnly.weekTokens, 0)
equal('no active days in window', oldOnly.activeDays, 0)
equal('no streak in window', oldOnly.streak, 0)
equal('lifetime usage still reported', oldOnly.hasUsage, true)

// non-usable snapshot shapes
equal('array snapshot degrades', api.accountStatsOf([], NOW).hasUsage, false)
equal('string snapshot degrades', api.accountStatsOf('oops', NOW).hasUsage, false)
equal('non-object byId degrades', api.accountStatsOf({ byId: 42 }, NOW).hasUsage, false)

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log('\nlogic test passed')
