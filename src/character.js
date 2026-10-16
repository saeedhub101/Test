import * as THREE from '../node_modules/three/build/three.module.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';

const canvas = document.getElementById('scene');
const status = document.getElementById('status');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
camera.position.set(0, 1.35, 3.2);
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xffffff, 0x64708b, 2.1));
const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(2, 4, 3);
scene.add(key);
let model = null;
let mixer = null;
let frame = 0;
let zoom = 1;
let lastTime = 0;
let isDragging = false;
let modelCenter = new THREE.Vector3();
let modelHeight = 1.8;

function resize() {
  const w = Math.max(1, canvas.clientWidth);
  const h = Math.max(1, canvas.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  frame = 0;
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(canvas);

function frameModel(root) {
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  modelCenter.copy(bounds.getCenter(new THREE.Vector3()));
  modelHeight = Math.max(size.y, size.x, size.z, 0.1);
  root.position.set(-modelCenter.x, -modelCenter.y, -modelCenter.z);
  camera.position.set(0, modelHeight * 0.12, modelHeight * 2.4 / zoom);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.01, modelHeight / 100);
  camera.far = modelHeight * 30;
  camera.updateProjectionMatrix();
}

async function loadCharacter() {
  const asset = await window.saeed.assetStatus();
  if (!asset.exists) {
    status.textContent = 'Character asset missing: assets/saeed.glb';
    return;
  }
  status.textContent = 'Loading saeed.glb…';
  new GLTFLoader().load('../assets/saeed.glb', (gltf) => {
    model = gltf.scene;
    model.traverse((node) => {
      if (node.isMesh) {
        node.frustumCulled = true;
        if (node.material) node.material.needsUpdate = true;
      }
    });
    scene.add(model);
    frameModel(model);
    if (gltf.animations?.length) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(gltf.animations[0]).play();
    }
    const meshes = [];
    const bones = [];
    const morphMeshes = [];
    model.traverse(node => {
      if (node.isMesh) {
        meshes.push(node.name || '(unnamed mesh)');
        if (node.morphTargetDictionary) morphMeshes.push(node.name || '(unnamed mesh)');
      }
      if (node.isBone) bones.push(node.name);
    });
    status.textContent = `GLB loaded · ${meshes.length} meshes · ${bones.length} bones · ${morphMeshes.length} morph meshes`;
  }, undefined, (error) => {
    console.error('Failed to load character GLB', error);
    status.textContent = 'Could not load saeed.glb — see diagnostics';
  });
}

function animate(now) {
  requestAnimationFrame(animate);
  const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
  lastTime = now;
  if (mixer && dt) mixer.update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
resize();

canvas.addEventListener('wheel', event => {
  event.preventDefault();
  zoom = THREE.MathUtils.clamp(zoom * (event.deltaY < 0 ? 1.08 : 0.93), 0.6, 2.4);
  if (model) frameModel(model);
}, { passive: false });

canvas.addEventListener('pointerdown', () => { isDragging = true; });
canvas.addEventListener('pointerup', () => { isDragging = false; });

document.getElementById('chat').addEventListener('click', () => window.saeed.windowAction('open-chat'));
document.getElementById('hide').addEventListener('click', () => window.saeed.windowAction('hide-character'));
window.addEventListener('beforeunload', () => {
  resizeObserver.disconnect();
  if (mixer) mixer.stopAllAction();
  if (model) {
    model.traverse(node => {
      if (node.geometry) node.geometry.dispose();
      if (Array.isArray(node.material)) node.material.forEach(m => m.dispose());
      else if (node.material) node.material.dispose();
    });
    scene.remove(model);
  }
  renderer.dispose();
});
loadCharacter();
