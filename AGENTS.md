# Saeed AI — Mandatory Agent Instructions

This repository is the source of truth for Saeed AI. Before changing anything, read this file and **SAEED_ARCHITECTURE.md**, then inspect the current `.github/workflows/build-windows-electron.yml`, relevant code, recent Git history, and current GitHub Actions results.

## Non-negotiable rules

1. **Saeed Core first.** Agent/API/reasoning/tools/voice must be fast and independent of the 3D renderer.
2. **3D is visual only.** The character runs in its own lightweight Three.js/WebGL Electron window. Never move Agent/API/permissions/memory into the renderer.
3. **Preserve working voice/API behavior.** Do not rewrite the Realtime path without a concrete reason and tests.
4. **Chat and Settings are optional utility windows.** Closing them must never quit Saeed. Only Tray → Close Saeed exits the application.
5. **Chat requirements:** selectable text, clipboard copy, Delete current conversation, microphone controls, history, and normal close-to-hide behavior.
6. **Permissions:** reuse the existing Allow / Deny / Ask system. Do not create a parallel permission system.
7. **GLB:** `assets/Saeed_AI-3D.glb` is the default character. Renderer failures must not stop the Agent.
8. **No speculative claims.** Never report a build, test, artifact, EXE, or release as successful without verifying the actual GitHub Actions run and relevant jobs/artifacts/release.
9. **For release work, test the packaged Windows application.** Source syntax is not enough.
10. **Fix failures before reporting completion.** If a test exposes an error, continue the work and repair it before returning a completion status.
11. **No duplicate architecture.** Extend existing Agent, memory, permissions, updater, voice and UI systems instead of creating parallel implementations.
12. **No build/release unless requested.** When a release is requested, use the full workflow gate.

## Current architecture

```
Saeed Core
├── Agent / Planner / Verification
├── LLM API
├── Realtime Voice
├── Tools / Computer Control
├── Permissions
├── Memory
└── Tray / Lifecycle
     ├── Chat BrowserWindow
     ├── Settings BrowserWindow
     └── Character BrowserWindow
          └── Three.js + WebGL + GLB
```

The character window is renderer-only and must be independently disposable.

## Startup

Chat must not be the startup surface. Saeed's character appears at startup and gives a welcome greeting using configured API/realtime voice when available, otherwise Windows speech synthesis. Startup must not wait for a slow API response or character animation before Agent initialization.

## Lifecycle

- Chat X → hide Chat.
- Settings X → close Settings only.
- Character hide/close → hide/destroy character only; Agent remains alive.
- Tray Close Saeed → stop Realtime, destroy windows/tray, then quit.

The application must not use `window-all-closed` to quit merely because utility windows are closed.

## Character

Use Three.js + WebGL with a small transparent BrowserWindow. Cap pixel ratio and avoid heavy effects. Frame the GLB from actual bounds. Prefer embedded idle/stand/breath/rest/default animation. Unsupported rigs must fail gracefully. Expose explicit WebGL/renderer/GLB readiness markers for CI.

## Chat

Do not redesign Chat without an explicit user request. Preserve its current visual design and working voice/API behavior. The current Chat must support:

- New Chat
- Delete current conversation
- selectable text
- Copy message
- paste from clipboard
- Always Listening / Push to Talk / Mic Off
- screen capture
- history

## Performance

The critical path is user request → API/reasoning → tool → verification → response. Do not block it with GLB loading, animation, synchronous memory loading, or unnecessary window creation.

CI records CPU, RAM and GPU usage when Windows GPU Engine counters are available. Use those metrics to catch regressions.

## CI / release verification

The current workflow is mandatory. It must validate:

- version/dependencies/repository structure;
- JavaScript syntax;
- permissions;
- Chat lifecycle/delete/copy;
- microphone and Realtime contracts;
- API contract;
- Windows icon/taskbar identity;
- packaged installer;
- actual installed runtime;
- Chat and Settings UI;
- WebGL;
- actual GLB load;
- clean shutdown;
- CPU/RAM/GPU metrics;
- artifacts;
- release assets.

A release is valid only after the GitHub Actions run passes and the GitHub Release plus expected assets are verified.

## Repository documentation

`SAEED_ARCHITECTURE.md` is the authoritative product/architecture reference. Update it when a major architectural decision changes.

The repository and Git history are the source of truth for implementation state.
