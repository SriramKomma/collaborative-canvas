/**
 * StateManager — Single source of truth for canvas state per room.
 * Holds historyStack (committed strokes) and redoStack.
 * Used by Room; all undo/redo and stroke commits go through this.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  userId: string;
  tool: "brush" | "eraser" | "line" | "rect" | "circle" | "fill" | "arrow" | "star" | "triangle" | "text";
  color: string;
  width: number;
  points: Point[];
  text?: string;
}

export class StateManager {
  /** Committed strokes in order; canvas = replay this list. */
  private historyStack: Stroke[] = [];
  /** Strokes undone; redo pushes back to historyStack. */
  private redoStack: Stroke[] = [];

  addStroke(stroke: Stroke): void {
    this.historyStack.push(stroke);
    this.redoStack = []; // Clear redo on new action
  }

  /** Remove last stroke from history, push to redo. Returns removed stroke id. */
  undo(): Stroke | undefined {
    const stroke = this.historyStack.pop();
    if (stroke) {
      this.redoStack.push(stroke);
    }
    return stroke;
  }

  /** Pop from redo, push to history. Returns re-applied stroke. */
  redo(): Stroke | undefined {
    const stroke = this.redoStack.pop();
    if (stroke) {
      this.historyStack.push(stroke);
    }
    return stroke;
  }

  getHistory(): Stroke[] {
    return this.historyStack;
  }

  /** Replace entire history (e.g. load from file). */
  replaceHistory(strokes: Stroke[]): void {
    this.historyStack = Array.isArray(strokes) ? [...strokes] : [];
    this.redoStack = [];
  }

  clear(): void {
    this.historyStack = [];
    this.redoStack = [];
  }
}
