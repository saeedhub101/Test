# Saeed AI 2.0 — Project Status

## Version baseline

- Product version: **2.0**
- `VERSION` is the single official version source.
- Build numbers identify CI runs and are not product versions.

## Agent Core 2.0

The repository now defines an Agent Core 2.0 foundation covering:

- planning / plan revisions;
- persistent goals;
- execution journal;
- permission classification;
- bounded retry/recovery policy;
- model-routing hints;
- scheduler state;
- persistent agent context;
- evaluation hooks.

The next implementation phases must connect these foundations more deeply to the existing tool loop, skills, perception, knowledge/RAG, application adapters, scheduler, model providers and evaluation suite. Documentation must not describe an architectural capability as production-complete until the corresponding implementation and CI tests verify it.

## Character intelligence

The avatar runtime now includes a base-pose controller that:

- detects Hips, head, arm and hand bones where available;
- measures hands relative to the head/hips/shoulders;
- classifies approximate T-pose/A-pose/standing state;
- prefers embedded Idle/Stand/Breath/Rest/Default animations as the base animation;
- attempts geometry-driven T-pose → A-pose correction when no suitable idle animation exists;
- leaves unsupported/incomplete rigs static without crashing.

The existing manual Character Controller remains the single controller. Procedural idle/talking behavior remains additive.

## Native UI

Chat and Settings are independent Electron top-level windows. The old embedded chat/settings UI was removed. WebView2/Three.js remains reserved for the separate 3D avatar architecture.

## Mandatory verification

The Windows workflow remains the product validation contract. Any feature described as verified must have the corresponding GitHub Actions build/smoke-test evidence. A source commit alone is not release evidence.

## Historical checkpoints

### Build 369 baseline
The product was based on the v0.3.7 Build 369 checkpoint for the stable native C++ direction.

### Icons and character selection
Application/tray/installer icon integration and native character selection controls were added on top of the Build 369 direction.

## Current development direction

Saeed 2.0 is being developed as one coherent Agent product. Priority areas are:

1. planning and long-horizon execution;
2. verification and autonomous recovery;
3. perception/OCR/vision;
4. reusable skills and application adapters;
5. web-agent capabilities;
6. knowledge/RAG;
7. persistent goals and scheduling;
8. model routing and offline/local capability;
9. voice/STT/TTS;
10. evaluation and regression testing;
11. safe self-improvement mechanisms;
12. richer avatar state and behavior.
