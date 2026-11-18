# Sites publication of large static assets

The normal development project remains `dist/` with all GLB and replay files
tracked in GitHub. Sites' source Git transport rejects pushes above 64MiB, and
large individual asset transfers have also suffered connection resets.

For publication, a separate Sites source checkout stores the unchanged
HTML/CSS/JavaScript under `site-src/`. The manifest `.openai/asset-inputs.json`
records paths, byte lengths, SHA-256 checksums and URLs pinned to a full GitHub
source commit. The public GitHub repository retains all original GLB/replay files.
This keeps the intermediary Sites source repository small. The builder also
supports gzip source parts for an offline source checkout.

The final source manifest declares `static.directory: dist`. Running
`node scripts/sites/build-static.mjs` in that publication checkout copies the
static code and assembles all assets into ignored `dist/`. Verified files already
present locally are reused; otherwise the exact committed files are fetched from
GitHub. Every asset is checked before packaging. There is no runtime URL substitution,
Git LFS account or API key. The deployment archive contains the
complete original static application, models and replays.

This builder is intended for the Sites publication checkout. It requires
`site-src/` and the asset-input manifest and does not change the development
project's layout. Future Sites source recovery can clone the Sites repository
and run this builder with Node.js. A fresh build fetches its pinned assets from
GitHub; the published application serves the complete assets from Sites.
