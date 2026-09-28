# Saeed AI — Build Rules

These rules are mandatory for the official Windows build.

## Architecture
- Production is Windows Electron.
- The GLB character asset is retained in the repository for future renderer work, but the current Electron build must not load or display it.
- Three.js/GLB avatar rendering is disabled until a future implementation is explicitly added.
- Existing Saeed window architecture remains in use.
- Target window size is 760x480 unless deliberately changed in the product specification.

## Voice
- Microphone mode is Always Listening.
- Push-to-Talk must not replace Always Listening.
- Realtime API key remains separate from ordinary LLM/STT/TTS keys.

## Mandatory build gates
1. Required source files exist. The retained GLB asset remains in the repository but is not loaded by the application.
2. Direct production dependencies are pinned to exact versions.
3. npm install completes without dependency errors.
4. npm test passes.
5. Always Listening contract passes.
6. Electron build passes.
8. Exactly one Windows installer EXE exists.
9. Installer version matches VERSION and is never stale 1.0.0.
10. Installer is not suspiciously small.
11. Installer blockmap exists.
12. SHA-256 checksum is generated.
13. Verified files are uploaded as the workflow artifact.
14. A GitHub Release is created only when explicitly requested.

Any failed gate fails the workflow.

## Workflow policy
- Only .github/workflows/build-windows-electron.yml is the official build workflow.
- C++ builds are retired.
- GitHub Pages/preview builds are retired.
- Temporary repair workflows are forbidden.
- Concurrent main builds are cancelled so stale builds cannot publish releases.
- Node.js is pinned.
- Direct production dependencies are pinned.
- No release may be published from an unverified build.

## Repository hygiene
Do not add duplicate build workflows, repair workflows, preview deployment workflows, native C++ build files, obsolete installer definitions, or generated dist output.

The retired C++ workflow, preview workflow/page, repair workflow, CMake build definition, and legacy installer definition have been removed.

## Release identity
- Official releases are sequential MAJOR.MINOR versions: v2.0, v2.1, v2.2, v2.3, ...
- VERSION stores the official MAJOR.MINOR product version.
- package.json uses the corresponding Windows-compatible MAJOR.MINOR.0 version.
- Workflow Build numbers are technical/diagnostic identifiers only and are never part of the official release tag.
- Normal pushes create verified GitHub Actions artifacts but do not create GitHub Releases.
- A GitHub Release is created only when explicitly requested by the workflow release input or a commit containing [release].
- Release tags are exactly v<VERSION>.
- Installer and application metadata must never fall back to 1.0.0 or another stale product version.

Current official release: v2.1
