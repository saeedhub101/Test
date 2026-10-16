# Saeed Desktop

A Windows-first Electron desktop assistant with a tray-resident main process, a transparent Three.js character window, Chat, a lifecycle-managed brain, persistent character rig settings, local skill storage, and optional voice input/output.

## Current capabilities

- Tray-managed show/hide, independent Chat, character size, Always on Top, Low Power Mode, Click-through, animation pause, speech mute, a live resource monitor and Quit.
- Real assets/saeed.glb downloaded from the Saeed-V2.0 reference repository before development startup and installer packaging.
- Import additional character GLBs into the user-data library, switch models from Character Settings, and retain a separate rig profile per imported model.
- Character diagnostics for meshes, bones, morph targets and embedded animation clips, with priority-aware semantic event-to-clip bindings and cross-fades.
- Importable GLB accessories stored under the user-data directory, with enable/disable, bone attachment, position, rotation and scale controls.
- Saved per-bone rest-pose overrides and rotation offsets, global X/Y/Z sign and scale corrections, morph weights, animation clip selection, playback speed and looping.
- Central Lifecycle Controller for Character, Brain, Chat, Learning, declarative add-ons, STT, TTS and resource diagnostics; a separate Behavior Engine chooses priority-aware event reactions and non-repeating, low-amplitude idle gestures while the character engine remains the only bone/renderer owner.
- Chat history and gradual emotional state saved in the user's application data directory.
- OpenAI-compatible chat providers; default local endpoint is http://127.0.0.1:11434/v1/chat/completions, model qwen2.5:3b. Install/run Ollama and pull a model separately if local AI is desired. Cloud-compatible endpoints can be configured in Brain settings.
- API keys are persisted through Electron safeStorage (OS-backed encryption); keys are not written as plaintext in provider.json.
- Explicit user-managed Learning panel for saving, searching, editing and deleting reusable skills/notes.
- Local Arabic and English intents for character visibility and character settings.
- Optional microphone input activated only after the user turns Mic on; built-in speech recognition availability depends on the installed Electron/Chromium speech service. TTS uses system speech synthesis and can be muted independently.

## Development

Requirements: Windows 10/11 or a supported Node.js 22 development environment.

```bash
npm ci
npm start
```

The prestart hook fetches and validates the canonical GLB if it is not already present. The runtime uses the asset at assets/saeed.glb.

Run syntax and functional tests:

```bash
npm run check
```

Build a Windows NSIS installer on Windows:

```bash
npm run dist:win
```

The GitHub Actions workflow Windows Installer is manual-only (`workflow_dispatch`). It uploads the installer as a workflow artifact; it does not publish a GitHub Release. The foundation syntax/unit-test workflow may run automatically, but it does not build a Windows installer.

## Data and privacy

Settings, character profile, brain provider configuration, chat history, emotional state and saved skills live in Electron's user-data directory, not inside the installed application. AI messages are sent to the configured provider when that provider is used. The local intent handlers and saved-skill storage do not require an AI provider.

## Important validation limits

A passing foundation CI workflow confirms source syntax, unit tests and that the GLB download has a valid GLB header. The manual Windows Installer workflow additionally builds the package and runs a UI/IPC smoke test covering GLB meshes/bones, Chat, Character Settings, Diagnostics, selected save/clear controls and settings persistence. That packaged smoke test is implemented but has not yet been run on the current `main` revision. Visual framing, microphone hardware recognition, TTS voices and real CPU/RAM usage still require observation on a Windows desktop before commercial release.

## Skill-pack add-ons

The Chat Add-ons panel imports declarative JSON skill packs. Packs do not execute JavaScript or native code. Example:

```json
{
  "name": "Office workflows",
  "version": "1.0.0",
  "type": "skill-pack",
  "description": "Reusable office guidance",
  "skills": [
    { "title": "Prepare a report", "content": "Summarize verified data and list missing inputs.", "tags": ["report", "office"] }
  ]
}
```

Imported packs are disabled by default. Enable a pack to let the brain search its saved skills; disabling or removing it prevents those skills from being returned.
