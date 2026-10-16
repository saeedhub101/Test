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
    const gltf = await new GLTFLoader().loadAsync('../assets/saeed.glb');
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
    baseBoneRotations = new Map();
    model.traverse(node => {
      if (node.isMesh) node.frustumCulled = true;
      if (node.isBone) {
        boneNodes.push(node);
        if (!baseBoneRotations.has(node.name)) baseBoneRotations.set(node.name, node.rotation.clone());
      }
      if (node.isMesh && node.morphTargetDictionary && node.morphTargetInfluences) morphMeshes.push(node);
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
      else mesh.morphTargetInfluences[index] = 0;
    }
  }
  render();
}

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
loadCharacter();
