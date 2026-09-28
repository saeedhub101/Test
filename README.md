# Saeed AI 3.5

Saeed AI is a Windows desktop AI Agent whose **Agent Core is prioritized for speed and reliability**. The 3D Saeed character is an isolated visual companion and must never become a bottleneck for API, reasoning, voice, tools or permissions.

## Current architecture

- **Agent Core:** planning, tool execution, verification, permissions and memory.
- **LLM / Realtime:** independent of the character renderer.
- **Chat:** separate utility window; closing it hides Chat and does not quit Saeed.
- **Settings:** separate utility window.
- **Character:** separate transparent Electron BrowserWindow using Three.js + WebGL and `assets/Saeed_AI-3D.glb`.
- **Tray:** Show Saeed, Chat, microphone modes, updates, Settings and Close Saeed.

See **[SAEED_ARCHITECTURE.md](SAEED_ARCHITECTURE.md)** for the mandatory architecture and performance contract.

## Chat

Chat supports conversation history, New Chat, Delete current conversation, selectable message text, clipboard Copy/Paste, screen capture and microphone modes.

## Character

The character is intentionally isolated from the Agent Core. The renderer loads the retained Saeed GLB, verifies WebGL/GLB readiness, frames the model using its real bounds, uses a suitable embedded idle animation when available, and runs at a deliberately low idle render rate so the Agent Core remains responsive.

## Performance

CI measures packaged idle CPU and RAM and records GPU utilization when the Windows GPU Engine performance counter is available. GPU counters are optional on GitHub-hosted runners and never block an otherwise valid build when unavailable.

The goal is to keep:

**user request → API/reasoning → tool → verification → response**

fast regardless of the character renderer.

## Build

Requirements:

- Windows x64
- Node.js 22.14.0

Install and test:

```powershell
npm install
npm test
```

Build the Windows installer:

```powershell
npm run build
```

The authoritative CI pipeline is:

`.github/workflows/build-windows-electron.yml`

A release is only considered valid after the full Windows workflow passes, including packaged runtime, WebGL/GLB, Chat, Settings, microphone/API contracts, clean shutdown and resource diagnostics.

## Versioning

Official product version is stored in `VERSION`. CI build numbers are diagnostic identifiers and are not product versions.

Current product line: **3.5.x**.

Release candidate: **3.5.0** — first release line with the isolated Saeed 3D character window.
