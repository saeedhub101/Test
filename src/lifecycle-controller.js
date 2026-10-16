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
    for (const dependency of dependencies) {
      if (dependency === name) throw new Error(`Service cannot depend on itself: ${name}`);
      if (!this.services.has(dependency)) throw new Error(`Register dependency before ${name}: ${dependency}`);
    }
    this.services.set(name, {
      name, service, dependencies: [...new Set(dependencies)], state: 'stopped',
      startedAt: null, lastReason: null, error: null
    });
    this.consumers.set(name, new Set());
  }

  async acquire(name, consumer, reason = 'requested') {
    if (this.shuttingDown) throw new Error('Application is shutting down');
    const entry = this.#entry(name);
    this.#assertAcyclic(name);
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
        // A consumer can release while start() is awaiting I/O. Reconcile after
        // the transition so the just-started service cannot become an orphan.
        if (this.consumers.get(name).size === 0) {
          await this.#stopUnused('start completed without active consumers');
        }
      }
    })();
    this.inFlight.set(name, task);
    return task;
  }

  async #stopUnused(reason) {
    // Compute transitive demand from real consumers. Direct-dependent checks
    // are insufficient for chains such as Chat -> Brain -> HTTP client.
    const needed = new Set();
    const visit = name => {
      if (needed.has(name)) return;
      needed.add(name);
      const entry = this.#entry(name);
      for (const dependency of entry.dependencies) visit(dependency);
    };
    for (const [name, consumers] of this.consumers) {
      if (consumers.size > 0) visit(name);
    }

    const entries = [...this.services.values()].reverse();
    for (const entry of entries) {
      if (entry.state !== 'running' || needed.has(entry.name)) continue;
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

  #assertAcyclic(startName) {
    const visiting = new Set();
    const visited = new Set();
    const visit = name => {
      if (visiting.has(name)) throw new Error(`Lifecycle dependency cycle detected at: ${name}`);
      if (visited.has(name)) return;
      visiting.add(name);
      const entry = this.#entry(name);
      for (const dependency of entry.dependencies) visit(dependency);
      visiting.delete(name);
      visited.add(name);
    };
    visit(startName);
  }

  #entry(name) {
    const entry = this.services.get(name);
    if (!entry) throw new Error(`Unknown service: ${name}`);
    return entry;
  }
}

module.exports = { LifecycleController };
