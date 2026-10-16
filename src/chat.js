'use strict';

const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');
const sendButton = document.getElementById('send');
const status = document.getElementById('status');
const providerPanel = document.getElementById('provider-panel');

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
loadHistory();
