'use strict';

const $ = id => document.getElementById(id);
const mib = value => (Number(value || 0) / 1024 / 1024).toFixed(1) + ' MiB';
const duration = value => {
  const seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
  return Math.floor(seconds / 3600) + 'h ' + Math.floor(seconds % 3600 / 60) + 'm ' + seconds % 60 + 's';
};
function cell(row, value, className = '') {
  const td = document.createElement('td');
  td.textContent = value == null ? '—' : String(value);
  if (className) td.className = className;
  row.appendChild(td);
}
function renderProcesses(items) {
  const body = $('processes'); body.replaceChildren();
  for (const item of items || []) {
    const row = document.createElement('tr');
    cell(row, item.pid + ' / ' + item.type);
    cell(row, Number(item.cpuPercent || 0).toFixed(1) + '%', 'num');
    cell(row, mib(item.workingSetBytes), 'num');
    cell(row, mib(item.privateBytes), 'num');
    cell(row, Number(item.idleWakeupsPerSecond || 0).toFixed(1), 'num');
    body.appendChild(row);
  }
}
function renderServices(items) {
  const body = $('services'); body.replaceChildren();
  for (const item of items || []) {
    const row = document.createElement('tr');
    cell(row, item.name);
    const state = document.createElement('td'); const badge = document.createElement('span'); badge.className = 'state'; badge.textContent = item.state; state.appendChild(badge); row.appendChild(state);
    cell(row, (item.consumers || []).join(', ') || 'none');
    cell(row, item.runningForMs ? duration(item.runningForMs) : '—');
    cell(row, [item.lastReason, item.error].filter(Boolean).join(' · ') || '—');
    body.appendChild(row);
  }
}
async function sample() {
  try {
    const data = await window.saeed.diagnostics();
    $('uptime').textContent = duration(data.process.uptimeMs);
    $('cpu').textContent = (data.process.cpuUserMs + data.process.cpuSystemMs).toLocaleString() + ' ms';
    $('rss').textContent = mib(data.process.rssBytes);
    $('heap').textContent = mib(data.process.heapUsedBytes);
    renderProcesses(data.processes);
    renderServices(data.services);
    $('status').textContent = 'Last sample: ' + new Date().toLocaleTimeString();
    $('status').className = 'muted';
  } catch (error) {
    $('status').textContent = 'Sampling failed: ' + error.message;
    $('status').className = 'error';
  }
}
sample();
const timer = setInterval(sample, 1000);
window.addEventListener('beforeunload', () => clearInterval(timer));
