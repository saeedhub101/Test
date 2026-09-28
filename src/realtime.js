const WebSocket = require("ws");

class OpenAIRealtime {
  constructor(callbacks = {}) {
    this.ws = null;
    this.key = "";
    this.model = "gpt-realtime-2.1";
    this.voice = "marin";
    this.instructions = "You are Saeed, a helpful desktop AI companion. Speak naturally, briefly and directly. Maintain conversational context. You can inspect the computer and use tools to complete the user's request. Never claim a computer action succeeded unless the tool result confirms it. Follow the permission policy configured in Saeed Settings and ask only when a category is explicitly set to Always Ask. If interrupted, stop speaking immediately and listen to the user.";
    this.tools = [];
    this.callbacks = callbacks;
    this.stopped = true;
    this.retryTimer = null;
    this.retryMs = 3000;
  }

  start(key, options = {}) {
    this.key = String(key || "");
    this.model = options.model || "gpt-realtime-2.1";
    this.voice = options.voice || "marin";
    this.instructions = options.instructions || this.instructions;
    this.tools = Array.isArray(options.tools) ? options.tools : [];
    this.stopped = false;
    this.clearRetry();
    this.connect();
  }

  stop() {
    this.stopped = true;
    this.clearRetry();
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch {}
    this.callbacks.state?.("disconnected");
  }

  appendAudio(base64) {
    if (this.ws?.readyState === WebSocket.OPEN && base64) {
      this.send({type:"input_audio_buffer.append", audio:base64});
    }
  }

  text(text) {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.send({
      type:"conversation.item.create",
      item:{type:"message", role:"user", content:[{type:"input_text", text:String(text)}]}
    });
    this.send({type:"response.create"});
    return true;
  }

  toolResult(callId, output) {
    if (this.ws?.readyState !== WebSocket.OPEN || !callId) return false;
    this.send({
      type:"conversation.item.create",
      item:{
        type:"function_call_output",
        call_id:String(callId),
        output:typeof output==="string"?output:JSON.stringify(output)
      }
    });
    this.send({type:"response.create"});
    return true;
  }

  cancel() {
    if (this.ws?.readyState === WebSocket.OPEN) this.send({type:"response.cancel"});
  }

  connect() {
    if (this.stopped || !this.key) return;
    this.callbacks.state?.("connecting");
    let ws;
    try {
      ws = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=" + encodeURIComponent(this.model),
        {headers:{Authorization:"Bearer " + this.key}}
      );
    } catch (e) {
      this.fail(String(e?.message || e));
      return;
    }
    this.ws = ws;

    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.retryMs = 3000;
      this.send({
        type:"session.update",
        session:{
          type:"realtime",
          model:this.model,
          output_modalities:["audio"],
          audio:{
            input:{
              format:{type:"audio/pcm", rate:24000},
              transcription:{model:"gpt-4o-mini-transcribe"},
              turn_detection:{
                type:"semantic_vad",
                eagerness:"high",
                interrupt_response:true,
                create_response:true
              }
            },
            output:{format:{type:"audio/pcm", rate:24000}, voice:this.voice}
          },
          tools:this.tools,
          tool_choice:"auto",
          instructions:this.instructions
        }
      });
      this.callbacks.state?.("connected");
    });

    ws.on("message", raw => {
      try { this.callbacks.event?.(JSON.parse(raw.toString())); }
      catch (e) { this.callbacks.state?.("error", "Invalid Realtime event received."); }
    });

    ws.on("error", e => this.fail(String(e?.message || e)));
    ws.on("close", () => {
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) {
        this.callbacks.state?.("disconnected", "Realtime connection closed");
        this.scheduleRetry();
      }
    });
  }

  send(value) {
    try {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(value));
    } catch (e) { this.fail(String(e?.message || e)); }
  }

  fail(message) {
    this.callbacks.state?.("error", message);
    if (!this.stopped) this.scheduleRetry();
  }

  scheduleRetry() {
    if (this.retryTimer || this.stopped) return;
    const delay = this.retryMs;
    this.retryMs = Math.min(15000, this.retryMs * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }

  clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

module.exports = {OpenAIRealtime};
