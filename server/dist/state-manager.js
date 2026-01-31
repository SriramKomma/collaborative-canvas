"use strict";
/**
 * StateManager — Single source of truth for canvas state per room.
 * Holds historyStack (committed strokes) and redoStack.
 * Used by Room; all undo/redo and stroke commits go through this.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
class StateManager {
    constructor() {
        /** Committed strokes in order; canvas = replay this list. */
        this.historyStack = [];
        /** Strokes undone; redo pushes back to historyStack. */
        this.redoStack = [];
    }
    addStroke(stroke) {
        this.historyStack.push(stroke);
        this.redoStack = []; // Clear redo on new action
    }
    /** Remove last stroke from history, push to redo. Returns removed stroke id. */
    undo() {
        const stroke = this.historyStack.pop();
        if (stroke) {
            this.redoStack.push(stroke);
        }
        return stroke;
    }
    /** Pop from redo, push to history. Returns re-applied stroke. */
    redo() {
        const stroke = this.redoStack.pop();
        if (stroke) {
            this.historyStack.push(stroke);
        }
        return stroke;
    }
    getHistory() {
        return this.historyStack;
    }
    clear() {
        this.historyStack = [];
        this.redoStack = [];
    }
}
exports.StateManager = StateManager;
