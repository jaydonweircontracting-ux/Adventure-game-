/**
 * BUILD 835 foundation: bounded undo/redo for editor commands.
 * Commands must describe real world mutations; this module intentionally does
 * not pretend to mutate application state by itself.
 */
export interface ReversibleWorldCommand {
  readonly label: string;
  readonly affectedIds?: readonly string[];
  /** Apply the change to the authoritative state. */
  apply(): void;
  /** Restore the exact state that existed before apply(). */
  revert(): void;
}

export interface WorldHistoryOptions {
  limit?: number;
  onChange?: (state: WorldHistoryState) => void;
}

export interface WorldHistoryState {
  undoCount: number;
  redoCount: number;
  canUndo: boolean;
  canRedo: boolean;
  lastLabel: string | null;
}

/**
 * Command history with atomic stack movement: a command is moved between stacks
 * only after apply/revert succeeds. Callers should create commands with captured
 * before/after values rather than closures over mutable, changing selections.
 */
export class WorldDevHistory {
  private undoStack: ReversibleWorldCommand[] = [];
  private redoStack: ReversibleWorldCommand[] = [];
  private readonly limit: number;
  private readonly onChange?: (state: WorldHistoryState) => void;

  constructor(options: WorldHistoryOptions = {}) {
    this.limit = Math.max(1, Math.min(2_000, Math.floor(options.limit ?? 200)));
    this.onChange = options.onChange;
  }

  execute(command: ReversibleWorldCommand): void {
    command.apply();
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.redoStack = [];
    this.emit();
  }

  undo(): boolean {
    const command = this.undoStack[this.undoStack.length - 1];
    if (!command) return false;
    command.revert();
    this.undoStack.pop();
    this.redoStack.push(command);
    this.emit();
    return true;
  }

  redo(): boolean {
    const command = this.redoStack[this.redoStack.length - 1];
    if (!command) return false;
    command.apply();
    this.redoStack.pop();
    this.undoStack.push(command);
    this.emit();
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.emit();
  }

  getState(): WorldHistoryState {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      lastLabel: this.undoStack[this.undoStack.length - 1]?.label ?? null,
    };
  }

  private emit(): void {
    this.onChange?.(this.getState());
  }
}
