'use strict';

/**
 * The application's single lifecycle authority.
 * Services declare dependencies and their own resource cleanup; only this
 * controller decides when they start, stop, hide, show, or dispose.
 */
class LifecycleController {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.services = new Map();
    this.consumers = new Map();
    this.inFlight = new Map();
    this.shuttingDown = false;
  }

  register(name, service, { dependencies = [] } = {}) {
    if (this.services.has(name)) throw new Error(`Service already registered: ${name}`);
    if (!service || typeof service.start !== 'function' || typeof service.stop !== 'function') {
      throw new TypeError(`Service ${name} must implement start() and stop()`);
    }
    this.services.set(name, {
      name, service, dependencies: [...dependencies], state: 'stopped',
      startedAt: null, lastReason: null, error: null
    });
    this.consumers.set(name, new Set());
  }

  async acquire(name, consumer, reason = 'requested') {
    if (this.shuttingDown) throw new Error('Application is shutting down');
    const entry = this.#entry(name);
    if (!consumer) throw new TypeError('A named consumer is required');
    this.consumers.get(name).add(consumer);
    try {
      await this.#startWithDependencies(name, reason);
    } catch (error) {
      this.consumers.get(name).delete(consumer);
      throw error;
    }
    return this.snapshot(name);
  }

  async release(name, consumer, reason = 'consumer released') {
    this.#entry(name);
    this.consumers.get(name).delete(consumer);
    await this.#stopUnused(reason);
  }

  async #startWithDependencies(name, reason) {
    const entry = this.#entry(name);
    if (entry.state === 'running') return;
    if (this.inFlight.has(name)) return this.inFlight.get(name);
    const task = (async () => {
      entry.state = 'starting';
      entry.lastReason = reason;
      try {
        for (const dependency of entry.dependencies) {
          await this.#startWithDependencies(dependency, `dependency of ${name}`);
        }
        await entry.service.start({ reason, controller: this });
        entry.state = 'running';
        entry.startedAt = Date.now();
        entry.error = null;
        this.logger.info?.('[lifecycle] started', name, reason);
      } catch (error) {
        entry.state = 'failed';
        entry.error = String(error?.stack || error);
        this.logger.error?.('[lifecycle] start failed', name, error);
        throw error;
      } finally {
        this.inFlight.delete(name);
      }
    })();
    this.inFlight.set(name, task);
    return task;
  }

  async #stopUnused(reason) {
    const entries = [...this.services.values()].reverse();
    for (const entry of entries) {
      if (entry.state !== 'running' || this.consumers.get(entry.name).size > 0) continue;
      const hasActiveDependent = [...this.services.values()].some(other =>
        other.dependencies.includes(entry.name) &&
        (other.state === 'running' || other.state === 'starting') &&
        this.consumers.get(other.name).size > 0
      );
      if (hasActiveDependent) continue;
      entry.state = 'stopping';
      entry.lastReason = reason;
      try {
        await entry.service.stop({ reason, controller: this });
        entry.state = 'stopped';
        entry.startedAt = null;
        this.logger.info?.('[lifecycle] stopped', entry.name, reason);
      } catch (error) {
        entry.state = 'failed';
        entry.error = String(error?.stack || error);
        this.logger.error?.('[lifecycle] stop failed', entry.name, error);
      }
    }
  }

  async shutdown(reason = 'application quit') {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    for (const set of this.consumers.values()) set.clear();
    for (const entry of [...this.services.values()].reverse()) {
      if (entry.state !== 'running' && entry.state !== 'failed') continue;
      try {
        entry.state = 'stopping';
        await entry.service.stop({ reason, controller: this });
        await entry.service.dispose?.({ reason, controller: this });
        entry.state = 'stopped';
        entry.startedAt = null;
      } catch (error) {
        entry.state = 'failed';
        entry.error = String(error?.stack || error);
        this.logger.error?.('[lifecycle] shutdown failed', entry.name, error);
      }
    }
  }

  snapshot(name) {
    const e = this.#entry(name);
    return {
      name: e.name, state: e.state, consumers: [...this.consumers.get(name)],
      dependencies: [...e.dependencies], lastReason: e.lastReason,
      error: e.error, runningForMs: e.startedAt ? Date.now() - e.startedAt : 0
    };
  }

  diagnostics() {
    return [...this.services.keys()].map(name => this.snapshot(name));
  }

  #entry(name) {
    const entry = this.services.get(name);
    if (!entry) throw new Error(`Unknown service: ${name}`);
    return entry;
  }
}

module.exports = { LifecycleController };
