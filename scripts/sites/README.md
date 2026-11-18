# Sites publication of large static assets

The normal development project remains `dist/` with all GLB and replay files
tracked in GitHub. Sites' source Git transport rejects pushes above 64MiB, and
large individual asset transfers have also suffered connection resets.

For initial publication, a separate Sites source checkout stores the unchanged
HTML/CSS/JavaScript under `site-src/`. Each large binary/replay is gzip-compressed
and split into 512KiB source parts under `.openai/asset-parts/`. The manifest
`.openai/asset-inputs.json` records paths, byte lengths, SHA-256 checksums and the
GitHub source commit. Parts are uploaded in small batches; intermediate source
snapshots are never deployed.

The final source manifest declares `static.directory: dist`. Running
`node scripts/sites/build-static.mjs` in that publication checkout copies the
static code and reconstructs all assets into ignored `dist/`. Every asset is
checked before packaging. No external asset service, runtime URL substitution,
Git LFS account or API key is required. The deployment archive contains the
complete original static application, models and replays.

This builder is intended for the Sites publication checkout. It requires
`site-src/` and the asset-input manifest and does not change the development
project's layout. Future Sites source recovery can clone the Sites repository
and run this builder offline, with Node.js alone.
