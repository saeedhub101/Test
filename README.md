# Saeed AI test

Saeed AI is a Windows desktop AI companion and computer agent built as one Electron application with Three.js/WebGL for the permanent 3D character.

## Current architecture

- Desktop runtime: Electron + Chromium.
- UI: HTML/CSS/JavaScript.
- 3D: Three.js 0.180.0 + WebGL.
- 3D loader: src/three/GLTFLoader.js.
- Geometry utility: src/three/BufferGeometryUtils.js.
- AI orchestration: src/agent.js.
- Offline intent routing: src/local-brain.js.
- Computer and general tools: src/computer.js and src/tools.js.
- Persistent memory: src/memory.js.
- Optional realtime API: src/realtime.js.
- Local speech input: bundled Whisper CLI/model built by CI and invoked by src/main.js.
- Voice lifecycle: src/character-voice.js.
- Main process and IPC: src/main.js and src/preload.js.
- Autonomous brain boundary: src/autonomous/brain-supervisor.js, default-brain.js, context.js, tasks.js, and feelings.js.
- Character behavior layers: src/character-animation-controller.js, character-interaction.js, and character-feelings.js.

Old C++/Win32, C# desktop, Tauri/WebView2, duplicate character runtimes, and obsolete 3D reload-test APIs are not part of the current architecture.

## Startup behavior

- The 3D character window is available at startup.
- The microphone is OFF by default.
- No microphone capture stream or STT processing runs while Mic is OFF.
- TTS is idle until a response is spoken.
- Realtime API connections are not opened automatically.
- No agent task continuously executes in the background.
- Chat, Status, Performance, and 3D Status windows are created only when opened.

The saved microphone setting must not silently reopen the microphone at startup. Microphone activation is an explicit user action.

## Microphone and voice

The character window contains the authoritative MIC ON / MIC OFF control.

Mic OFF stops the complete microphone lifecycle, including the media stream, audio processing, microphone-level reporting, local speech buffering, transcription work, realtime audio transmission, and related voice resources.

Mic ON starts Windows/Electron microphone capture and selects the configured STT path. With the local Whisper provider, captured speech is sent to the bundled offline Whisper runtime. With a realtime provider, the realtime connection is started when required. Recognized text enters the same Agent/Chat path used for normal text requests.

The live microphone level is measured from the actual capture path; it is not a fixed placeholder.

## Local-first request flow

Normal requests follow:

User input → Local Brain → Agent/tools → verification → response

If Local Brain cannot handle the request safely or appropriately:

User input → configured external model/API → Agent/tools → verification → response

External API connections are on demand. The Agent is an orchestrator, not a collection of permanently running specialist agents.

## 3D character

The current authoritative runtime character is assets/Saeed_Test-3D.glb.

The character is loaded through the Three.js/WebGL renderer. The renderer uses the capabilities available in the GLB for rigging, animation, facial behavior, and interaction without creating a second character runtime.

The 3D renderer does not run a permanent render loop. It renders only when the scene actually needs an update, such as initial character load, resize, or another explicit visual change.

The renderer exposes live 3D status information for the 3D Status window, including component state and runtime render metrics.

## Windows and UI

### Character window

- Permanent visible Saeed surface.
- Three.js/WebGL canvas.
- Character surface can be dragged.
- Double-clicking the character opens Chat.
- Microphone control is available directly in the character window.
- Update UI is transient and appears only while an update/check operation has relevant state.

### Secondary windows

Chat, Status, Performance, and 3D Status are independent Electron windows. They are created when opened and destroyed when closed.

Opening a secondary window must not silently start microphone capture, STT, TTS, realtime networking, agent execution, or unnecessary background services.

## Agent, tools, and permissions

- src/agent.js — request orchestration, settings/history, model execution, and tool coordination.
- src/local-brain.js — local/offline intent handling.
- src/tools/registry.js — central tool registry, schemas and permission dispatch.
- src/tools/files.js — local file operations.
- src/tools/office.js — PDF/Excel/document operations.
- src/tools/windows.js — Windows/system operations.
- src/tools/web.js — web/search operations.
- src/tools/interaction.js — screen/mouse/keyboard operations.
- src/tools/memory-tasks.js — memory and task operations.
- src/tools.js — compatibility entry point only; do not add new tools here.
- src/computer.js — Windows computer operations.
- src/memory.js — persistent memory.

Sensitive or destructive computer operations remain confirmation-gated.

Electron permission handling explicitly supports media access and does not grant unrelated Chromium permissions by default.

## Diagnostics and performance

Diagnostics have two purposes: live runtime state for Status/Performance/3D Status, and diagnostic events for the Chat diagnostics surface.

Diagnostic events are not broadcast indiscriminately to every renderer.

Application resource monitoring uses a centralized Electron application-metrics collection path so different monitoring features do not repeatedly collect the same metrics independently.

CI diagnostic reports are preserved with the verified build artifact so CPU, RAM, process, GPU, disk, network, brain, voice, STT/TTS and 3D verification results can be inspected after the build.

## Updates

The application uses electron-updater. Update checking and downloading are on demand. The character update UI is transient and is not permanently displayed while idle.

There is no separate native C++ updater.

## Application icon

The source artwork is assets/saeed.png.

The Windows ICO is generated from that PNG during the official Windows build, so the generated ICO is not required as a committed source file.

## Build system

There is exactly one Windows build workflow:

.github/workflows/build-windows-electron.yml

Workflow name: Saeed AI — Windows Build

The workflow checks the exact commit, validates VERSION/package identity, installs dependencies, validates JavaScript, generates the Windows ICO, builds and tests bundled offline Whisper, builds the NSIS installer, runs the application runtime smoke test and resource report, verifies the installer/updater metadata, removes temporary CI reports, and uploads the verified Windows artifact. Isolated 3D testing is not part of future build verification.

Normal push and manual test builds do not create a GitHub Release. Release publication is gated by a matching v* version tag.

## Versioning

VERSION is the authoritative release version in MAJOR.MINOR form.

The current product version is 3.9 and the Windows package/build version is 3.9.0.

A GitHub Actions build number is a CI run number, not a product release version.

## Local development

Requirements: Windows, Node.js 22.14.0 or a compatible version, and npm.

Install: npm install

Run: npm start

Validate: npm test

Build installer: npm run build

The CI workflow is the authoritative Windows verification path because it also builds the bundled Whisper runtime, runs smoke tests, verifies the installer, and uploads the resulting artifact.

## Important files

### Application core

- src/main.js
- src/preload.js
- src/index.html
- src/renderer.js

### Character and voice

- src/character.html
- src/avatar.js
- src/character-controls.js
- src/character-voice.js
- assets/Saeed_Test-3D.glb
- assets/saeed.png

### Status and monitoring

- src/status.html / src/status.js / src/status.css
- src/performance.html / src/performance.js / src/performance.css
- src/3d-status.html / src/3d-status.js / src/3d-status.css

### Intelligence and tools

- src/agent.js
- src/local-brain.js
- src/tools.js
- src/computer.js
- src/memory.js
- src/realtime.js

### Three.js runtime

- src/three/GLTFLoader.js
- src/three/BufferGeometryUtils.js

### Packaging and CI

- package.json
- VERSION
- build/installer.nsh
- .github/workflows/build-windows-electron.yml

## File architecture and ownership map

The source tree is organized by responsibility. **Agents must follow this map before creating, moving, or modifying files. Do not create duplicate implementations in arbitrary directories.** If a new capability belongs to an existing domain, add it to that domain's folder/module instead of creating a parallel runtime.

### Authoritative directory map

Saeed-V2.0/
├── assets/                         # Runtime assets
├── src/
│   ├── main.js                    # Electron main process, windows, IPC, startup
│   ├── preload.js                 # Renderer-safe IPC/API bridge
│   ├── renderer.js                # Main renderer/UI orchestration
│   ├── agent.js                   # Agent orchestration and model/tool loop
│   ├── local-brain.js             # Fast offline intent routing
│   ├── brain-levels.js            # Brain-level classification
│   ├── tools.js                   # Compatibility entry point only
│   ├── tools/
│   │   ├── registry.js            # Single registry + permissions + dispatch
│   │   ├── files.js               # Filesystem tools
│   │   ├── office.js               # PDF/Excel/document tools
│   │   ├── windows.js              # Windows/system tools
│   │   ├── web.js                  # Web/search tools
│   │   ├── interaction.js          # Screen/mouse/keyboard tools
│   │   └── memory-tasks.js         # Memory/task tools
│   ├── computer.js                # Low-level Windows primitives
│   ├── memory.js                  # Persistent memory implementation
│   ├── agent-tools/index.js       # Legacy compatibility facade only
│   ├── realtime.js                # Optional realtime API transport
│   ├── character-voice.js         # Voice lifecycle
│   ├── avatar.js                  # Three.js/WebGL character renderer
│   ├── autonomous/                # Idle/autonomous behavior subsystem
│   └── ...                         # UI/status/runtime modules
├── build/                          # Build/installer resources
├── .github/workflows/              # CI/build automation
├── package.json
└── VERSION

### Tool architecture and ownership

There is one runtime tool registry: src/tools/registry.js. Tool implementations are split by domain so no giant agent.js or tools.js file accumulates unrelated capabilities.

| Capability | Owner |
|---|---|
| Tool registration, schemas, permissions, dispatch | src/tools/registry.js |
| Files and opening/revealing files | src/tools/files.js |
| PDF, Excel and document operations | src/tools/office.js |
| Windows/system/application operations | src/tools/windows.js + src/computer.js |
| Web/search | src/tools/web.js |
| Screen/mouse/keyboard | src/tools/interaction.js + src/computer.js |
| Memory/tasks | src/tools/memory-tasks.js |
| Agent reasoning and tool loop | src/agent.js |
| Fast offline intent routing | src/local-brain.js |

Do not create duplicate tool implementations. Add a capability to its existing domain module. src/tools.js and src/agent-tools/index.js are compatibility shims and should not become new tool homes.

### Where new code belongs

| New capability | Correct location |
|---|---|
| Agent reasoning/orchestration | src/agent.js |
| Local/offline intent | src/local-brain.js |
| Filesystem | src/tools/files.js |
| PDF/Excel/document | src/tools/office.js |
| Windows/system | src/tools/windows.js / src/computer.js |
| Web/search | src/tools/web.js |
| Screen/mouse/keyboard | src/tools/interaction.js / src/computer.js |
| Memory/tasks | src/tools/memory-tasks.js |
| Tool permissions/dispatch | src/tools/registry.js |
### Data/storage ownership

**Source code belongs in the repository. User/runtime state belongs in Electron userData. Temporary CI/build data belongs in dist/ or the CI workspace and must not become application state.**

~~~text
Repository
├── src/                  application source
├── assets/               bundled runtime assets
├── build/                installer/build resources
└── .github/              CI/build automation

Electron userData/
├── characters/           selected/persisted character data
├── tasks.json            Agent task state
└── other existing        persistent application state

dist/ / CI workspace       temporary build and verification output
~~~

**Never store user-specific runtime state inside src/ or assets/.** Do not overwrite the bundled default GLB when the user selects another character. Persist the selected character separately and restore it at startup.

### Agent tool lifecycle

Agent tools are **on-demand capabilities**, not permanently running services.

~~~text
User request
    ↓
Local Brain / Agent
    ↓
Select only the required tool(s)
    ↓
Central Tool Registry permission check
    ↓
Execute
    ↓
Observe / verify
    ↓
Use another tool only if required
    ↓
Return result
    ↓
Release temporary resources / end task
~~~

Rules:

1. Do not initialize specialist libraries at startup unless the architecture requires it.
2. Prefer lazy loading for heavy optional dependencies.
3. Prefer native structured tools over GUI automation when a reliable structured API exists.
4. Use GUI automation as a fallback when no suitable structured tool exists.
5. Tools must return clear results/errors; the Agent decides whether another tool is needed.
6. Do not create persistent workers, polling loops, or background services for one-shot Agent tasks.
7. Do not create duplicate implementations of existing capabilities.
8. New specialist tool families belong under src/agent-tools/, are exported through index.js, then registered by src/tools.js.
9. Permissions belong to the central Tool Registry; specialist tools must not create a second permission system.
10. Important file operations must be verified after execution.

### Resource-efficiency rules

- No permanent Agent loop. The Agent runs when a request requires it.
- No continuous 3D render loop. Render only when the scene actually needs updating.
- No unnecessary API calls. Use Local Brain first where appropriate.
- No unnecessary GUI automation. Use direct file/API operations first.
- No loading every specialist library at startup. Load capabilities when requested.
- No duplicated state stores. Use the existing memory/task/userData mechanisms.
- No speculative tool creation. Create/use a tool because the current request requires it.
- Bound Agent/tool execution with safe step/resource limits.
- Verify, then finish. Do not keep a session alive after the task is complete.

### File retrieval rule for future Agents

Before implementing a task, an Agent must:

1. Read this README.
2. Locate the existing owner of the capability in the map above.
3. Read that owner file and directly related modules.
4. Reuse existing interfaces before creating a new one.
5. Put new files only in the directory assigned to that responsibility.
6. Update this README whenever the architecture or ownership map changes.

If an existing capability already has an authoritative file, **modify that file instead of creating a second file with similar responsibility.**

## Architecture rules

1. Keep one coherent Electron + Three.js/WebGL application architecture.
2. Keep assets/Saeed_Test-3D.glb as the current runtime character unless a deliberate replacement is made and tested.
3. Do not reintroduce old C++/Win32, C# desktop, Tauri/WebView2, or duplicate 3D application paths.
4. Keep one character runtime and one microphone/voice lifecycle.
5. Keep the microphone OFF at startup unless the user explicitly turns it ON.
6. Keep the live microphone level tied to the real capture path.
7. Use Local Brain first for requests that can be handled locally; use external APIs only when required.
8. Keep secondary windows on demand and destroy them when closed.
9. Do not add permanent background polling or services merely to support a secondary window.
10. Keep 3D animation and procedural work throttled rather than executing at unrestricted display refresh rate.
11. Keep diagnostics live and purposeful; do not reintroduce obsolete diagnostic storage or reload-test APIs.
12. Do not grant unrelated Chromium permissions broadly.
13. Preserve working Chat/API/voice behavior when making unrelated 3D or performance changes.
14. Keep CI diagnostic reports temporary and remove them before artifacts are uploaded.
15. Treat the current source tree, package configuration, workflow, VERSION, and this README as the authoritative project description.


## Release 3.10

- Organized character right-click controls into compact Voice, Character, Diagnostics, and Updates/Settings submenus.
- Added grouped Windows taskbar Jump List actions for Chat, Performance, Settings, microphone, character size, Status, and 3D Status.
- Added live Performance resource breakdown by Electron process, including CPU, Working Set, Private Memory and process count.
- Added a live Diagnostics panel for Mic, Brain API, Local Brain, Whisper/STT, TTS, GLB, CPU and 3D state.
- Added microphone mode control to Settings and Performance.
- Preserved local Whisper/STT and existing TTS behavior.
