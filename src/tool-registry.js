'use strict';

class ToolRegistry {
  constructor() { this.tools = new Map(); }

  register(name, { description, parameters = { type: 'object', properties: {}, additionalProperties: false }, handler, requiresConfirmation = false }) {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(name)) throw new TypeError('Invalid tool name');
    if (this.tools.has(name)) throw new Error('Tool already registered: ' + name);
    if (typeof handler !== 'function') throw new TypeError('Tool handler is required');
    this.tools.set(name, { name, description: String(description || '').slice(0, 1000), parameters, handler, requiresConfirmation });
    return this;
  }

  definitions() {
    return [...this.tools.values()].map(tool => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters }
    }));
  }

  list() {
    return [...this.tools.values()].map(({ name, description, requiresConfirmation }) => ({ name, description, requiresConfirmation }));
  }

  async execute(name, args = {}, context = {}) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error('Tool is not allowed: ' + name);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('Tool arguments must be an object');
    const properties = tool.parameters.properties || {};
    for (const key of Object.keys(args)) {
      if (!Object.hasOwn(properties, key) && tool.parameters.additionalProperties !== true) {
        throw new TypeError('Unexpected tool argument: ' + key);
      }
    }
    for (const key of tool.parameters.required || []) {
      if (!Object.hasOwn(args, key)) throw new TypeError('Missing required tool argument: ' + key);
    }
    for (const [key, schema] of Object.entries(properties)) {
      if (!Object.hasOwn(args, key)) continue;
      const value = args[key];
      if (schema.type === 'string' && typeof value !== 'string') throw new TypeError(key + ' must be a string');
      if (schema.type === 'boolean' && typeof value !== 'boolean') throw new TypeError(key + ' must be boolean');
      if (schema.type === 'number' && !Number.isFinite(value)) throw new TypeError(key + ' must be a number');
      if (schema.enum && !schema.enum.includes(value)) throw new TypeError(key + ' has an unsupported value');
    }
    if (tool.requiresConfirmation && !context.confirmed) {
      return { requiresConfirmation: true, tool: name, arguments: args };
    }
    return tool.handler(args, context);
  }
}

module.exports = { ToolRegistry };
