#!/usr/bin/env node
/**
 * dsh-account-usage — patch engine and CLI.
 *
 * Appends a local usage panel (tokens / last 7 days / activity) under Settings → Account in DSH Desktop,
 * by inserting one self-contained module into the account-settings client bundle that the Desktop ships.
 *
 * Commands:
 *   node src/patch.mjs status    show target, patched state, anchor hits, backups
 *   node src/patch.mjs verify    anchors + syntax check, writes nothing
 *   node src/patch.mjs apply     back up, then patch (idempotent)
 *   node src/patch.mjs revert    restore the most recent backup
 *
 * The bundle is located by src/bundle.mjs (flag → env → well-known install paths).
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PATCH_MARKER, VERIFIED_VERSIONS, textPatches } from './anchors.mjs'
import { missingBundleMessage, packageVersionOf, resolveBundle } from './bundle.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
export const SNIPPET_PATH = join(HERE, 'snippet.js')
export const BACKUP_DIR = join(REPO_ROOT, 'backups')
const SIMULATED_NAME = 'client.simulated.js'

/** Thrown when the target bundle does not match the anchor set (unknown or changed DSH version). */
export class PatchError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PatchError'
  }
}

export function readSnippet(snippetPath = SNIPPET_PATH) {
  if (!existsSync(snippetPath)) throw new PatchError(`snippet not found: ${snippetPath}`)
  return readFileSync(snippetPath, 'utf8').replace(/\r\n/g, '\n')
}

export function countOccurrences(haystack, needle) {
  if (needle === '') return 0
  let count = 0
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at === -1) return count
    count += 1
    from = at + needle.length
  }
}

export function isPatched(text) {
  return text.includes(PATCH_MARKER)
}

/**
 * Produce the patched bundle. Every anchor must occur exactly once; anchors that do not match mean the
 * target comes from another DSH release, so nothing is written and the caller sees which anchor failed.
 * @param {string} text original bundle text
 * @param {string} snippet module text inserted before the AccountSection region
 */
export function buildPatchedText(text, snippet) {
  let next = text
  for (const patch of textPatches(snippet)) {
    const hits = countOccurrences(next, patch.find)
    if (hits !== 1) {
      throw new PatchError(
        `anchor "${patch.name}" matched ${hits} time(s), expected exactly 1. `
        + 'The target bundle is from an unsupported DSH release; nothing was written.',
      )
    }
    const replacement = patch.replace ?? `${snippet}${patch.find}`
    next = next.replace(patch.find, replacement)
  }
  return next
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function backupPath() {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)
  return join(BACKUP_DIR, `client.js.${stamp}.bak`)
}

function listBackups() {
  if (!existsSync(BACKUP_DIR)) return []
  return readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('client.js.') && name.endsWith('.bak'))
    .sort()
}

/** Syntax gate on a candidate text: written to a scratch file and checked by `node --check`. */
export function checkSyntax(text) {
  mkdirSync(BACKUP_DIR, { recursive: true })
  const probe = join(BACKUP_DIR, SIMULATED_NAME)
  try {
    writeFileSync(probe, text, 'utf8')
    const result = spawnSync(process.execPath, ['--check', probe], { stdio: 'inherit' })
    if (result.status !== 0) {
      throw new PatchError(`syntax check failed for the patched bundle (node --check exit ${result.status ?? 'null'})`)
    }
  } finally {
    try { rmSync(probe, { force: true }) } catch { /* scratch file cleanup is best effort */ }
  }
}

function resolveTarget(argv) {
  const found = resolveBundle({ argv })
  if (found === null) {
    console.error(missingBundleMessage())
    process.exit(2)
  }
  if (!existsSync(found.path)) {
    console.error(`Bundle not found: ${found.path}\n\n${missingBundleMessage()}`)
    process.exit(2)
  }
  const version = packageVersionOf(found.path)
  if (version !== null && !VERIFIED_VERSIONS.includes(version)) {
    console.warn(`note: this anchor set was verified against DSH ${VERIFIED_VERSIONS.join(', ')}; target is ${version}.`)
  }
  return { ...found, version }
}

function report(target) {
  console.log(`target     : ${target.path}`)
  if (target.version !== null) console.log(`dsh version: ${target.version}`)
  console.log(`located by : ${target.origin}`)
}

function status(argv) {
  const target = resolveTarget(argv)
  const text = readFileSync(target.path, 'utf8')
  const snippet = readSnippet()
  const patches = textPatches(snippet)
  report(target)
  console.log(`size       : ${Buffer.byteLength(text, 'utf8')} bytes`)
  console.log(`state      : ${isPatched(text) ? 'patched' : 'unpatched'}`)
  console.log(`anchors    : ${patches.map((patch) => `${patch.name}=${countOccurrences(text, patch.find)}`).join(' ')}`)
  const backups = listBackups()
  console.log(`backups    : ${backups.length > 0 ? backups.join(', ') : '(none)'}`)
  return 0
}

function verify(argv) {
  const target = resolveTarget(argv)
  const text = readFileSync(target.path, 'utf8')
  report(target)
  if (isPatched(text)) {
    console.log('already patched: skipping candidate build (revert first to re-verify anchors).')
    return 0
  }
  const next = buildPatchedText(text, readSnippet())
  console.log('anchors    : all 5 matched exactly once')
  checkSyntax(next)
  console.log(`syntax     : ok (${Buffer.byteLength(next, 'utf8')} bytes); safe to apply`)
  return 0
}

function apply(argv) {
  const target = resolveTarget(argv)
  const text = readFileSync(target.path, 'utf8')
  report(target)
  if (isPatched(text)) {
    console.log('already patched: nothing to do (run revert first to re-apply from a clean bundle).')
    return 0
  }
  const next = buildPatchedText(text, readSnippet())
  checkSyntax(next)
  mkdirSync(BACKUP_DIR, { recursive: true })
  const backup = backupPath()
  copyFileSync(target.path, backup)
  writeFileSync(target.path, next, 'utf8')
  console.log(`backup     : ${backup}`)
  console.log(`sha256     : ${sha256(text)} -> ${sha256(next)}`)
  console.log('')
  console.log('Applied. Fully quit and relaunch DSH Desktop (the client bundle is snapshotted at host start),')
  console.log('then open Settings → Account. A plain page refresh does NOT pick up the change.')
  return 0
}

function revert(argv) {
  const target = resolveTarget(argv)
  const backups = listBackups()
  if (backups.length === 0) throw new PatchError(`no backups found in ${BACKUP_DIR}`)
  const latest = join(BACKUP_DIR, backups[backups.length - 1])
  report(target)
  copyFileSync(latest, target.path)
  console.log(`restored   : ${latest}`)
  console.log('Relaunch DSH Desktop for the revert to take effect.')
  return 0
}

function help() {
  console.log(`dsh-account-usage - patch engine

usage: node src/patch.mjs <command> [--bundle <client.js>] [--resources <resources dir>]

commands
  status    show target bundle, patched state, anchor hits and backups
  verify    anchor + syntax check, writes nothing
  apply     back up the bundle, then insert the usage panel (idempotent)
  revert    restore the most recent backup
  help      this text

environment
  DSH_ACCOUNT_BUNDLE   explicit path to .../dsh-client-ui-settings-account/lib/client.js
  DSH_RESOURCES_ROOT   Electron "resources" directory of the DSH Desktop install

After apply/revert, fully quit and relaunch DSH Desktop.`)
  return 0
}

const COMMANDS = { status, verify, apply, revert, help }
/** Flags that consume the following argv item, so that item is not mistaken for a command word. */
const VALUE_FLAGS = new Set(['--bundle', '--resources'])

/** Positional words only: flags and their values are skipped (`--bundle <path> apply` → `apply`). */
function positionalArgs(argv) {
  const words = []
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]
    if (VALUE_FLAGS.has(item)) {
      index += 1
      continue
    }
    if (item.startsWith('-')) continue
    words.push(item)
  }
  return words
}

export function main(argv = process.argv.slice(2)) {
  const command = positionalArgs(argv)[0] ?? 'status'
  if (!Object.hasOwn(COMMANDS, command)) {
    console.error(`unknown command "${command}"`)
    help()
    return 2
  }
  try {
    return COMMANDS[command](argv)
  } catch (error) {
    if (error instanceof PatchError) {
      console.error(`error: ${error.message}`)
      return 1
    }
    throw error
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) {
  process.exitCode = main()
}
