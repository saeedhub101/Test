'use strict';

const $ = id => document.getElementById(id);
let info = { loaded: false, meshes: [], bones: [], morphs: [], clips: [] };
let profile = { version: 1, boneRotations: {}, morphWeights: {} };
let selectedBone = null;
let savedTimer = null;
let accessories = [];

function ensureAxisProfile() {
  if (!profile.axisCorrection) profile.axisCorrection = { xSign: 1, ySign: 1, zSign: 1, xScale: 1, yScale: 1, zScale: 1 };
}
function renderAxisProfile() {
  ensureAxisProfile();
  for (const axis of ['x', 'y', 'z']) {
    $('axis-' + axis + '-sign').value = String(profile.axisCorrection[axis + 'Sign']);
    $('axis-' + axis + '-scale').value = profile.axisCorrection[axis + 'Scale'];
    $('axis-' + axis + '-scale-out').textContent = Number(profile.axisCorrection[axis + 'Scale']).toFixed(1) + '×';
  }
}
function ensureAnimationProfile() {
  if (!profile.animation || typeof profile.animation !== 'object') profile.animation = { clip: '', speed: 1, loop: true };
}

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
function ensureAccessoriesProfile() {
  if (!Array.isArray(profile.accessories)) profile.accessories = [];
}
function renderAccessories() {
  ensureAccessoriesProfile();
  const container = $('accessory-list');
  container.replaceChildren();
  if (!accessories.length) {
    const empty = document.createElement('div'); empty.className = 'muted';
    empty.textContent = 'No accessories imported yet. Import a GLB accessory to attach it to a bone.';
    container.appendChild(empty); return;
  }
  for (const item of accessories) {
    const config = profile.accessories.find(value => value.id === item.id) || { id: item.id, enabled: false, attachBone: '', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 };
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px;background:#151925;border-radius:8px';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(config.enabled);
    checkbox.addEventListener('change', () => {
      const current = profile.accessories.find(value => value.id === item.id);
      if (current) current.enabled = checkbox.checked;
      else profile.accessories.push({ ...config, enabled: checkbox.checked });
      queueSave();
    });
    const name = document.createElement('strong'); name.textContent = item.name;
    const size = document.createElement('span'); size.className = 'muted'; size.textContent = Math.round(item.bytes / 1024) + ' KiB';
    const attach = document.createElement('select');
    attach.style.cssText = 'min-width:180px;padding:7px;background:#202433;color:white;border:1px solid #ffffff2a;border-radius:7px';
    const none = document.createElement('option'); none.value = ''; none.textContent = 'Attach to model origin'; attach.appendChild(none);
    for (const bone of info.bones) { const option = document.createElement('option'); option.value = bone; option.textContent = bone; attach.appendChild(option); }
    attach.value = config.attachBone || '';
    attach.addEventListener('change', () => {
      const current = profile.accessories.find(value => value.id === item.id);
      if (current) current.attachBone = attach.value;
      else profile.accessories.push({ ...config, enabled: checkbox.checked, attachBone: attach.value });
      queueSave();
    });
    const remove = document.createElement('button'); remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!window.confirm('Remove this accessory from the user library?')) return;
      try {
        accessories = await window.saeed.removeAccessory(item.id);
        profile.accessories = profile.accessories.filter(value => value.id !== item.id);
        renderAccessories(); queueSave();
      } catch (error) { setStatus('Accessory removal failed: ' + error.message, true); }
    });
    row.append(checkbox, name, size, attach, remove);
    const details = document.createElement('details');
    details.style.cssText = 'width:100%;padding-left:26px';
    const summary = document.createElement('summary'); summary.textContent = 'Position, rotation and scale';
    const controls = document.createElement('div');
    controls.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(100px,1fr));gap:8px;margin-top:8px';
    const updateConfig = patch => {
      let current = profile.accessories.find(value => value.id === item.id);
      if (!current) { current = { ...config }; profile.accessories.push(current); }
      Object.assign(current, patch);
      queueSave();
    };
    for (const axis of ['x', 'y', 'z']) {
      const label = document.createElement('label'); label.textContent = 'Position ' + axis.toUpperCase();
      const input = document.createElement('input'); input.type = 'number'; input.min = '-10'; input.max = '10'; input.step = '0.01'; input.value = config.position?.[axis] ?? 0;
      input.style.cssText = 'display:block;width:100%;padding:6px;background:#202433;color:white;border:1px solid #ffffff2a;border-radius:6px';
      input.addEventListener('change', () => {
        const position = { ...(profile.accessories.find(value => value.id === item.id)?.position || config.position) };
        position[axis] = Number(input.value);
        updateConfig({ position });
      });
      label.appendChild(input); controls.appendChild(label);
    }
    for (const axis of ['x', 'y', 'z']) {
      const label = document.createElement('label'); label.textContent = 'Rotation ' + axis.toUpperCase() + '°';
      const input = document.createElement('input'); input.type = 'number'; input.min = '-180'; input.max = '180'; input.step = '1'; input.value = config.rotation?.[axis] ?? 0;
      input.style.cssText = 'display:block;width:100%;padding:6px;background:#202433;color:white;border:1px solid #ffffff2a;border-radius:6px';
      input.addEventListener('change', () => {
        const rotation = { ...(profile.accessories.find(value => value.id === item.id)?.rotation || config.rotation) };
        rotation[axis] = Number(input.value);
        updateConfig({ rotation });
      });
      label.appendChild(input); controls.appendChild(label);
    }
    const scaleLabel = document.createElement('label'); scaleLabel.textContent = 'Scale';
    const scale = document.createElement('input'); scale.type = 'range'; scale.min = '0.01'; scale.max = '10'; scale.step = '0.01'; scale.value = config.scale ?? 1;
    const scaleValue = document.createElement('span'); scaleValue.textContent = Number(scale.value).toFixed(2) + '×';
    scale.addEventListener('input', () => {
      scaleValue.textContent = Number(scale.value).toFixed(2) + '×';
      updateConfig({ scale: Number(scale.value) });
    });
    scaleLabel.append(scale, scaleValue); controls.appendChild(scaleLabel);
    details.append(summary, controls); row.appendChild(details);
    container.appendChild(row);
  }
}
async function loadAccessories() {
  try { accessories = await window.saeed.getAccessories(); renderAccessories(); }
  catch (error) { setStatus('Could not load accessory library: ' + error.message, true); }
}
$('accessory-import').addEventListener('click', async () => {
  try {
    accessories = await window.saeed.importAccessory();
    renderAccessories();
    setStatus('Accessory catalog updated. Enable it and choose an attachment bone to display it.');
  } catch (error) { setStatus('Accessory import failed: ' + error.message, true); }
});

function renderInfo() {
  const clipSelect = $('clip-select');
  const previousClip = profile.animation?.clip || '';
  clipSelect.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = ''; placeholder.textContent = info.clips.length ? 'Select an animation clip' : 'No animation clips found';
  clipSelect.appendChild(placeholder);
  for (const name of info.clips) {
    const option = document.createElement('option'); option.value = name; option.textContent = name; clipSelect.appendChild(option);
  }
  ensureAnimationProfile();
  renderAxisProfile();
  clipSelect.value = info.clips.includes(previousClip) ? previousClip : '';
  $('clip-speed').value = profile.animation.speed;
  $('clip-speed-value').textContent = Number(profile.animation.speed).toFixed(1) + '×';
  $('clip-loop').checked = profile.animation.loop;
  $('clip-play').disabled = !info.clips.length;
  $('clip-stop').disabled = !info.clips.length;
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
  renderBones(); renderMorphs(); renderAccessories();
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
for (const axis of ['x', 'y', 'z']) {
  $('axis-' + axis + '-sign').addEventListener('change', () => {
    ensureAxisProfile();
    profile.axisCorrection[axis + 'Sign'] = Number($('axis-' + axis + '-sign').value);
    queueSave();
  });
  $('axis-' + axis + '-scale').addEventListener('input', () => {
    ensureAxisProfile();
    profile.axisCorrection[axis + 'Scale'] = Number($('axis-' + axis + '-scale').value);
    $('axis-' + axis + '-scale-out').textContent = profile.axisCorrection[axis + 'Scale'].toFixed(1) + '×';
    queueSave();
  });
}
$('axis-reset').addEventListener('click', () => {
  profile.axisCorrection = { xSign: 1, ySign: 1, zSign: 1, xScale: 1, yScale: 1, zScale: 1 };
  renderAxisProfile(); queueSave();
});
$('clip-select').addEventListener('change', () => {
  ensureAnimationProfile();
  profile.animation.clip = $('clip-select').value;
  queueSave();
});
$('clip-speed').addEventListener('input', () => {
  ensureAnimationProfile();
  profile.animation.speed = Number($('clip-speed').value);
  $('clip-speed-value').textContent = profile.animation.speed.toFixed(1) + '×';
  queueSave();
});
$('clip-loop').addEventListener('change', () => {
  ensureAnimationProfile();
  profile.animation.loop = $('clip-loop').checked;
  queueSave();
});
$('clip-play').addEventListener('click', () => {
  ensureAnimationProfile();
  profile.animation.clip = $('clip-select').value;
  if (!profile.animation.clip) { setStatus('Choose an animation clip first.', true); return; }
  queueSave();
});
$('clip-stop').addEventListener('click', () => {
  ensureAnimationProfile();
  profile.animation.clip = '';
  $('clip-select').value = '';
  queueSave();
});
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
window.saeed.getCharacterProfile().then(value => { profile = value; ensureAxisProfile(); ensureAnimationProfile(); ensureAccessoriesProfile(); renderInfo(); if (selectedBone) selectBone(selectedBone); }).catch(error => setStatus(error.message, true));
window.saeed.getCharacterInfo().then(value => { info = value; renderInfo(); }).catch(error => setStatus(error.message, true));
loadAccessories();
const unsubInfo = window.saeed.onCharacterInfoChanged(value => { info = value; renderInfo(); });
window.addEventListener('beforeunload', () => { clearTimeout(savedTimer); unsubInfo(); });
