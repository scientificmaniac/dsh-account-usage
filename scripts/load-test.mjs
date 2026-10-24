#!/usr/bin/env node
/**
 * Load smoke test: evaluate the (patched) DSH account settings bundle through the web shell's
 * `__ModuleLoader__` protocol and confirm the module body still runs and its exports are intact.
 *
 * Skips with exit code 0 when no DSH install is present (so CI stays green).
 */

import { evaluateBundle, loadBundleForTests } from './_harness.mjs'

const { target, text, state } = loadBundleForTests()
const { exports, moduleId } = evaluateBundle(text, { filename: target.path })

if (moduleId !== '@deepseek-ai/dsh-client-ui-settings-account') {
  throw new Error(`unexpected module id: ${moduleId}`)
}
for (const name of ['apply', 'inject']) {
  if (exports[name] === undefined) throw new Error(`missing export: ${name}`)
}
if (typeof exports.apply !== 'function') throw new Error('apply is not a function')
if (!Array.isArray(exports.inject)) throw new Error('inject is not an array')
for (const name of ['slots', 'locale', 'remote', 'remote.account', 'remote.session', 'theme', 'configForms']) {
  if (!exports.inject.includes(name)) throw new Error(`inject lost required service: ${name}`)
}

for (const symbol of [
  'function AccountUsageStatsSection',
  'function AccountUsageStatsInner',
  'class AccountUsageStatsBoundary',
  'function AccountSectionMain',
  'function AccountSection(',
]) {
  if (!text.includes(symbol)) throw new Error(`patched bundle lacks ${symbol}`)
}

console.log('load smoke test passed')
console.log(`  bundle       : ${target.path}`)
console.log(`  bundle state : ${state}`)
console.log(`  module id    : ${moduleId}`)
console.log(`  inject       : ${exports.inject.join(', ')}`)
