import * as THREE from 'three';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
const renderer = new THREE.WebGLRenderer({
  canvas, alpha: true, antialias: false, powerPreference: 'low-power'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff, 0x64708b, 1.8));
const key = new THREE.DirectionalLight(0xffffff, 1.8);
key.position.set(2, 4, 3);
scene.add(key);

let model = null;
let modelHeight = 1.8;
let zoom = 1;
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
    model.traverse(node => {
      if (node.isMesh) node.frustumCulled = true;
    });
    scene.add(model);
    frameModel(model);

    let meshCount = 0;
    let skinnedMeshCount = 0;
    let boneCount = 0;
    let morphMeshCount = 0;
    model.traverse(node => {
      if (node.isMesh) meshCount++;
      if (node.isSkinnedMesh) skinnedMeshCount++;
      if (node.isBone) boneCount++;
      if (node.isMesh && node.morphTargetDictionary) morphMeshCount++;
    });
    const clips = gltf.animations?.length || 0;
    status.textContent = `GLB loaded · meshes ${meshCount} · skinned ${skinnedMeshCount} · bones ${boneCount} · morph meshes ${morphMeshCount} · clips ${clips}`;
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

document.getElementById('chat').addEventListener('click', () => window.saeed.windowAction('open-chat'));
document.getElementById('hide').addEventListener('click', () => window.saeed.windowAction('hide-character'));

window.addEventListener('beforeunload', () => {
  disposed = true;
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
