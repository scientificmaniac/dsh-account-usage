#!/usr/bin/env node
/**
 * Engine test: exercise the patch engine against a synthetic bundle that carries the same five anchors,
 * so CI can verify anchor handling, insertion, idempotence and syntax gating without a DSH install.
 */

import { readSnippet, buildPatchedText, checkSyntax, countOccurrences, isPatched, PatchError, main } from '../src/patch.mjs'
import { PATCH_MARKER } from '../src/anchors.mjs'
import { candidateResourceDirs, BUNDLE_SUBPATH } from '../src/bundle.mjs'

/** A minimal but syntactically valid bundle carrying every anchor this patch targets. */
const FIXTURE = `window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-client-ui-settings-account",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		const en = {
			quotaTopUp: "Top up",
			bonusNoticeTitle: "Bonus credited"
		};
		const zh = {
			quotaTopUp: "充值",
			bonusNoticeTitle: "赠金已到账"
		};
		//#region lib/types/client/AccountSection.js
		function AccountSection({ t, useAccount, useTheme, start, cancel, openPlatformPage, avatarFailed }) {
			return { kind: "section" };
		}
		//#endregion
		function apply(ctx) {
			const t = (key) => key;
			const operations = { start() {} };
			ctx.slots.inject("settings.section", () => {
				let unregister;
				const update = () => {
					if (true) unregister ??= ctx.slots.register({
						name: "settings.section",
						id: "account",
						order: -10,
						label: () => t("nav"),
						locale: "settings.account",
						inject: () => operations
					}, AccountSection);
				};
				update();
				return () => { unregister?.(); };
			});
		}
		exports.apply = apply;
		exports.inject = ["slots"];
		return module.exports;
	}
});
`

const SECTION_INJECT = `\t\t\t\t\t\tlabel: () => t("nav"),
\t\t\t\t\t\tlocale: "settings.account",
\t\t\t\t\t\tinject: () => operations
\t\t\t\t\t}, AccountSection);`

let failures = 0
function check(name, condition, detail = '') {
  if (condition) console.log(`ok   ${name}`)
  else {
    failures += 1
    console.error(`FAIL ${name}${detail === '' ? '' : `\n     ${detail}`}`)
  }
}
function expectPatchError(name, run, pattern) {
  try {
    run()
    failures += 1
    console.error(`FAIL ${name}: expected a PatchError, nothing thrown`)
  } catch (error) {
    if (!(error instanceof PatchError)) {
      failures += 1
      console.error(`FAIL ${name}: threw ${error?.name ?? typeof error}, expected PatchError`)
    } else if (pattern !== undefined && !pattern.test(error.message)) {
      failures += 1
      console.error(`FAIL ${name}: message did not match ${pattern}\n     ${error.message}`)
    } else {
      console.log(`ok   ${name}`)
    }
  }
}

const snippet = readSnippet()

// 1. clean bundle: not patched, every anchor present once
check('clean fixture is not patched', isPatched(FIXTURE) === false)
for (const [name, anchor] of Object.entries({
  'dictionary-en': '\t\t\tbonusNoticeTitle: "Bonus credited"',
  'dictionary-zh': '\t\t\tbonusNoticeTitle: "赠金已到账"',
  'component-insert': '\t\t//#region lib/types/client/AccountSection.js',
  'component-rename': 'function AccountSection({ t, useAccount, useTheme, start, cancel, openPlatformPage, avatarFailed }) {',
  'section-inject': SECTION_INJECT,
})) {
  check(`anchor ${name} occurs once`, countOccurrences(FIXTURE, anchor) === 1, `count=${countOccurrences(FIXTURE, anchor)}`)
}

// 2. build the patched text
const patched = buildPatchedText(FIXTURE, snippet)
check('patched text carries the marker', patched.includes(PATCH_MARKER))
check('patched text is detected as patched', isPatched(patched) === true)
check('inserted module is present', patched.includes('function AccountUsageStatsSection'))
check('aggregation is present', patched.includes('function accountStatsOf'))
check('original component renamed', patched.includes('function AccountSectionMain({ t, useAccount, useTheme, start, cancel, openPlatformPage, avatarFailed, useSessions, refreshSessions })'))
check('wrapper component added', patched.includes('function AccountSection(props)'))
check('wrapper renders both halves', patched.includes('react.createElement(AccountSectionMain, props)') && patched.includes('react.createElement(AccountUsageStatsSection, props)'))
check('registration injects refreshSessions', patched.includes('refreshSessions: () =>') && patched.includes('ctx.get("sessions")'))
check('english copy added', patched.includes('statsTokenTitle: "Token usage"') && patched.includes('statsEmpty: "No local usage data yet. Usage from your sessions will appear here."'))
check('chinese copy added', patched.includes('statsTokenTitle: "Token 统计"') && patched.includes('statsEmpty: "暂无本地用量数据，会话产生用量后会在此显示。"'))
check('exports untouched', patched.includes('exports.apply = apply;') && patched.includes('exports.inject = ["slots"];'))
check('patched text grew', patched.split('\n').length > FIXTURE.split('\n').length)
check('anchor text survives insertion', patched.includes('\t\t//#region lib/types/client/AccountSection.js'))

// 3. syntax gate accepts it
try {
  checkSyntax(patched)
  console.log('ok   node --check accepts the patched text')
} catch (error) {
  failures += 1
  console.error(`FAIL node --check rejected the patched text: ${error.message}`)
}

// 4. refusal paths
expectPatchError('re-applying a patched bundle is refused', () => buildPatchedText(patched, snippet), /matched 0 time/)
expectPatchError('a missing anchor is refused', () => buildPatchedText(FIXTURE.replace(SECTION_INJECT, SECTION_INJECT.replace('inject: () => operations', 'inject: () => ({})')), snippet), /section-inject/)
expectPatchError('a duplicated anchor is refused', () => buildPatchedText(`${FIXTURE}\n${SECTION_INJECT}\n`, snippet), /matched 2 time/)
expectPatchError('an unrelated bundle is refused', () => buildPatchedText('console.log("not a dsh bundle")\n', snippet), /dictionary-en/)

// 5. install-path detection (pure, platform-parameterized)
const windowsDirs = candidateResourceDirs('win32', { LOCALAPPDATA: 'C:/Users/x/AppData/Local', PROGRAMFILES: 'C:/Program Files' }, 'C:/Users/x')
check('windows candidates include the local install', windowsDirs.some((dir) => dir.replace(/\\/g, '/') === 'C:/Users/x/AppData/Local/Programs/DSH Desktop/resources'))
check('windows candidates include program files', windowsDirs.some((dir) => dir.replace(/\\/g, '/') === 'C:/Program Files/DSH Desktop/resources'))
check('bundle subpath points at the account package', BUNDLE_SUBPATH.replace(/\\/g, '/') === 'app/node_modules/@deepseek-ai/dsh-client-ui-settings-account/lib/client.js')
const macDirs = candidateResourceDirs('darwin', {}, '/Users/x')
check('macOS candidates include /Applications', macDirs.includes('/Applications/DSH Desktop.app/Contents/Resources'))
const linuxDirs = candidateResourceDirs('linux', {}, '/home/x')
check('linux candidates include /opt', linuxDirs.includes('/opt/DSH Desktop/resources'))

// 6. CLI command parsing (help / unknown / flags before the command word)
function quietly(run) {
  const { log, error } = console
  console.log = () => {}
  console.error = () => {}
  try {
    return run()
  } finally {
    console.log = log
    console.error = error
  }
}
check('help exits 0', quietly(() => main(['help'])) === 0)
check('unknown command exits 2', quietly(() => main(['nope'])) === 2)
check('flags before the command are skipped', quietly(() => main(['--bundle', 'x', 'help'])) === 0)
check('no arguments defaults to status parser path', quietly(() => main(['--resources', 'x', 'unknown'])) === 2)

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`)
  process.exit(1)
}
console.log('\nengine test passed')
