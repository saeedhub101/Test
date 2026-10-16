'use strict';

const $ = id => document.getElementById(id);
let info = { loaded: false, meshes: [], bones: [], morphs: [], clips: [] };
let profile = { version: 1, boneRotations: {}, morphWeights: {} };
let selectedBone = null;
let savedTimer = null;

function setStatus(message, isError = false) {
  $('status').textContent = message;
  $('status').style.color = isError ? '#ff9a9a' : '#9fca9f';
}
function renderBones() {
  const filter = $('bone-filter').value.trim().toLowerCase();
  const container = $('bones');
  container.replaceChildren();
  const bones = info.bones.filter(name => name.toLowerCase().includes(filter));
  if (!bones.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = info.loaded ? 'No matching bones. The GLB may not contain a rig.' : 'Waiting for character model…';
    container.appendChild(empty);
    return;
  }
  for (const name of bones) {
    const button = document.createElement('button');
    button.className = 'bone' + (name === selectedBone ? ' active' : '');
    button.textContent = name;
    button.addEventListener('click', () => selectBone(name));
    container.appendChild(button);
  }
}
function selectBone(name) {
  selectedBone = name;
  $('selected').textContent = name;
  const value = profile.boneRotations[name] || { x: 0, y: 0, z: 0 };
  for (const axis of ['x', 'y', 'z']) {
    $('r' + axis).value = value[axis];
    $('r' + axis + 'v').textContent = value[axis] + '°';
  }
  renderBones();
}
function renderMorphs() {
  const container = $('morphs');
  container.replaceChildren();
  if (!info.morphs.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'The model exposes no morph targets. Bone animation remains available where rigged.';
    container.appendChild(empty);
    return;
  }
  for (const name of info.morphs) {
    const row = document.createElement('div');
    row.className = 'axis';
    const label = document.createElement('label');
    label.textContent = name;
    label.title = name;
    const slider = document.createElement('input');
    slider.type = 'range'; slider.min = '0'; slider.max = '1'; slider.step = '0.01';
    slider.value = profile.morphWeights[name] ?? 0;
    const output = document.createElement('output');
    output.textContent = Number(slider.value).toFixed(2);
    slider.addEventListener('input', () => {
      profile.morphWeights[name] = Number(slider.value);
      output.textContent = Number(slider.value).toFixed(2);
      queueSave();
    });
    row.append(label, slider, output);
    container.appendChild(row);
  }
}
function renderInfo() {
  $('model-state').textContent = info.loaded
    ? 'GLB loaded · ' + info.meshes.length + ' meshes · ' + info.bones.length + ' bones · ' + info.morphs.length + ' morph targets · ' + info.clips.length + ' animation clips'
    : 'Model not loaded. Ensure assets/saeed.glb is present and inspect the character window.';
  const meshes = $('mesh-list'); meshes.replaceChildren();
  for (const name of info.meshes) {
    const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = name; meshes.appendChild(chip);
  }
  const clips = $('clips'); clips.replaceChildren();
  if (!info.clips.length) clips.textContent = 'No embedded animation clips detected.';
  else for (const name of info.clips) { const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = name; clips.appendChild(chip); }
  renderBones(); renderMorphs();
}
async function save() {
  clearTimeout(savedTimer);
  try {
    profile = await window.saeed.saveCharacterProfile(profile);
    setStatus('Saved to disk and applied to the character.');
  } catch (error) { setStatus('Save failed: ' + error.message, true); }
}
function queueSave() {
  setStatus('Unsaved changes…');
  clearTimeout(savedTimer);
  savedTimer = setTimeout(save, 500);
}
for (const axis of ['x', 'y', 'z']) {
  $('r' + axis).addEventListener('input', () => {
    if (!selectedBone) return;
    const value = profile.boneRotations[selectedBone] || { x: 0, y: 0, z: 0 };
    value[axis] = Number($('r' + axis).value);
    profile.boneRotations[selectedBone] = value;
    $('r' + axis + 'v').textContent = value[axis] + '°';
    queueSave();
  });
}
$('bone-filter').addEventListener('input', renderBones);
$('save').addEventListener('click', save);
$('reset-bone').addEventListener('click', () => {
  if (!selectedBone) return;
  delete profile.boneRotations[selectedBone]; selectBone(selectedBone); queueSave();
});
$('reset-all').addEventListener('click', () => {
  profile.boneRotations = {}; profile.morphWeights = {};
  if (selectedBone) selectBone(selectedBone);
  renderMorphs(); queueSave();
});
$('close').addEventListener('click', () => window.close());
window.saeed.getCharacterProfile().then(value => { profile = value; renderMorphs(); if (selectedBone) selectBone(selectedBone); }).catch(error => setStatus(error.message, true));
window.saeed.getCharacterInfo().then(value => { info = value; renderInfo(); }).catch(error => setStatus(error.message, true));
const unsubInfo = window.saeed.onCharacterInfoChanged(value => { info = value; renderInfo(); });
window.addEventListener('beforeunload', () => { clearTimeout(savedTimer); unsubInfo(); });
