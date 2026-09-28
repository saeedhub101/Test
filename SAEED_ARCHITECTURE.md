# Saeed AI — Authoritative Product Architecture

**Status:** Mandatory reference for all coding agents.  
**Product:** Saeed AI Windows desktop agent.  
**Current release line:** 3.5.x.

**Release candidate:** 3.5.0 — first release line with the isolated Saeed 3D character window.

## 1. Non-negotiable priority

Saeed's **Agent Core is the product**. API speed, reasoning, tool execution, voice/realtime response and reliable automation have higher priority than visual effects.

The 3D character is a visual companion layer. It must never become a dependency of the Agent Core.

If the character renderer fails, becomes unavailable, or is temporarily hidden:

- Agent/API must continue working.
- Chat must continue working.
- Settings must continue working.
- Voice/Always Listening must continue working.
- Tool execution and permissions must continue working.

Never put API, Agent, voice or tool logic inside the character renderer.

## 2. Runtime architecture

```
Saeed Core
├── Agent / Planner / Verification
├── LLM API
├── Realtime Voice
├── Tools / Computer Control
├── Permissions
├── Memory
└── Tray / Lifecycle
     │
     ├── Chat Window (optional)
     ├── Settings Window (optional)
     └── Character Window (visual-only)
          └── Three.js + WebGL + Saeed_AI-3D.glb
```

The Character Window is an independent Electron BrowserWindow. It must not contain Agent, API, memory, permissions or tool implementations.

## 3. Character technology

The current renderer uses **Three.js + WebGL** in a dedicated transparent Electron window.

Why:

- proven GLB/WebGL path in this repository;
- no game engine;
- no C#/DirectX renderer;
- no second application runtime;
- easy GLB replacement;
- isolated renderer process;
- controllable rendering budget.

The renderer must remain lightweight:

- small transparent window around the character;
- pixel ratio capped;
- no heavy post-processing;
- no real-time shadows unless explicitly justified;
- no physics engine;
- no full-screen overlay;
- render at a lower idle cadence when possible;
- animations may raise the cadence temporarily;
- hide/disable rendering when the character is hidden.

## 4. GLB contract

Default asset:

`assets/Saeed_AI-3D.glb`

The renderer must:

1. create a WebGL context;
2. create a Three.js renderer;
3. load the GLB with GLTFLoader;
4. frame the model from actual GLB bounds;
5. use an embedded Idle/Stand/Breath/Rest/Default animation when available;
6. otherwise keep the model static if no animation exists;
7. never fail the Agent because of an unsupported rig;
8. expose explicit readiness/error markers for CI.

Future controller work may add:

- automatic bone detection;
- T-pose/A-pose classification;
- eye tracking;
- blinking;
- lip sync;
- facial morphs;
- breathing;
- gestures;
- walking;
- S/M/L sizing.

Do not hard-code character proportions or assume universal bone names.

## 5. Startup

Startup order is intentionally:

1. Start the Electron main process.
2. Initialize Agent/settings/permissions.
3. Keep API/voice independent from the renderer.
4. Create the character window.
5. Show Saeed as soon as the character surface is ready.
6. Speak a welcome message without blocking Agent startup.

Chat must **not** be the startup window.

Welcome voice:

- use configured API/realtime voice when available;
- otherwise use Windows speech synthesis;
- character visibility must not wait for a slow API response.

## 6. Chat and Settings lifecycle

Chat and Settings are utility windows, not the application lifecycle owner.

Closing Chat:

- hides Chat;
- does **not** stop Saeed;
- does **not** stop API/voice;
- does **not** quit the application.

Closing Settings closes only Settings.

The only normal application exit is:

**Tray/Taskbar → Close Saeed**

The application must remain alive while all utility windows are closed.

## 7. Tray contract

The tray must provide:

- Show Saeed
- Chat
- Always Listening
- Push to Talk
- Mic Off
- Check for Updates
- Settings
- Close Saeed

Right-clicking the character may expose the same core navigation actions.

## 8. Chat requirements

Chat currently remains a separate polished window.

Required behavior:

- conversation history;
- New Chat;
- Delete current conversation;
- selectable message text;
- Copy message action;
- normal Windows clipboard copy/paste;
- close button hides Chat instead of quitting Saeed;
- microphone controls remain available;
- screen capture remains available.

Do not redesign the current Chat UI unless the user explicitly requests it.

## 9. API / Agent performance

The critical path is:

**user request → API/reasoning → tool → verification → result**

Do not block it with:

- GLB loading;
- unnecessary renderer initialization;
- visual animation;
- settings UI;
- Chat window creation;
- expensive synchronous startup file I/O.

Persistent memory is lazy-loaded where possible.

Realtime must remain close to the working baseline unless a change is required and tested.

## 10. Permissions

Normal operations can execute directly when policy says Allow.

Sensitive operations use the existing Allow / Deny / Ask policy:

- Allow → execute;
- Deny → block and use another safe path when possible;
- Ask → show a clear confirmation describing the operation and reason.

Do not create a second permission system.

## 11. Resource budget

CI must measure packaged idle resource usage and record:

- CPU percentage;
- RAM/working-set MB;
- GPU utilization when the Windows GPU Engine counter is available;
- process count.

Resource results are saved as:

`saeed-resource-metrics.json`

The initial CI gate should catch major regressions rather than pretend that one fixed machine represents every user's hardware.

Future optimization should compare:

- Agent-only baseline;
- Agent + character visible;
- Chat open;
- Always Listening active;
- animation active.

## 12. CI release gate

A Windows release is not valid until CI has verified:

1. VERSION/package identity.
2. Required source/assets.
3. pinned dependencies.
4. JavaScript syntax.
5. Chat delete/copy/lifecycle contract.
6. permissions contract.
7. microphone controls and realtime audio contract.
8. API request/realtime contract.
9. Windows taskbar/AppDetails/icon contract.
10. Windows installer creation.
11. exactly one installer.
12. packaged installation.
13. Chat runtime UI.
14. Settings runtime UI.
15. WebGL initialization.
16. actual GLB loading.
17. character renderer readiness.
18. clean shutdown.
19. CPU/RAM/GPU diagnostic measurement.
20. artifact upload.
21. only then, release publication.

A source-code check alone is not proof that a runtime feature works.

## 13. Agent instructions

Every coding agent must:

- read this file and `AGENTS.md`;
- inspect the current workflow before changing code;
- inspect current GitHub Actions results before reporting status;
- preserve working voice/API behavior;
- make coherent changes rather than repeated speculative rewrites;
- test the actual packaged application for release work;
- fix discovered failures before reporting completion;
- never claim a build/release succeeded without GitHub evidence.

## 14. Architectural rule

**Saeed Core must remain fast even when the character is removed.**

Any future proposal that makes the Agent depend on the 3D renderer violates this architecture and must be rejected or redesigned.
