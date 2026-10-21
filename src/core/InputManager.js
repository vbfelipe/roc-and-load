/**
 * InputManager handles raw mouse input via the Pointer Lock API,
 * mouse button clicks, and keyboard movement state with zero GC overhead.
 */
export class InputManager {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.isLocked = false;

    // Keyboard state
    this.keys = {};
    this.justPressedKeys = {};

    // Mouse movement deltas
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Mouse buttons (0 = LMB, 2 = RMB)
    this.mouseButtons = {};

    // Reusable delta object to avoid GC
    this._deltaOutput = { x: 0, y: 0 };

    // Listeners and callbacks
    this.onLockCallbacks = [];
    this.onUnlockCallbacks = [];

    this._initListeners();
  }

  _initListeners() {
    // Keyboard events
    window.addEventListener('keydown', (e) => {
      const code = e.code || e.key;
      if (code && !this.keys[code]) {
        this.justPressedKeys[code] = true;
      }
      if (code) this.keys[code] = true;

      if (e.key) {
        const k = e.key.toLowerCase();
        if (!this.keys[k]) {
          this.justPressedKeys[k] = true;
        }
        this.keys[k] = true;
      }
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code || e.key;
      if (code) {
        this.keys[code] = false;
        this.justPressedKeys[code] = false;
      }
      if (e.key) {
        const k = e.key.toLowerCase();
        this.keys[k] = false;
        this.justPressedKeys[k] = false;
      }
    });

    // Mouse button events (strictly gated by pointer lock to prevent menu clicks bleeding through)
    window.addEventListener('mousedown', (e) => {
      if (!this.isLocked) return;
      this.mouseButtons[e.button] = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.isLocked) return;
      this.mouseButtons[e.button] = false;
    });

    // Prevent context menu when ADS (right click)
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Raw mouse movement
    window.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.mouseDeltaX += e.movementX || 0;
      this.mouseDeltaY += e.movementY || 0;
    });

    // Pointer Lock change events
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      this.isLocked = locked;

      if (locked) {
        this.onLockCallbacks.forEach(cb => cb());
      } else {
        // Clear inputs on unlock
        this.clearInputs();
        this.onUnlockCallbacks.forEach(cb => cb());
      }
    });

    document.addEventListener('pointerlockerror', (err) => {
      console.warn('Pointer Lock Error:', err);
    });
  }

  clearInputs() {
    this.keys = {};
    this.justPressedKeys = {};
    this.mouseButtons = {};
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  requestLock() {
    if (!this.isLocked) {
      this.canvas.requestPointerLock({
        unadjustedMovement: true // Raw high-precision mouse input if supported
      }).catch(() => {
        // Fallback for browsers that don't support unadjustedMovement option
        this.canvas.requestPointerLock();
      });
    }
  }

  exitLock() {
    if (this.isLocked) {
      document.exitPointerLock();
    }
  }

  onLock(callback) {
    this.onLockCallbacks.push(callback);
  }

  onUnlock(callback) {
    this.onUnlockCallbacks.push(callback);
  }

  isKeyDown(code) {
    return !!this.keys[code];
  }

  /**
   * Consumes a single key-press event. Returns true once per physical keydown.
   */
  consumeKeyJustPressed(code) {
    if (this.justPressedKeys[code]) {
      this.justPressedKeys[code] = false;
      return true;
    }
    return false;
  }

  isMouseDown(button) {
    return !!this.mouseButtons[button];
  }

  /**
   * Consumes accumulated mouse movement and resets internal deltas.
   * Returns a reused object to eliminate GC pressure.
   */
  consumeMouseDelta() {
    this._deltaOutput.x = this.mouseDeltaX;
    this._deltaOutput.y = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return this._deltaOutput;
  }
}
