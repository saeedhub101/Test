'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ToolRegistry } = require('../src/tool-registry');

test('validates arguments and only exposes registered tools', async () => {
  const registry = new ToolRegistry().register('set_size', {
    description: 'Set size',
    parameters: { type: 'object', properties: { size: { type: 'string', enum: ['small', 'large'] } }, required: ['size'], additionalProperties: false },
    handler: async ({ size }) => ({ size })
  });
  assert.deepEqual(await registry.execute('set_size', { size: 'large' }), { size: 'large' });
  await assert.rejects(() => registry.execute('set_size', { size: 'giant' }), /unsupported value/);
  await assert.rejects(() => registry.execute('set_size', { size: 'small', extra: true }), /Unexpected tool argument/);
  await assert.rejects(() => registry.execute('not_registered', {}), /not allowed/);
});

test('gates tools requiring confirmation', async () => {
  const registry = new ToolRegistry().register('dangerous', {
    description: 'Sensitive action',
    requiresConfirmation: true,
    handler: async () => ({ executed: true })
  });
  assert.equal((await registry.execute('dangerous', {})).requiresConfirmation, true);
  assert.deepEqual(await registry.execute('dangerous', {}, { confirmed: true }), { executed: true });
});
