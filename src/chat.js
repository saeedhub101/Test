'use strict';

const messages = document.getElementById('messages');
const form = document.getElementById('form');
const input = document.getElementById('input');

function addMessage(text, role) {
  const item = document.createElement('div');
  item.className = `message ${role}`;
  item.textContent = text;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  addMessage('The conversation UI is connected. Brain integration is scheduled for the next phase.', 'assistant');
  input.value = '';
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});
document.getElementById('close').addEventListener('click', () => window.close());
