'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { EmotionState } = require('./emotion-state');

const DEFAULT_PROVIDER = Object.freeze({
  endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
  model: 'qwen2.5:3b',
  apiKey: '',
  temperature: 0.7,
  maxTokens: 700
});

class BrainService {
  constructor({ dataDirectory, onEvent = () => {}, fetchImpl = globalThis.fetch, encryptSecret = null, decryptSecret = null, toolRegistry = null } = {}) {
    this.dataDirectory = dataDirectory;
    this.onEvent = onEvent;
    this.fetch = fetchImpl;
    this.encryptSecret = encryptSecret;
    this.decryptSecret = decryptSecret;
    this.toolRegistry = toolRegistry;
    this.historyFile = path.join(dataDirectory, 'conversation.json');
    this.providerFile = path.join(dataDirectory, 'provider.json');
    this.emotionFile = path.join(dataDirectory, 'emotions.json');
    this.emotions = new EmotionState();
    this.history = [];
    this.provider = { ...DEFAULT_PROVIDER };
    this.running = false;
    this.abortControllers = new Set();
  }

  async start() {
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    this.history = this.#readJson(this.historyFile, []);
    if (!Array.isArray(this.history)) this.history = [];
    this.history = this.history.filter(item =>
      item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string'
    ).slice(-80);
    const emotionData = this.#readJson(this.emotionFile, {});
    this.emotions = new EmotionState({ values: emotionData.values, updatedAt: emotionData.updatedAt || Date.now() });
    const saved = this.#readJson(this.providerFile, {});
    let apiKey = '';
    if (saved.apiKeyEncrypted && this.decryptSecret) {
      try { apiKey = this.decryptSecret(Buffer.from(saved.apiKeyEncrypted, 'base64')); }
      catch (error) { console.warn('[brain] Could not decrypt saved API key:', error.message); }
    }
    this.provider = this.#validateProvider({ ...DEFAULT_PROVIDER, ...saved, apiKey });
    this.running = true;
    this.onEvent({ type: 'emotion_state', emotionState: this.emotions.snapshot() });
  }

  async stop() {
    this.running = false;
    for (const controller of this.abortControllers) controller.abort();
    this.abortControllers.clear();
  }

  async dispose() { await this.stop(); }

  getProvider() {
    const { apiKey, ...safe } = this.provider;
    return { ...safe, hasApiKey: Boolean(apiKey) };
  }

  setProvider(input) {
    const nextInput = { ...input };
    if (nextInput.clearApiKey === true) nextInput.apiKey = '';
    else if (!nextInput.apiKey) nextInput.apiKey = this.provider.apiKey;
    delete nextInput.clearApiKey;
    const next = this.#validateProvider({ ...this.provider, ...nextInput });
    if (next.apiKey && !this.encryptSecret) throw new Error('Secure credential storage is unavailable; API key was not saved');
    const encryptedKey = next.apiKey ? this.encryptSecret(next.apiKey).toString('base64') : '';
    const persisted = { endpoint: next.endpoint, model: next.model, temperature: next.temperature, maxTokens: next.maxTokens, apiKeyEncrypted: encryptedKey };
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    const temp = this.providerFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(persisted, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, this.providerFile);
    this.provider = next;
    return this.getProvider();
  }

  getHistory() { return this.history.map(item => ({ ...item })); }

  clearHistory() {
    this.#persistHistory([]);
    this.history = [];
    return [];
  }

  async send(rawText) {
    if (!this.running) throw new Error('Brain service is not running');
    const text = String(rawText || '').trim();
    if (!text) throw new Error('Message is empty');
    if (text.length > 12000) throw new Error('Message exceeds 12000 characters');
    this.#appendHistory({ role: 'user', content: text, at: Date.now() });
    this.#emitEvent({ type: 'thinking', text });

    const local = this.#localIntent(text);
    if (local) {
      const answer = local.answer;
      this.#appendHistory({ role: 'assistant', content: answer, at: Date.now() });
      this.#emitEvent({ type: local.event || 'task_completed', result: answer });
      if (local.action) this.#emitEvent({ type: 'command', action: local.action, result: answer });
      return { answer, source: 'local', history: this.getHistory() };
    }

    try {
      const answer = await this.#askProvider();
      if (!this.running) throw new Error('Brain service stopped before the response completed');
      this.#appendHistory({ role: 'assistant', content: answer, at: Date.now() });
      this.#emitEvent({ type: 'task_completed', result: answer });
      return { answer, source: 'provider', history: this.getHistory() };
    } catch (error) {
      if (!this.running) throw error;
      const answer = this.#offlineFallback(error);
      this.#appendHistory({ role: 'assistant', content: answer, at: Date.now() });
      this.#emitEvent({ type: 'tool_failed', error: String(error.message || error) });
      return { answer, source: 'offline-fallback', history: this.getHistory() };
    }
  }

  async #askProvider() {
    if (!this.fetch) throw new Error('This runtime does not provide fetch');
    const controller = new AbortController();
    this.abortControllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (this.provider.apiKey) headers.Authorization = 'Bearer ' + this.provider.apiKey;
      const messages = [
        { role: 'system', content: 'You are Saeed, a helpful desktop AI assistant. Respond in the language used by the user. Use available tools when an app action or current app state is needed. Never claim an action was performed unless a connected tool confirms it.' },
        ...this.history.slice(-40).map(({ role, content }) => ({ role, content }))
      ];
      const tools = this.toolRegistry?.definitions?.() || [];
      let toolsEnabled = tools.length > 0;
      for (let round = 0; round < 5; round++) {
        const body = {
          model: this.provider.model,
          messages,
          temperature: this.provider.temperature,
          max_tokens: this.provider.maxTokens
        };
        if (toolsEnabled) { body.tools = tools; body.tool_choice = 'auto'; }
        const response = await this.fetch(this.provider.endpoint, {
          method: 'POST', headers, signal: controller.signal, body: JSON.stringify(body)
        });
        if (!response.ok) {
          if (toolsEnabled && response.status === 400) { toolsEnabled = false; continue; }
          throw new Error(`AI provider returned HTTP ${response.status}`);
        }
        const data = await response.json();
        const message = data?.choices?.[0]?.message;
        if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
          messages.push({ role: 'assistant', content: message.content || null, tool_calls: message.tool_calls });
          for (const call of message.tool_calls.slice(0, 4)) {
            const name = call?.function?.name;
            let args;
            try { args = JSON.parse(call?.function?.arguments || '{}'); }
            catch { args = null; }
            this.#emitEvent({ type: 'tool_started', tool: name || 'unknown' });
            let result;
            try {
              if (!this.toolRegistry) throw new Error('No tools are registered');
              if (!args) throw new Error('Tool arguments were not valid JSON');
              result = await this.toolRegistry.execute(name, args, { source: 'model' });
              this.#emitEvent({ type: 'tool_succeeded', tool: name, result });
            } catch (error) {
              result = { success: false, error: String(error.message || error) };
              this.#emitEvent({ type: 'tool_failed', tool: name, error: result.error });
            }
            messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
          }
          continue;
        }
        const answer = message?.content;
        if (typeof answer !== 'string' || !answer.trim()) throw new Error('AI provider returned an empty answer');
        return answer.trim().slice(0, 30000);
      }
      throw new Error('AI provider exceeded the tool-call limit');
    } finally {
      clearTimeout(timer);
      this.abortControllers.delete(controller);
    }
  }

  #localIntent(text) {
    const normalized = text.toLocaleLowerCase();
    if (/^(hi|hello|hey|مرحبا|أهلا|اهلا|السلام عليكم|صباح الخير|مساء الخير)[!.؟\s]*$/.test(normalized)) {
      return { answer: /[\u0600-\u06FF]/.test(text) ? 'أهلاً بك! أنا سعيد. يمكنني العمل محلياً للأوامر الأساسية، أو الاتصال بنموذج ذكاء اصطناعي عند إعداد مزوّد.' : 'Hello! I’m Saeed. I can handle basic local commands, or connect to an AI model when a provider is configured.', event: 'greeting' };
    }
    if (/^(show saeed|show character|أظهر سعيد|اظهر سعيد|أظهر الشخصية|اظهر الشخصية|اعرض سعيد)[.!؟\s]*$/.test(normalized)) {
      return { answer: /[\u0600-\u06FF]/.test(text) ? 'سأُظهر الشخصية الآن.' : 'Showing Saeed now.', action: 'show-character', event: 'wake' };
    }
    if (/^(hide saeed|hide character|اخف سعيد|أخف سعيد|أخف الشخصية|اخف الشخصية|إخفاء الشخصية|اخفاء الشخصية)[.!؟\s]*$/.test(normalized)) {
      return { answer: /[\u0600-\u06FF]/.test(text) ? 'سأخفي الشخصية الآن.' : 'Hiding Saeed now.', action: 'hide-character', event: 'sleep' };
    }
    if (/^(character settings|open character settings|إعدادات الشخصية|افتح إعدادات الشخصية|اعدادات الشخصية)[.!؟\s]*$/.test(normalized)) {
      return { answer: /[\u0600-\u06FF]/.test(text) ? 'سأفتح إعدادات الشخصية.' : 'Opening character settings.', action: 'open-character-settings' };
    }
    if (/^(help|مساعدة|ماذا تستطيع|ما الذي تستطيع فعله)[؟?!.\s]*$/.test(normalized)) {
      return { answer: 'أستطيع حالياً إدارة نافذة الشخصية وإعداداتها محلياً. للفهم العام والتخطيط تحتاج إلى تشغيل نموذج متوافق مع OpenAI API أو إعداد مزوّد سحابي من إعدادات العقل.' };
    }
    if (/^(clear history|امسح المحادثة|مسح المحادثة)[!.؟\s]*$/.test(normalized)) {
      this.clearHistory();
      return { answer: 'تم مسح سجل المحادثة المحفوظ.' };
    }
    return null;
  }

  #offlineFallback(error) {
    const isArabic = /[\u0600-\u06FF]/.test(this.history.at(-1)?.content || '');
    const details = String(error?.message || error);
    if (isArabic) {
      return `لم أتمكن من الوصول إلى نموذج الذكاء الاصطناعي. لم أدّعِ تنفيذ طلبك.\n\nالسبب: ${details}\n\nيمكنك تشغيل Ollama محلياً مع نموذج مثل qwen2.5:3b، أو ضبط عنوان وموديل ومفتاح مزوّد متوافق من إعدادات العقل.`;
    }
    return `I couldn't reach an AI model, and I have not claimed to perform your request.\n\nReason: ${details}\n\nYou can run Ollama locally with a model such as qwen2.5:3b, or configure an OpenAI-compatible endpoint, model, and API key in Brain Settings.`;
  }

  #emitEvent(event) {
    const emotionState = event.type === 'command'
      ? this.emotions.snapshot()
      : this.emotions.apply(event.type);
    this.#persistEmotions();
    this.onEvent({ ...event, emotionState });
  }

  #persistEmotions() {
    const state = this.emotions.snapshot();
    const temp = this.emotionFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    fs.renameSync(temp, this.emotionFile);
  }

  #validateProvider(input) {
    const endpoint = String(input.endpoint || DEFAULT_PROVIDER.endpoint).trim();
    const model = String(input.model || DEFAULT_PROVIDER.model).trim();
    let parsed;
    try { parsed = new URL(endpoint); } catch { throw new TypeError('Provider endpoint must be a valid URL'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('Provider endpoint must use HTTP or HTTPS');
    if (parsed.username || parsed.password) throw new TypeError('Do not embed credentials in the provider URL');
    if (!model || model.length > 200) throw new TypeError('Model name is required and must be under 200 characters');
    const apiKey = String(input.apiKey || '');
    if (apiKey.length > 2000) throw new TypeError('API key is too long');
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (apiKey && parsed.protocol !== 'https:' && !isLoopback) throw new TypeError('API keys require HTTPS except for local loopback providers');
    const temperature = Number(input.temperature ?? DEFAULT_PROVIDER.temperature);
    const maxTokens = Number(input.maxTokens ?? DEFAULT_PROVIDER.maxTokens);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) throw new TypeError('Temperature must be between 0 and 2');
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 8192) throw new TypeError('Max tokens must be between 1 and 8192');
    return { endpoint, model, apiKey, temperature, maxTokens };
  }

  #readJson(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') console.warn('[brain] Could not read state:', error.message);
      return fallback;
    }
  }

  #appendHistory(item) {
    const next = [...this.history, item].slice(-80);
    this.#persistHistory(next);
    this.history = next;
  }

  #persistHistory(history = this.history) {
    fs.mkdirSync(this.dataDirectory, { recursive: true });
    const temp = this.historyFile + '.' + process.pid + '.tmp';
    try {
      fs.writeFileSync(temp, JSON.stringify(history, null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, this.historyFile);
    } catch (error) {
      try { fs.rmSync(temp, { force: true }); } catch {}
      throw error;
    }
  }
}

module.exports = { BrainService, DEFAULT_PROVIDER };
