export interface InputActions {
  moveLeft: () => void;
  moveRight: () => void;
  softDrop: () => void;
  hardDrop: () => void;
  rotateCW: () => void;
  rotateCCW: () => void;
  hold: () => void;
  pause?: () => void;
}

export class InputController {
  private actions: InputActions;
  private isEnabled: boolean = true;

  // DAS (Delayed Auto Shift) & ARR (Auto Repeat Rate) settings
  private das: number = 140; // ms before repeating
  private arr: number = 33;  // ms between repeats

  private leftTimer: number | null = null;
  private leftInterval: number | null = null;
  private rightTimer: number | null = null;
  private rightInterval: number | null = null;
  private downInterval: number | null = null;

  constructor(actions: InputActions) {
    this.actions = actions;
    this.setupListeners();
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.clearAll();
    }
  }

  public pressLeft() {
    if (!this.isEnabled) return;
    this.actions.moveLeft();
    this.startLeftShift();
  }

  public releaseLeft() {
    this.stopLeftShift();
  }

  public pressRight() {
    if (!this.isEnabled) return;
    this.actions.moveRight();
    this.startRightShift();
  }

  public releaseRight() {
    this.stopRightShift();
  }

  public pressDown() {
    if (!this.isEnabled) return;
    this.actions.softDrop();
    this.startSoftDrop();
  }

  public releaseDown() {
    this.stopSoftDrop();
  }

  public pressRotate() {
    if (!this.isEnabled) return;
    this.actions.rotateCW();
  }

  public pressHardDrop() {
    if (!this.isEnabled) return;
    this.actions.hardDrop();
  }

  public pressHold() {
    if (!this.isEnabled) return;
    this.actions.hold();
  }

  public destroy() {
    this.clearAll();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (!this.isEnabled) return;

    // Prevent default scrolling on arrow keys and space
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
      e.preventDefault();
    }

    if (e.repeat) return; // Managed by custom DAS/ARR

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.actions.moveLeft();
        this.startLeftShift();
        break;

      case 'ArrowRight':
      case 'KeyD':
        this.actions.moveRight();
        this.startRightShift();
        break;

      case 'ArrowDown':
      case 'KeyS':
        this.actions.softDrop();
        this.startSoftDrop();
        break;

      case 'Space':
        this.actions.hardDrop();
        break;

      case 'ArrowUp':
      case 'KeyX':
      case 'KeyW':
        this.actions.rotateCW();
        break;

      case 'KeyZ':
      case 'ControlLeft':
      case 'ControlRight':
        this.actions.rotateCCW();
        break;

      case 'KeyC':
      case 'ShiftLeft':
      case 'ShiftRight':
        this.actions.hold();
        break;

      case 'Escape':
      case 'KeyP':
        this.actions.pause?.();
        break;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.stopLeftShift();
        break;

      case 'ArrowRight':
      case 'KeyD':
        this.stopRightShift();
        break;

      case 'ArrowDown':
      case 'KeyS':
        this.stopSoftDrop();
        break;
    }
  };

  private setupListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private startLeftShift() {
    this.stopLeftShift();
    this.stopRightShift(); // Mutual cancellation
    this.leftTimer = window.setTimeout(() => {
      this.leftInterval = window.setInterval(() => {
        if (this.isEnabled) this.actions.moveLeft();
      }, this.arr);
    }, this.das);
  }

  private stopLeftShift() {
    if (this.leftTimer !== null) {
      clearTimeout(this.leftTimer);
      this.leftTimer = null;
    }
    if (this.leftInterval !== null) {
      clearInterval(this.leftInterval);
      this.leftInterval = null;
    }
  }

  private startRightShift() {
    this.stopRightShift();
    this.stopLeftShift();
    this.rightTimer = window.setTimeout(() => {
      this.rightInterval = window.setInterval(() => {
        if (this.isEnabled) this.actions.moveRight();
      }, this.arr);
    }, this.das);
  }

  private stopRightShift() {
    if (this.rightTimer !== null) {
      clearTimeout(this.rightTimer);
      this.rightTimer = null;
    }
    if (this.rightInterval !== null) {
      clearInterval(this.rightInterval);
      this.rightInterval = null;
    }
  }

  private startSoftDrop() {
    this.stopSoftDrop();
    this.downInterval = window.setInterval(() => {
      if (this.isEnabled) this.actions.softDrop();
    }, 45);
  }

  private stopSoftDrop() {
    if (this.downInterval !== null) {
      clearInterval(this.downInterval);
      this.downInterval = null;
    }
  }

  public clearAll() {
    this.stopLeftShift();
    this.stopRightShift();
    this.stopSoftDrop();
  }
}
