# Third-party notices

This repository patches a locally installed copy of DeepSeek Harness (DSH) Desktop. It does **not**
redistribute DSH, its bundles, or any build of them: `apply` edits the user's own installation in
place, and the repository only contains the patch engine, the injected module and its tests.

## DeepSeek Harness (MIT)

The anchor strings in `src/anchors.mjs` quote short code fragments from
`@deepseek-ai/dsh-client-ui-settings-account` (and its surrounding bundle layout) solely to locate
insertion points. Those fragments are not "substantial portions" of the package, but attribution is
given here for clarity.

```
MIT License
Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

Project: <https://github.com/deepseek-ai/deepseek-harness>

## dsh-context (Apache-2.0)

`dsh-context` by bowenliang123 (<https://github.com/bowenliang123/dsh-context>, Apache-2.0) is the
inspiration for the data sources and the visual language of this panel:

- the per-day activity ledger this panel aggregates is the `contextActivity` session projection that
  `dsh-context` registers on the host;
- the panel optionally calls `dsh-context`'s `api/dsh-context/backfill` route so stored sessions get
  their projections folded (used only when installed; the request fails silently otherwise);
- card material, the compact token figures (`1.2M`, `345k`), the four-bucket bar and the activity
  grid follow its Settings/Insights conventions.

No source code from `dsh-context` was copied into this repository. Its Apache-2.0 license therefore
does not extend to this project, and this project's MIT license does not extend to it.

## Tailwind CSS color palette (MIT)

Four literal hex colors in `src/snippet.js` (`#14b8a6`, `#8b5cf6`, `#ec4899`) are standard Tailwind
palette values. Color values themselves are not copyrightable; no Tailwind code is included.

## Fonts and icons

None. The panel uses the host's own CSS variables and text only.
