'use strict';

const messages = document.getElementById('messages');
const $ = id => document.getElementById(id);
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');
const status = document.getElementById('status');
const providerPanel = document.getElementById('provider-panel');
let micRequested = false;
let recognition = null;
let speechActive = false;
let muted = false;
let restartRecognitionTimer = null;
let voiceUnsubscribers = [];

function addMessage(text, role) {
  const item = document.createElement('div');
  item.className = `message ${role}`;
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}
function renderHistory(history) {
  messages.replaceChildren();
  for (const item of history) addMessage(item.content, item.role === 'user' ? 'user' : 'assistant');
  if (!history.length) addMessage('Saeed is ready. Configure a local Ollama model or an OpenAI-compatible provider in Brain settings to enable general AI responses.', 'assistant');
}
async function loadHistory() {
  try { renderHistory(await window.saeed.getChatHistory()); }
  catch (error) { status.textContent = 'Could not load chat history: ' + error.message; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || sendButton.disabled) return;
  input.value = '';
  sendButton.disabled = true;
  input.disabled = true;
  status.textContent = 'Saeed is thinking…';
  try {
    const result = await window.saeed.sendChatMessage(text);
    renderHistory(result.history);
    status.textContent = result.source === 'provider' ? 'Connected to AI provider.' :
      result.source === 'local' ? 'Handled locally.' : 'Offline fallback · check provider settings.';
    if (!muted && result.answer) void window.saeed.speak(result.answer).catch(error => console.warn('TTS failed', error));
  } catch (error) {
    addMessage('Message failed: ' + error.message, 'assistant');
    status.textContent = 'Request failed.';
  } finally {
    sendButton.disabled = false;
    input.disabled = false;
    input.focus();
  }
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.getElementById('close').addEventListener('click', () => window.close());
document.getElementById('clear').addEventListener('click', async () => {
  if (!window.confirm('Clear the saved conversation history?')) return;
  try { renderHistory(await window.saeed.clearChatHistory()); status.textContent = 'Conversation history cleared.'; }
  catch (error) { status.textContent = error.message; }
});
document.getElementById('brain-settings').addEventListener('click', async () => {
  const opening = providerPanel.style.display === 'none' || !providerPanel.style.display;
  providerPanel.hidden = !opening;
  providerPanel.style.display = opening ? 'flex' : 'none';
  if (!opening) return;
  try {
    const provider = await window.saeed.getBrainProvider();
    document.getElementById('endpoint').value = provider.endpoint;
    document.getElementById('model').value = provider.model;
    document.getElementById('api-key').placeholder = provider.hasApiKey ? 'Key saved (leave blank to keep)' : 'Leave blank for local Ollama';
  } catch (error) { document.getElementById('provider-status').textContent = error.message; }
});
document.getElementById('save-provider').addEventListener('click', async () => {
  const endpoint = document.getElementById('endpoint').value.trim();
  const model = document.getElementById('model').value.trim();
  const apiKey = document.getElementById('api-key').value;
  const statusNode = document.getElementById('provider-status');
  try {
    const current = await window.saeed.getBrainProvider();
    await window.saeed.saveBrainProvider({ endpoint, model, apiKey: apiKey || (current.hasApiKey ? undefined : '') });
    document.getElementById('api-key').value = '';
    statusNode.textContent = 'Saved.';
    status.textContent = 'Provider configuration saved. It will be used for the next message.';
  } catch (error) { statusNode.textContent = 'Save failed: ' + error.message; }
});
function stopRecognition() {
  clearTimeout(restartRecognitionTimer);
  if (recognition) {
    recognition.onend = null;
    try { recognition.stop(); } catch {}
    recognition = null;
  }
}
async function startRecognition() {
  if (!micRequested || recognition || speechActive) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    window.saeed.reportSpeechError('Speech recognition is not available in this Electron runtime. Mic remains off.');
    micRequested = false;
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    if (!micRequested || speechActive) return;
    const instance = new SpeechRecognition();
    recognition = instance;
    instance.lang = 'ar-JO';
    instance.continuous = true;
    instance.interimResults = false;
    instance.onresult = event => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript + ' ';
      }
      if (transcript.trim()) {
        input.value = (input.value ? input.value + ' ' : '') + transcript.trim();
        form.requestSubmit();
      }
    };
    instance.onerror = event => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') window.saeed.reportSpeechError('Speech recognition: ' + event.error);
    };
    instance.onend = () => {
      if (recognition === instance) recognition = null;
      if (micRequested && !speechActive) restartRecognitionTimer = setTimeout(startRecognition, 350);
    };
    instance.start();
    status.textContent = 'Microphone on · speech recognition active.';
  } catch (error) {
    window.saeed.reportSpeechError('Microphone unavailable: ' + error.message);
  }
}
voiceUnsubscribers.push(window.saeed.onMicrophoneControl(value => {
  micRequested = Boolean(value?.active);
  $('mic').textContent = micRequested ? 'Mic On' : 'Mic Off';
  $('mic').classList.toggle('active', micRequested);
  if (micRequested) void startRecognition();
  else { stopRecognition(); status.textContent = 'Microphone off.'; }
}));
voiceUnsubscribers.push(window.saeed.onSpeechRequest(text => {
  speechActive = true;
  stopRecognition();
  if (muted || !('speechSynthesis' in window)) {
    speechActive = false;
    void window.saeed.speechFinished();
    if (micRequested) void startRecognition();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text || '').slice(0, 5000));
  utterance.lang = /[\u0600-\u06FF]/.test(utterance.text) ? 'ar-JO' : 'en-US';
  utterance.onend = utterance.onerror = () => {
    speechActive = false;
    void window.saeed.speechFinished();
    if (micRequested) void startRecognition();
  };
  window.speechSynthesis.speak(utterance);
}));
voiceUnsubscribers.push(window.saeed.onSpeechStop(() => {
  window.speechSynthesis?.cancel();
  speechActive = false;
}));
voiceUnsubscribers.push(window.saeed.onVoiceError(message => {
  micRequested = false; stopRecognition();
  $('mic').textContent = 'Mic Off'; $('mic').classList.remove('active');
  status.textContent = String(message);
}));
voiceUnsubscribers.push(window.saeed.onSettingsChanged(settings => {
  muted = Boolean(settings.muted);
  $('mute').textContent = muted ? 'Unmute TTS' : 'Mute TTS';
  $('mute').classList.toggle('active', muted);
  if (muted) window.speechSynthesis?.cancel();
}));
$('mic').addEventListener('click', async () => {
  const requested = !micRequested;
  try { await window.saeed.setMicrophoneActive(requested); }
  catch (error) { status.textContent = 'Could not change microphone state: ' + error.message; }
});
$('mute').addEventListener('click', async () => {
  try {
    const settings = await window.saeed.getSettings();
    await window.saeed.updateSettings({ muted: !settings.muted });
  } catch (error) { status.textContent = 'Could not change mute state: ' + error.message; }
});
window.saeed.getSettings().then(settings => {
  muted = Boolean(settings.muted);
  $('mute').textContent = muted ? 'Unmute TTS' : 'Mute TTS';
  $('mute').classList.toggle('active', muted);
});
window.addEventListener('beforeunload', () => {
  micRequested = false; stopRecognition(); window.speechSynthesis?.cancel();
  for (const unsubscribe of voiceUnsubscribers) unsubscribe();
});
loadHistory();
