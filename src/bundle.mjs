/**
 * Locate the DSH account-settings client bundle on this machine.
 *
 * Resolution order:
 *   1. `--bundle <path>`            explicit client.js path
 *   2. `--resources <dir>`          Electron `resources` directory (default install layout)
 *   3. `DSH_ACCOUNT_BUNDLE`         env: explicit client.js path
 *   4. `DSH_RESOURCES_ROOT`         env: Electron `resources` directory
 *   5. well-known install locations for DSH Desktop on Windows / macOS / Linux
 *
 * Nothing here writes; callers get a resolved path or null and print their own guidance.
 */

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Path from an Electron `resources` directory to the bundle this patch edits. */
export const BUNDLE_SUBPATH = join(
  'app',
  'node_modules',
  '@deepseek-ai',
  'dsh-client-ui-settings-account',
  'lib',
  'client.js',
)

/** Path from `resources` to the patched package's own manifest (version lookup). */
const PACKAGE_SUBPATH = join('app', 'node_modules', '@deepseek-ai', 'dsh-client-ui-settings-account', 'package.json')

function flagValue(argv, name) {
  for (let index = 0; index < argv.length; index++) {
    const item = argv[index]
    if (item === `--${name}`) return argv[index + 1]
    if (item.startsWith(`--${name}=`)) return item.slice(name.length + 3)
  }
  return undefined
}

/** Candidate Electron `resources` directories, most likely first; missing entries are filtered by the caller. */
export function candidateResourceDirs(platform = process.platform, env = process.env, home = homedir()) {
  const dirs = []
  if (platform === 'win32') {
    for (const root of [env.LOCALAPPDATA, env['PROGRAMFILES'], env['PROGRAMFILES(X86)']]) {
      if (!root) continue
      dirs.push(join(root, 'Programs', 'DSH Desktop', 'resources'))
      dirs.push(join(root, 'DSH Desktop', 'resources'))
    }
    if (env.USERPROFILE) dirs.push(join(env.USERPROFILE, 'AppData', 'Local', 'DSH Desktop', 'resources'))
  } else if (platform === 'darwin') {
    dirs.push('/Applications/DSH Desktop.app/Contents/Resources')
    dirs.push(join(home, 'Applications', 'DSH Desktop.app', 'Contents', 'Resources'))
  } else {
    dirs.push('/opt/DSH Desktop/resources')
    dirs.push('/usr/lib/dsh-desktop/resources')
    dirs.push(join(home, '.local', 'share', 'DSH Desktop', 'resources'))
  }
  return dirs
}

/**
 * @param {{ argv?: string[], env?: Record<string, string | undefined>, platform?: string }} [options]
 * @returns {{ path: string, origin: string } | null}
 */
export function resolveBundle(options = {}) {
  const argv = options.argv ?? process.argv.slice(2)
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform

  const explicit = flagValue(argv, 'bundle') ?? env.DSH_ACCOUNT_BUNDLE
  if (explicit) return { path: explicit, origin: 'explicit bundle path' }

  const resources = flagValue(argv, 'resources') ?? env.DSH_RESOURCES_ROOT
  if (resources) return { path: join(resources, BUNDLE_SUBPATH), origin: 'resources directory' }

  for (const dir of candidateResourceDirs(platform, env)) {
    const candidate = join(dir, BUNDLE_SUBPATH)
    if (existsSync(candidate)) return { path: candidate, origin: `detected install (${dir})` }
  }
  return null
}

/** Read the patched package's version, or null when it cannot be read. */
export function packageVersionOf(bundlePath) {
  try {
    const manifest = join(bundlePath, '..', '..', 'package.json')
    const json = JSON.parse(readFileSync(manifest, 'utf8'))
    return typeof json.version === 'string' ? json.version : null
  } catch {
    return null
  }
}

/** Human-readable guidance when no bundle could be located. */
export function missingBundleMessage() {
  return [
    'Could not locate the DSH account-settings client bundle.',
    '',
    'Pass it explicitly (any of these works):',
    '  node src/patch.mjs status --bundle "<install>/resources/app/node_modules/@deepseek-ai/dsh-client-ui-settings-account/lib/client.js"',
    '  node src/patch.mjs status --resources "<install>/resources"',
    '  $env:DSH_ACCOUNT_BUNDLE="<...>/client.js"; node src/patch.mjs status',
    '',
    'DSH Desktop keeps it under: <install>/resources/app/node_modules/...',
    'On this machine the install root may be a custom folder, e.g. E:\\DSHDesktop\\DSH Desktop.',
  ].join('\n')
}
