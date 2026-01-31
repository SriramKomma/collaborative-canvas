# Real-Time Collaborative Drawing Canvas

Interview-grade multi-user drawing application: shared canvas, live stroke sync, global undo/redo, and user presence. Built with **raw HTML5 Canvas API** (no Fabric.js, Konva, etc.), **Node.js**, and **Socket.io**.

## Features

- **Drawing**: Brush & eraser, multiple colors, adjustable stroke width, smooth continuous paths (quadratic curves, no jagged lines).
- **Real-time sync**: Stroke segments broadcast while drawing; throttled/batched to avoid sending every pixel; handles latency.
- **User indicators**: Live cursor positions, unique color per user, online users list.
- **Global undo/redo**: Server is single source of truth; any user can undo/redo the last stroke; canvas re-renders by replaying stroke history.
- **Conflict handling**: Stroke-based history (no pixel mutation); multiple users in same area = multiple strokes; no merge conflicts.

## Installation

```bash
# From repo root (collaborative-canvas/)
npm run install-all
```

Or manually:

```bash
npm install
cd client && npm install
cd ../server && npm install
```

## Run

Start both server and client:

```bash
npm start
```

- **Frontend**: http://localhost:5173  
- **Backend**: http://localhost:3001 (or next free port if 3001 is in use)

## Testing with Multiple Users

1. Open http://localhost:5173 in one browser tab; enter a room (e.g. `global`) and a username; join.
2. Open the same URL in a **second** tab (or Incognito / another browser).
3. Join the same room with a different username.
4. Draw in one tab — strokes should appear in the other in real time while drawing (not only on stroke end).
5. Move the mouse to see live cursor positions and usernames.
6. Use **Undo** / **Redo** in either tab — they affect the shared canvas; one user can undo another’s stroke.
7. Use **Clear** to reset the canvas for everyone.

## Project Structure

```
collaborative-canvas/
├── client/
│   ├── index.html
│   ├── style.css
│   ├── src/
│   │   ├── canvas.ts      # CanvasManager: raw Canvas API, draw strokes/cursors
│   │   ├── App.tsx        # Main app: tools, pointer handlers, Socket.io
│   │   ├── main.tsx
│   │   └── types.ts
│   └── package.json
├── server/
│   ├── server.ts
│   ├── rooms.ts           # RoomManager, Room (users + state per room)
│   ├── state-manager.ts   # historyStack, redoStack, add/undo/redo
│   ├── socket-handlers.ts # WebSocket event handlers
│   ├── session-manager.ts
│   └── package.json
├── package.json
├── README.md
└── ARCHITECTURE.md        # Data flow, WebSocket protocol, undo/redo, scaling
```

## Documentation

- **ARCHITECTURE.md**: Data flow, WebSocket events and JSON formats, undo/redo strategy, performance, conflict handling, scaling to many users.

## Known Limitations

- **Window resize**: Resizing the window does not rescale existing drawing content (canvas internal size is set once). Refreshing re-fetches full history and redraws.
- **Clear**: Server clears state and broadcasts to room; all clients clear.
- **Latency**: Under high latency, stroke end may appear slightly delayed; live stream remains throttled and smooth.
- **No persistence**: Room state (history/redo) is in memory only; server restart wipes canvas.

## Time Spent

Approx. 3–4 hours (architecture, server state-manager, socket protocol, client scaling/throttling/smoothing, docs).
