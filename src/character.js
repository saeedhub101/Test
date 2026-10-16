import * as THREE from 'three';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
const renderer = new THREE.WebGLRenderer({
  canvas, alpha: true, antialias: false, powerPreference: 'low-power'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff, 0x64708b, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(2, 4, 3);
scene.add(key);

let model = null;
let gltfClips = [];
let boneNodes = [];
let baseBoneRotations = new Map();
let morphMeshes = [];
let baseMorphWeights = new WeakMap();
let activeProfile = { boneRotations: {}, morphWeights: {} };
let behaviorMood = 'neutral';
let currentEmotionState = null;
let behaviorUntil = 0;
let nextBlinkAt = 0;
let behaviorTimer = null;
let modelHeight = 1.8;
let zoom = 1;
let lowPowerMode = true;
let renderPending = false;
let disposed = false;

function render() {
  if (disposed || renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    if (!disposed) renderer.render(scene, camera);
  });
}

function resize() {
  if (disposed) return;
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  render();
}

function frameModel(root) {
  // Compute bounds once. Zoom changes camera distance only, never re-centers
  // an already transformed model (which previously caused framing drift).
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  modelHeight = Math.max(size.y, size.x, size.z, 0.1);
  root.position.sub(center);
  updateCamera();
}

function updateCamera() {
  camera.position.set(0, modelHeight * 0.10, modelHeight * 2.35 / zoom);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.01, modelHeight / 100);
  camera.far = modelHeight * 30;
  camera.updateProjectionMatrix();
  render();
}

async function loadCharacter() {
  try {
    const asset = await window.saeed.assetStatus();
    if (!asset.exists) {
      status.textContent = 'Character asset missing: assets/saeed.glb';
      return;
    }
    status.textContent = 'Loading saeed.glb…';
    const gltf = await new GLTFLoader().loadAsync(asset.url);
    if (disposed) {
      gltf.scene.traverse(node => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
        else node.material?.dispose?.();
      });
      return;
    }
    model = gltf.scene;
    gltfClips = gltf.animations || [];
    boneNodes = [];
    morphMeshes = [];
    baseMorphWeights = new WeakMap();
    baseBoneRotations = new Map();
    model.traverse(node => {
      if (node.isMesh) node.frustumCulled = true;
      if (node.isBone) {
        boneNodes.push(node);
        if (!baseBoneRotations.has(node.name)) baseBoneRotations.set(node.name, node.rotation.clone());
      }
      if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) {
        morphMeshes.push(node);
        baseMorphWeights.set(node, node.morphTargetInfluences.slice());
      }
    });
    scene.add(model);
    frameModel(model);

    let meshCount = 0;
    let skinnedMeshCount = 0;
    let morphMeshCount = 0;
    const meshNames = [];
    const morphNames = new Set();
    model.traverse(node => {
      if (node.isMesh) { meshCount++; meshNames.push(node.name || '(unnamed mesh)'); }
      if (node.isSkinnedMesh) skinnedMeshCount++;
      if (node.isMesh && node.morphTargetDictionary) {
        morphMeshCount++;
        Object.keys(node.morphTargetDictionary).forEach(name => morphNames.add(name));
      }
    });
    status.textContent = `GLB loaded · meshes ${meshCount} · skinned ${skinnedMeshCount} · bones ${boneNodes.length} · morph meshes ${morphMeshCount} · clips ${gltfClips.length}`;
    window.saeed.reportCharacterInfo({
      loaded: true, meshes: meshNames,
      bones: boneNodes.map(node => node.name),
      morphs: [...morphNames],
      clips: gltfClips.map(clip => clip.name || '(unnamed clip)')
    });
    const profile = await window.saeed.getCharacterProfile();
    applyCharacterProfile(profile);
    render();
  } catch (error) {
    console.error('Failed to load character GLB', error);
    status.textContent = 'Could not load saeed.glb — see diagnostics';
  }
}

const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);
resize();

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  zoom = THREE.MathUtils.clamp(zoom * (event.deltaY < 0 ? 1.08 : 0.93), 0.6, 2.4);
  if (model) updateCamera();
}, { passive: false });

function applyCharacterProfile(profile) {
  if (!profile || !model) return;
  activeProfile = profile;
  for (const bone of boneNodes) {
    const base = baseBoneRotations.get(bone.name);
    if (!base) continue;
    bone.rotation.set(base.x, base.y, base.z, base.order);
    const offset = profile.boneRotations?.[bone.name];
    if (offset) {
      const radians = Math.PI / 180;
      bone.rotation.x += offset.x * radians;
      bone.rotation.y += offset.y * radians;
      bone.rotation.z += offset.z * radians;
    }
  }
  for (const mesh of morphMeshes) {
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const weight = profile.morphWeights?.[name];
      if (weight !== undefined) mesh.morphTargetInfluences[index] = weight;
      else mesh.morphTargetInfluences[index] = baseMorphWeights.get(mesh)?.[index] ?? 0;
    }
  }
  render();
}

function applyBehaviorEvent(event) {
  if (!event || typeof event.type !== 'string') return;
  if (event.emotionState) currentEmotionState = event.emotionState;
  if (event.type === 'emotion_state') { render(); return; }
  const now = performance.now();
  const durations = { greeting: 1800, listening: 500, thinking: 1200, tool_started: 600, tool_succeeded: 1600, tool_failed: 1300, task_completed: 1600, sleep: 0, wake: 1000 };
  behaviorMood = event.type;
  behaviorUntil = now + (durations[event.type] ?? 700);
  if (event.type === 'greeting' || event.type === 'wake' || event.type === 'tool_succeeded' || event.type === 'task_completed') {
    nextBlinkAt = Math.min(nextBlinkAt || Infinity, now + 150);
  }
  render();
}

function behaviorTick() {
  if (disposed || !model) return;
  if (document.visibilityState === 'visible') {
    const now = performance.now();
    const phase = now / 1500;
    for (const bone of boneNodes) {
      const base = baseBoneRotations.get(bone.name);
      if (!base) continue;
      const offset = activeProfile.boneRotations?.[bone.name] || { x: 0, y: 0, z: 0 };
      const radians = Math.PI / 180;
      let x = base.x + offset.x * radians;
      let y = base.y + offset.y * radians;
      let z = base.z + offset.z * radians;
      const n = bone.name.toLowerCase();
      if (/(head|neck)/.test(n)) {
        x += Math.sin(phase) * 0.012;
        const emotion = currentEmotionState?.values || {};
        z += Math.sin(phase * 0.35) * ((emotion.curiosity || 0.25) * 0.025);
        if ((emotion.happiness || 0) > 0.6) z += Math.sin(phase * 0.7) * 0.008;
        if (now < behaviorUntil) {
          if (behaviorMood === 'greeting' || behaviorMood === 'wake' || behaviorMood === 'task_completed' || behaviorMood === 'tool_succeeded') z += Math.sin((now - (behaviorUntil - 1600)) / 1600 * Math.PI) * 0.08;
          if (behaviorMood === 'thinking') y += 0.06;
          if (behaviorMood === 'tool_failed') z -= 0.045;
        }
      }
      if (/(spine|chest|upperchest)/.test(n)) x += Math.sin(phase) * 0.006;
      bone.rotation.set(x, y, z, base.order);
    }
    if (!nextBlinkAt) nextBlinkAt = now + 2500 + Math.random() * 3500;
    if (now >= nextBlinkAt) {
      let foundBlink = false;
      for (const mesh of morphMeshes) {
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
          if (/blink|eye.?close/i.test(name)) {
            mesh.morphTargetInfluences[index] = 1;
            foundBlink = true;
          }
        }
      }
      render();
      if (foundBlink) setTimeout(() => {
        if (disposed) return;
        for (const mesh of morphMeshes) for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
          if (/blink|eye.?close/i.test(name)) mesh.morphTargetInfluences[index] = activeProfile.morphWeights?.[name] ?? baseMorphWeights.get(mesh)?.[index] ?? 0;
        }
        render();
      }, 120);
      nextBlinkAt = now + 2500 + Math.random() * 3500;
    }
    render();
  }
  behaviorTimer = setTimeout(behaviorTick, document.visibilityState === 'visible' ? (lowPowerMode ? 125 : 50) : 500);
}

const unsubscribeBehavior = window.saeed.onBehaviorEvent(applyBehaviorEvent);
const unsubscribeProfile = window.saeed.onCharacterProfileChanged(applyCharacterProfile);

async function applySettings(settings) {
  if (!settings) return;
  lowPowerMode = Boolean(settings.lowPowerMode);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPowerMode ? 1 : 1.5));
  resize();
}

window.saeed.getSettings().then(applySettings).catch(error => {
  console.warn('Could not read character settings', error);
});
const unsubscribeSettings = window.saeed.onSettingsChanged(applySettings);

document.getElementById('chat').addEventListener('click', () => window.saeed.windowAction('open-chat'));
document.getElementById('hide').addEventListener('click', () => window.saeed.windowAction('hide-character'));
window.addEventListener('contextmenu', event => {
  event.preventDefault();
  window.saeed.showCharacterContextMenu();
});

window.addEventListener('beforeunload', () => {
  disposed = true;
  unsubscribeSettings();
  unsubscribeProfile();
  unsubscribeBehavior();
  clearTimeout(behaviorTimer);
  resizeObserver.disconnect();
  if (model) {
    scene.remove(model);
    model.traverse(node => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
      else node.material?.dispose?.();
    });
    model = null;
  }
  renderer.dispose();
});
loadCharacter().then(() => { if (!disposed) behaviorTick(); });
