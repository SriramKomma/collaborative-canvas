# Collaborative Canvas — Architecture

## Overview

Real-time multi-user drawing with a **stroke-based** model. The server is the **single source of truth** for canvas state (history + redo). Clients send stroke segments while drawing; the server broadcasts to peers and persists completed strokes. Late joiners receive full history.

---

## Data Flow Diagram (Textual)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT A (Browser)                               │
│  ┌─────────────┐    pointer events     ┌──────────────┐   stroke:start/move/end  │
│  │ HTML Canvas │ ───────────────────►  │ canvas.js    │ ────────────────────────┼──┐
│  │ (main+temp) │   (throttled/batched) │ CanvasManager│   cursor:update          │  │
│  └─────────────┘                       └──────────────┘                          │  │
│         ▲                                      │                                │  │
│         │ redraw (replay history + active)     │                                │  │
│         │                                      ▼                                │  │
│  ┌─────────────┐   state:sync / action-added   ┌──────────────┐                 │  │
│  │  main.js    │ ◄────────────────────────────│ websocket.js │ ◄───────────────┼──┤
│  │ (React app) │   undo / redo                 │ Socket.io    │                  │  │
│  └─────────────┘                               └──────────────┘                  │  │
└──────────────────────────────────────────────────────────────────────────────────┘  │
                                                                                      │
                                        WebSocket (Socket.io)                         │
                                                                                      │
┌──────────────────────────────────────────────────────────────────────────────────┐  │
│                              SERVER (Node.js)                                     │  │
│  ┌─────────────┐     join / stroke / cursor      ┌──────────────────┐            │  │
│  │ server.js   │ ◄──────────────────────────────►│ socket-handlers   │            │  │
│  │ Express+IO  │     state:sync (init + undo)     │ (rooms, sessions) │            │  │
│  └─────────────┘                                  └────────┬─────────┘            │  │
│                                                           │                       │  │
│                                                           ▼                       │  │
│  ┌─────────────┐     getHistory / add / undo / redo       ┌──────────────────┐   │  │
│  │ rooms.js    │ ◄───────────────────────────────────────►│ state-manager.js  │   │  │
│  │ RoomManager │     (per-room state)                     │ historyStack      │   │  │
│  └─────────────┘                                          │ redoStack         │   │  │
│                                                            └──────────────────┘   │  │
└────────────────────────────────────────────────────────────────────────────────────┘  │
                                                                                        │
◄────────────────────────────────── Same flow for Client B, C, ... ─────────────────────┘
```

- **Client**: Pointer → local canvas + WebSocket (stroke segments + cursor). Incoming: full state on join, incremental stroke/undo/redo/cursor.
- **Server**: Receives stroke/cursor/undo/redo; updates **state-manager** (history/redo); broadcasts to room.

---

## Stroke Model

Every drawing is represented as a **stroke object** (no pixel mutation):

```ts
interface Point { x: number; y: number; }

interface Stroke {
  id: string;       // UUID
  userId: string;   // owner
  tool: "brush" | "eraser";
  color: string;    // hex
  width: number;    // px
  points: Point[];  // ordered path
}
```

- **Brush / Eraser**: One stroke = one path (many points). Server stores stroke only on **stroke:end**.
- **Conflict handling**: No pixel-level conflicts. Multiple users drawing in the same area = multiple strokes; order is determined by server receipt (append to history). No merge logic needed.

---

## WebSocket Protocol

Transport: **Socket.io**. Event names and JSON payloads below.

### Connection & room

| Event (client → server) | Payload (JSON) | Description |
|-------------------------|----------------|-------------|
| (query params) | `userId`, `username` | Sent on connect; used for session. |
| `join-room` | `{ "roomId": string }` | Join a room; server sends `init-room` then broadcasts `user-joined`. |

| Event (server → client) | Payload (JSON) | Description |
|-------------------------|----------------|-------------|
| `init-room` | `{ "roomId": string, "users": User[], "history": Stroke[] }` | Full state for late join / initial load. |
| `user-joined` | `User` | New user in room. |
| `user-left` | `{ "userId": string }` | User left room. |
| `state:sync` | `{ "history": Stroke[] }` | Optional; full history (e.g. after undo if we ever sync full state). |

### Drawing (live segments)

| Event (client → server) | Payload (JSON) | Description |
|-------------------------|----------------|-------------|
| `stroke:start` (or `draw-start`) | `{ "point": Point, "tool": string, "color": string, "width": number }` | Begin a new stroke. |
| `stroke:move` (or `draw-stream`) | `{ "points": Point[] }` | Append points (throttled/batched). |
| `stroke:end` (or `draw-end`) | `Stroke` (full stroke with `id`, `userId`, `points[]`, etc.) | Commit stroke; server adds to history. |

| Event (server → client) | Payload (JSON) | Description |
|-------------------------|----------------|-------------|
| `draw-start` | `{ "userId", "point", "tool", "color", "width" }` | Someone started drawing. |
| `draw-stream` | `{ "userId", "points" }` | Live segment for in-progress stroke. |
| `action-added` | `Stroke` | New stroke committed (or redo); client appends to local history and redraws. |

### Cursor

| Event (client → server) | Payload (JSON) |
|------------------------|----------------|
| `cursor:update` (or `cursor-move`) | `{ "x": number, "y": number }` |

| Event (server → client) | Payload (JSON) |
|-------------------------|----------------|
| `cursor-update` | `{ "userId": string, "pos": Point }` |

### Undo / Redo (global)

| Event (client → server) | Payload | Description |
|-------------------------|--------|-------------|
| `undo` | (none) | Server pops last stroke from history, pushes to redo stack, broadcasts. |
| `redo` | (none) | Server pops from redo stack, pushes to history, broadcasts. |

| Event (server → client) | Payload (JSON) | Description |
|-------------------------|----------------|-------------|
| `undo-action` | `actionId: string` | Remove stroke with this id from local history; redraw. |
| `action-added` | `Stroke` | Re-applied stroke (redo); append and redraw. |

### Clear (global)

| Event (client → server) | Payload | Description |
|-------------------------|--------|-------------|
| `clear` | (none) | Server clears history and redo; broadcasts `clear`. |

| Event (server → client) | Payload | Description |
|-------------------------|--------|-------------|
| `clear` | (none) | Client clears local history and canvas. |

---

## Undo / Redo Strategy

- **Server holds**: `historyStack: Stroke[]`, `redoStack: Stroke[]`.
- **Undo**: Pop last stroke from `historyStack`, push to `redoStack`; broadcast `undo-action(strokeId)`. Clients remove that stroke from local history and **replay all remaining strokes** (deterministic redraw).
- **Redo**: Pop from `redoStack`, push to `historyStack`; broadcast `action-added(stroke)`. Clients append and redraw.
- **New stroke**: Push to `historyStack`, clear `redoStack`; broadcast `action-added(stroke)`.
- **Deterministic rendering**: Canvas is always `clearRect` then `stroke1, stroke2, ...` in order. No divergence.

---

## Late-Joining Users

- On `join-room`, server sends `init-room` with **full** `history: Stroke[]` and `users`.
- Client replaces local history with this list and redraws once. No need for a separate `state:sync` unless we add it for recovery.

---

## Performance Optimizations

1. **Dual canvas**: Main (committed strokes) + temp (live strokes + cursors). Only temp is cleared every frame; main is redrawn only when history or undo/redo changes.
2. **Throttle / batch**: Client sends `stroke:move` at most every ~16–32 ms or batches points; avoids sending every pixel.
3. **requestAnimationFrame**: Single loop for drawing temp layer + cursors; no redraw on every pointer move.
4. **Coordinate scaling**: Pointer coordinates scaled by `canvas.width / rect.width` and `canvas.height / rect.height` so that CSS-sized canvas matches internal resolution (no jagged or stretched lines).
5. **Smooth paths**: `lineCap: "round"`, `lineJoin: "round"`; optional smoothing (e.g. distance-based sampling or quadratic curves) to reduce jaggedness without sending excessive points.

---

## Conflict Handling Logic

- **Model**: Stroke-based, append-only history. No pixel or region locks.
- **Same area**: Multiple users drawing in the same region simply produce multiple strokes; order = order of `stroke:end` at server. No merge or OT required.
- **Undo**: Any user can undo the last stroke (including another user’s). Server is authoritative; clients apply `undo-action` by id.

---

## File Roles

| File | Role |
|------|------|
| **server/server.js** | Express + Socket.io; mounts socket-handlers. |
| **server/rooms.js** | RoomManager; Room = users + state-manager per room. |
| **server/state-manager.js** | Per-room: historyStack, redoStack; add, undo, redo, getHistory. |
| **server/socket-handlers.ts** | Connection, join-room, stroke:start/move/end, cursor, undo, redo; uses rooms + state-manager. |
| **client/canvas.js** | CanvasManager: draw stroke, drawHistory, drawActive, drawCursors; raw Canvas API. |
| **client/websocket.js** | Socket.io client; emit/listen for protocol events. |
| **client/main.js (or App)** | React app: tools, pointer handlers, throttle/batch, coordinate scaling; wires canvas + websocket. |

---

## Scaling to Many Users (e.g. 1000)

- **Rooms**: Shard by room; each room has its own history/redo. No cross-room state.
- **Broadcast**: Use Socket.io room broadcast (one room = one channel). For 1000 users in one room, consider:
  - **Stroke streaming**: Already batched/throttled; acceptable.
  - **Cursors**: Throttle cursor updates (e.g. 10–15 fps) and/or send only when position changes above a threshold; consider spatial hashing and sending only to “nearby” users later.
  - **History**: Sending full history on join is O(strokes); for huge canvases, consider pagination or chunked sync.
- **Server**: Horizontal scaling with Redis adapter for Socket.io so rooms span instances; state-manager would need to live in Redis or a DB for multi-instance consistency.
