# Contributing Guide

Thanks for your interest in dsh-weekstrip! This is a community patch for **DSH Desktop**
(DeepSeek Harness) that adds a local usage panel under **Settings → Account & balance**.
Issues, discussions and PRs are all welcome.

中文版：[CONTRIBUTING.md](CONTRIBUTING.md)

## Code of conduct

Be friendly and professional. Keep discussions technical; this project is not affiliated with
DeepSeek — do not impersonate official support or post unverified claims.

## Reporting issues

When filing an issue, please include:

1. **DSH Desktop version** (visible in the settings page or the installation folder properties);
2. OS and install method (Desktop installer / from source / global npm);
3. Steps to reproduce and expected behavior;
4. Relevant error output. For `patch.mjs` errors (e.g. `anchor "<name>" matched 0 time(s)`), paste
   the full text — but do **not** paste your local `client.js` contents or any session data.

## Development setup

- Node.js **18 or newer**;
- Most development and tests work without a DSH Desktop installation; tests that need one skip
  automatically.

```powershell
git clone <your fork>
cd dsh-weekstrip
npm run check        # CI gate: syntax + patch-engine test + aggregation test
```

## Common commands

```powershell
npm run engine-test    # anchor handling, insertion, idempotence, refusal paths, path detection
npm run logic-test     # window / streak / four-bucket math, hostile-data degradation
npm run load-test      # executes the patched bundle via __ModuleLoader__ (needs a local install)
npm run render-test    # renders the panel with a React shim and asserts the copy/figures
npm run preview        # regenerates docs/preview.html (light + dark, zh)
npm run preview -- --locale en   # English preview
```

`npm run check` must pass before you commit; CI runs the same gate.

## Submitting PRs

1. Branch off `main`, one focused change per PR;
2. Make sure all of the following pass:
   - `npm run check`;
   - If aggregation logic changed: `npm run logic-test`;
   - If insertion or anchors changed: `npm run engine-test`, plus a full local pass of
     `verify → apply → restart DSH` on your own installation;
3. If the panel copy or figures changed, update everything that mirrors them:
   - The `en` / `zh` copy in `src/snippet.js`;
   - The assertions in `npm run render-test`;
   - `docs/preview.html` (re-run `npm run preview`);
   - The relevant parts of both READMEs and this guide;
4. Commit messages: short English imperatives (e.g. `fix: clamp negative day totals`); the PR
   description should state the motivation and how it was verified.

### Adapting anchors for a new release

A DSH Desktop update may change the bundle structure; `apply` then aborts safely with
`anchor "<name>" matched 0 time(s)`. To adapt:

1. Locate the corresponding region in the new `client.js` (the changed area is usually small);
2. Update the anchor table in `src/anchors.mjs` and add the new version to `VERIFIED_VERSIONS`;
3. After `npm run engine-test` plus a local `verify` / `apply` / `load-test` pass, open a PR.

Do not commit DSH source code or bundle fragments as "evidence" for anchors — describe the region
in words instead.

## Hard constraints

These follow from the project's positioning — "edits one local file, ships no DSH code" — and PRs
violating them cannot be merged:

- Do **not** commit DSH's official code, build artifacts, a modified `client.js`, or any binaries;
- Do **not** commit files under `backups/` (git-ignored);
- The panel only reads local session projections; **no new network requests**. The only allowed
  external call is the same-origin, optional `POST api/dsh-context/backfill`;
- No telemetry, analytics or remote storage;
- Failures must leave the installation untouched: every write needs a backup and the `node --check`
  syntax gate first; mismatched anchors abort without touching the file;
- Third-party dependencies must be registered in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
  under an MIT-compatible license.

## Documentation

- The main README is Chinese (`README.md`); the English version is `README.en.md`. Keep both in sync;
- When adding a user-facing feature, update both READMEs and `docs/preview.html`.

## License

By submitting a contribution you agree to release it under the [MIT](LICENSE) license.
