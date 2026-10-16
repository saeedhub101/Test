# Character asset

The runtime expects the canonical character model at `assets/saeed.glb`.

For development bootstrap, run `npm run fetch:character`. It downloads the current reference asset from `saeedhub101/Saeed-V2.0/assets/Saeed_AI-3D.glb`, validates the GLB container header, and saves it under the stable filename `saeed.glb`.

The binary is intentionally not duplicated in Git history through text-based edits. Before a distributable release, vendor this validated asset into the release source or configure a pinned, versioned asset source and verify its SHA-256. Do not ship a release without the real asset.
