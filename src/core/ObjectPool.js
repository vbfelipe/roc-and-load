/**
 * Generic Zero-GC Object Pool.
 * Pre-allocates objects at startup to prevent garbage collection stutters during gameplay.
 */
export class ObjectPool {
  /**
   * @param {Function} factoryFn Function that returns a newly instantiated object
   * @param {number} initialSize Total objects to pre-allocate
   * @param {Object} options Optional callbacks: onAcquire, onRelease
   */
  constructor(factoryFn, initialSize = 50, options = {}) {
    this.factoryFn = factoryFn;
    this.options = options;

    this.pool = [];
    this.active = [];

    // Pre-allocate all items upfront
    for (let i = 0; i < initialSize; i++) {
      const item = this.factoryFn(i);
      item._poolIndex = i;
      item._poolActive = false;

      // Automatically hide THREE.Object3D items if applicable
      if (item.visible !== undefined) {
        item.visible = false;
      }

      this.pool.push(item);
    }
  }

  /**
   * Acquires an available item from the pool.
   * If pool is exhausted, reclaims the oldest active item (ring-buffer style).
   */
  acquire() {
    let item;
    if (this.pool.length > 0) {
      item = this.pool.pop();
    } else {
      // Reclaim oldest active item
      item = this.active.shift();
      if (this.options.onRelease) {
        this.options.onRelease(item);
      }
    }

    item._poolActive = true;
    this.active.push(item);

    if (item.visible !== undefined) {
      item.visible = true;
    }

    if (this.options.onAcquire) {
      this.options.onAcquire(item);
    }

    return item;
  }

  /**
   * Releases an active item back to the pool.
   */
  release(item) {
    if (!item._poolActive) return;

    const idx = this.active.indexOf(item);
    if (idx !== -1) {
      this.active.splice(idx, 1);
    }

    item._poolActive = false;

    if (item.visible !== undefined) {
      item.visible = false;
    }

    if (this.options.onRelease) {
      this.options.onRelease(item);
    }

    this.pool.push(item);
  }

  /**
   * Releases all currently active objects back to the available pool.
   */
  releaseAll() {
    while (this.active.length > 0) {
      const item = this.active.pop();
      item._poolActive = false;
      if (item.visible !== undefined) {
        item.visible = false;
      }
      if (this.options.onRelease) {
        this.options.onRelease(item);
      }
      this.pool.push(item);
    }
  }

  /**
   * Iterates through active items without allocating arrays.
   */
  forEachActive(fn) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      fn(this.active[i], i);
    }
  }

  get activeCount() {
    return this.active.length;
  }

  get availableCount() {
    return this.pool.length;
  }
}
