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
let loadGeneration = 0;
let gltfClips = [];
let mixer = null;
let activeAction = null;
let activeClipName = '';
let lastTickAt = 0;
let boneNodes = [];
let baseBoneRotations = new Map();
let morphMeshes = [];
let baseMorphWeights = new WeakMap();
const accessoryObjects = new Map();
const accessoryLoads = new Map();
let activeProfile = { restPose: {}, boneRotations: {}, morphWeights: {} };
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

function disposeCurrentModel() {
  for (const record of accessoryObjects.values()) {
    record.root.parent?.remove(record.root);
    disposeAccessory(record.root);
  }
  accessoryObjects.clear();
  accessoryLoads.clear();
  if (model) {
    scene.remove(model);
    mixer?.stopAllAction();
    mixer?.uncacheRoot(model);
    disposeAccessory(model);
  }
  model = null;
  gltfClips = [];
  mixer = null;
  activeAction = null;
  activeClipName = '';
  boneNodes = [];
  baseBoneRotations = new Map();
  morphMeshes = [];
  baseMorphWeights = new WeakMap();
}

async function loadCharacter() {
  const generation = ++loadGeneration;
  clearTimeout(behaviorTimer);
  behaviorTimer = null;
  disposeCurrentModel();
  try {
    const asset = await window.saeed.assetStatus();
    if (!asset.exists) {
      if (generation !== loadGeneration) return;
      status.textContent = 'Character model missing. Import or select a GLB in Character Settings.';
      window.saeed.reportCharacterInfo({ loaded: false, meshes: [], bones: [], morphs: [], clips: [] });
      return;
    }
    status.textContent = 'Loading saeed.glb…';
    const glbBuffer = await window.saeed.readCharacterAsset();
    const gltf = await new GLTFLoader().parseAsync(glbBuffer, '');
    if (disposed || generation !== loadGeneration) {
      disposeAccessory(gltf.scene);
      return;
    }
    model = gltf.scene;
    gltfClips = gltf.animations || [];
    mixer = new THREE.AnimationMixer(model);
    activeAction = null;
    lastTickAt = performance.now();
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
      boneRestRotations: Object.fromEntries([...baseBoneRotations.entries()].map(([name, rotation]) => [name, { x: rotation.x * 180 / Math.PI, y: rotation.y * 180 / Math.PI, z: rotation.z * 180 / Math.PI }])),
      morphs: [...morphNames],
      clips: gltfClips.map(clip => clip.name || '(unnamed clip)')
    });
    const profile = await window.saeed.getCharacterProfile();
    applyCharacterProfile(profile);
    render();
  } catch (error) {
    if (generation !== loadGeneration || disposed) return;
    console.error('Failed to load character GLB', error);
    status.textContent = 'Could not load the selected GLB — see diagnostics';
    window.saeed.reportCharacterInfo({ loaded: false, meshes: [], bones: [], morphs: [], clips: [] });
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
  applyAnimationProfile(profile.animation);
  void syncAccessories(profile.accessories || []);
  for (const bone of boneNodes) {
    const base = baseBoneRotations.get(bone.name);
    if (!base) continue;
    const radians = Math.PI / 180;
    const rest = profile.restPose?.[bone.name];
    bone.rotation.set(
      rest ? rest.x * radians : base.x,
      rest ? rest.y * radians : base.y,
      rest ? rest.z * radians : base.z,
      base.order
    );
    const offset = profile.boneRotations?.[bone.name];
    if (offset) {
      const axes = profile.axisCorrection || {};
      bone.rotation.x += offset.x * (axes.xSign ?? 1) * (axes.xScale ?? 1) * radians;
      bone.rotation.y += offset.y * (axes.ySign ?? 1) * (axes.yScale ?? 1) * radians;
      bone.rotation.z += offset.z * (axes.zSign ?? 1) * (axes.zScale ?? 1) * radians;
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

function disposeAccessory(root) {
  root.traverse(node => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}

async function syncAccessories(accessories) {
  if (!model || disposed) return;
  const desired = new Map((Array.isArray(accessories) ? accessories : []).filter(item => item && item.enabled).map(item => [item.id, item]));
  for (const [id, record] of accessoryObjects) {
    if (desired.has(id)) continue;
    record.root.parent?.remove(record.root);
    disposeAccessory(record.root);
    accessoryObjects.delete(id);
  }
  for (const [id, item] of desired) {
    let record = accessoryObjects.get(id);
    if (!record && !accessoryLoads.has(id)) {
      const loading = (async () => {
        const buffer = await window.saeed.readAccessory(id);
        const gltf = await new GLTFLoader().parseAsync(buffer, '');
        if (disposed || !activeProfile.accessories?.some(entry => entry.id === id && entry.enabled)) {
          disposeAccessory(gltf.scene);
          return;
        }
        const root = gltf.scene;
        record = { root, attachBone: '' };
        accessoryObjects.set(id, record);
      })().catch(error => {
        console.error('[character] accessory load failed', id, error);
        status.textContent = 'Accessory failed to load: ' + id;
      }).finally(() => accessoryLoads.delete(id));
      accessoryLoads.set(id, loading);
    }
    if (!record && accessoryLoads.has(id)) {
      await accessoryLoads.get(id);
      record = accessoryObjects.get(id);
    }
    if (!record) continue;
    const bone = item.attachBone ? boneNodes.find(node => node.name === item.attachBone) : null;
    const parent = bone || model;
    if (record.root.parent !== parent || record.attachBone !== (bone?.name || '')) {
      record.root.parent?.remove(record.root);
      parent.add(record.root);
      record.attachBone = bone?.name || '';
    }
    const position = item.position || { x: 0, y: 0, z: 0 };
    const rotation = item.rotation || { x: 0, y: 0, z: 0 };
    record.root.position.set(position.x || 0, position.y || 0, position.z || 0);
    record.root.rotation.set((rotation.x || 0) * Math.PI / 180, (rotation.y || 0) * Math.PI / 180, (rotation.z || 0) * Math.PI / 180);
    record.root.scale.setScalar(Number(item.scale) || 1);
  }
  render();
}

function applyAnimationProfile(animation) {
  if (!mixer) return;
  const requestedName = animation?.clip || '';
  const clip = gltfClips.find(item => item.name === requestedName);
  if (!clip) {
    if (activeAction) { activeAction.stop(); activeAction = null; activeClipName = ''; }
    return;
  }
  const speed = THREE.MathUtils.clamp(Number(animation?.speed) || 1, 0.1, 2);
  if (activeClipName !== clip.name || !activeAction || !activeAction.isRunning()) {
    if (activeAction) activeAction.stop();
    activeAction = mixer.clipAction(clip);
    activeClipName = clip.name;
    activeAction.reset();
    activeAction.play();
  }
  activeAction.setLoop(animation?.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, animation?.loop === false ? 1 : Infinity);
  activeAction.clampWhenFinished = animation?.loop === false;
  activeAction.timeScale = speed;
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
    const deltaSeconds = Math.max(0, Math.min(0.1, (now - (lastTickAt || now)) / 1000));
    lastTickAt = now;
    for (const bone of boneNodes) {
      const base = baseBoneRotations.get(bone.name);
      if (base) bone.rotation.set(base.x, base.y, base.z, base.order);
    }
    mixer?.update(deltaSeconds);
    const phase = now / 1500;
    const clipOwnsPose = Boolean(activeAction?.isRunning());
    for (const bone of boneNodes) {
      const base = baseBoneRotations.get(bone.name);
      if (!base) continue;
      const offset = activeProfile.boneRotations?.[bone.name] || { x: 0, y: 0, z: 0 };
      const rest = activeProfile.restPose?.[bone.name];
      const radians = Math.PI / 180;
      const axes = activeProfile.axisCorrection || {};
      let x = bone.rotation.x + (rest ? rest.x - base.x * 180 / Math.PI : 0) * radians + offset.x * (axes.xSign ?? 1) * (axes.xScale ?? 1) * radians;
      let y = bone.rotation.y + (rest ? rest.y - base.y * 180 / Math.PI : 0) * radians + offset.y * (axes.ySign ?? 1) * (axes.yScale ?? 1) * radians;
      let z = bone.rotation.z + (rest ? rest.z - base.z * 180 / Math.PI : 0) * radians + offset.z * (axes.zSign ?? 1) * (axes.zScale ?? 1) * radians;
      const n = bone.name.toLowerCase();
      if (!clipOwnsPose && /(head|neck)/.test(n)) {
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
      if (!clipOwnsPose && /(spine|chest|upperchest)/.test(n)) x += Math.sin(phase) * 0.006;
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
const unsubscribeModel = window.saeed.onCharacterModelChanged(() => {
  status.textContent = 'Loading selected character…';
  void loadCharacter().then(() => {
    if (!disposed && model) { lastTickAt = performance.now(); behaviorTick(); }
  });
});
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
    mixer?.stopAllAction();
    mixer?.uncacheRoot(model);
    for (const record of accessoryObjects.values()) {
      record.root.parent?.remove(record.root);
      disposeAccessory(record.root);
    }
    accessoryObjects.clear();
    accessoryLoads.clear();
    mixer = null;
    activeAction = null;
    activeClipName = '';
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
