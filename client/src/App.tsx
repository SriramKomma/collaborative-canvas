import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";
import { CanvasManager, type Theme } from "./canvas";
import type { DrawAction, Tool, User } from "./types";
import { ToolIcon } from "./components/ToolIcon";
import { Lobby } from "./components/Lobby";
import "./App.css";

const IS_PROD = import.meta.env.PROD;

const SERVERS = IS_PROD
  ? ["https://collaborative-canvas-iwff.onrender.com"]
  : Array.from(
      { length: 10 },
      (_, i) => `http://localhost:${3001 + i}`
    );

const PRESET_COLORS = [
  "#ffffff",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#38bdf8",
  "#2563eb",
  "#a855f7",
  "#ec4899",
  "#000000",
];

const STROKE_SIZES = [2, 4, 6, 10, 16];

const TWO_POINT_TOOLS: Tool[] = ["line", "rect", "circle", "arrow", "star", "triangle"];

export default function App() {
  const [room, setRoom] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [color, setColor] = useState(PRESET_COLORS[9]); // black
  const [widthIndex, setWidthIndex] = useState(1); // second dot (medium)
  const [users, setUsers] = useState<User[]>([]);
  const [currentUsername, setCurrentUsername] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [onlinePanelOpen, setOnlinePanelOpen] = useState(false);
  const onlinePanelRef = useRef<HTMLDivElement>(null);
  const width = STROKE_SIZES[widthIndex];

  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("canvas-theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {}
    return "dark";
  });

  const [fps, setFps] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const lastFrameTime = useRef(0);
  const frameCount = useRef(0);

  // Apply theme to document (canvas manager gets theme when effect runs)
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("canvas-theme", next);
      } catch {}
      return next;
    });
  };

  // Close online panel when clicking outside
  useEffect(() => {
    if (!onlinePanelOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (onlinePanelRef.current && !onlinePanelRef.current.contains(e.target as Node)) {
        setOnlinePanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onlinePanelOpen]);

  const socket = useRef<Socket | null>(null);
  const history = useRef<DrawAction[]>([]);
  const active = useRef<Map<string, DrawAction>>(new Map());
  const drawing = useRef(false);
  const points = useRef<{ x: number; y: number }[]>([]);
  const myId = useRef(uuid());
  const committedIds = useRef<Set<string>>(new Set());
  const lastStreamTime = useRef(0);
  const pendingStreamPoints = useRef<{ x: number; y: number }[]>([]);
  const STREAM_THROTTLE_MS = 32; // ~30fps for stroke segments; avoid sending every pixel

  const mainRef = useRef<HTMLCanvasElement>(null);
  const tempRef = useRef<HTMLCanvasElement>(null);
  const canvasSurfaceRef = useRef<HTMLDivElement>(null);
  const manager = useRef<CanvasManager | null>(null);

  // ---------- JOIN ----------
  const join = (roomId: string, username: string, options?: { createNew?: boolean }) => {
    const createNew = options?.createNew ?? false;
    if (!roomId || !username) return;
    setRoom(roomId);
    setCurrentUsername(username);

    let idx = 0;
    const connect = () => {
      const s = io(SERVERS[idx], {
        query: { userId: myId.current, username },
        autoConnect: true,
      });
      socket.current = s;
      if (createNew) s.emit("create-room", roomId);
      s.emit("join-room", roomId);
      s.on("connect", () => {
        setIsConnected(true);
        const ping = () => {
          const sent = Date.now();
          s.emit("ping", sent);
        };
        ping();
        const pingInterval = setInterval(ping, 2000);
        s.on("pong", ({ sent }: { sent: number }) => {
          setLatencyMs(Date.now() - sent);
        });
        s.on("disconnect", () => clearInterval(pingInterval));
      });
      s.on("disconnect", () => setIsConnected(false));
      s.once("connect_error", () => {
        setIsConnected(false);
        if (idx < SERVERS.length - 1) {
          s.disconnect();
          idx += 1;
          connect();
        }
      });
      s.on("init-room", ({ users, history: h }) => {
        setUsers(users);
        history.current = h;
        manager.current?.drawHistory(h);
      });
      s.on("draw-start", ({ userId, point, tool, color, width }) => {
        active.current.set(userId, {
          id: "tmp",
          userId,
          tool,
          color,
          width,
          points: [point],
        });
        setUsers((u) =>
          u.map((x) => (x.id === userId ? { ...x, isDrawing: true } : x)),
        );
      });
      s.on("draw-stream", ({ userId, points }) => {
        const a = active.current.get(userId);
        if (!a) return;
        if (TWO_POINT_TOOLS.includes(a.tool)) {
          a.points[1] = points[0];
        } else {
          a.points.push(...points);
        }
      });
      s.on("action-added", (a: DrawAction) => {
        if (!committedIds.current.has(a.id)) {
          history.current.push(a);
        }
        manager.current?.drawHistory(history.current);
        setUsers((u) =>
          u.map((x) => (x.id === a.userId ? { ...x, isDrawing: false } : x)),
        );
      });
      s.on("undo-action", (payload: string | { actionId?: string }) => {
        const actionId = typeof payload === "string" ? payload : payload?.actionId;
        if (actionId) {
          history.current = history.current.filter((x) => x.id !== actionId);
          committedIds.current.delete(actionId); // allow redo to re-add this stroke
          manager.current?.drawHistory(history.current);
        }
      });
      s.on("cursor-update", ({ userId, pos }) => {
        setUsers((u) =>
          u.map((x) => (x.id === userId ? { ...x, cursor: pos } : x)),
        );
      });
      s.on("user-drawing", ({ userId }) => {
        setUsers((u) =>
          u.map((x) => (x.id === userId ? { ...x, isDrawing: true } : x)),
        );
      });
      s.on("user-drawing-end", ({ userId }) => {
        setUsers((u) =>
          u.map((x) => (x.id === userId ? { ...x, isDrawing: false } : x)),
        );
      });
      s.on("user-joined", (user: User) => {
        setUsers((u) => {
          const exists = u.find((x) => x.id === user.id);
          return exists
            ? u.map((x) => (x.id === user.id ? user : x))
            : [...u, user];
        });
      });
      s.on("user-left", (userId: string) => {
        setUsers((u) => u.filter((x) => x.id !== userId));
      });
      s.on("clear", () => {
        history.current = [];
        active.current.clear();
        manager.current?.clearAll();
        setUsers((u) => u.map((x) => ({ ...x, isDrawing: false })));
      });
      // Full state sync (e.g. after reconnect or history-replace)
      s.on("state:sync", ({ history: h }: { history: DrawAction[] }) => {
        if (Array.isArray(h)) {
          history.current = h;
          committedIds.current = new Set(h.map((a) => a.id));
          manager.current?.drawHistory(h);
        }
      });
      s.on("left-room", () => {
        setRoom(null);
        setUsers([]);
        history.current = [];
        active.current.clear();
        committedIds.current.clear();
      });
    };
    connect();
  };

  const leaveRoom = () => {
    socket.current?.emit("leave-room");
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${room}`;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  // ---------- CANVAS INIT ----------
  useEffect(() => {
    if (!room || !mainRef.current || !tempRef.current || !canvasSurfaceRef.current) return;

    const surface = canvasSurfaceRef.current;
    const w = surface.clientWidth;
    const h = surface.clientHeight;
    manager.current = new CanvasManager(mainRef.current, tempRef.current, w, h, theme);
    manager.current.drawHistory(history.current);

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !manager.current) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        manager.current.resize(width, height);
        manager.current.drawHistory(history.current);
      }
    });
    ro.observe(surface);

    let rafId: number;
    const loop = (now: number) => {
      manager.current!.drawActive(active.current);
      manager.current!.drawCursors(users.filter((u) => u.id !== myId.current));
      frameCount.current += 1;
      const elapsed = now - lastFrameTime.current;
      if (elapsed >= 500) {
        setFps(Math.round((frameCount.current * 1000) / elapsed));
        frameCount.current = 0;
        lastFrameTime.current = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    lastFrameTime.current = performance.now();
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [room, users, theme]);

  // ---------- DRAWING ----------
  /** Scale pointer to canvas pixel coordinates (CSS size may differ from canvas width/height). */
  const getPos = (e: React.PointerEvent) => {
    const canvas = tempRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const down = (e: React.PointerEvent) => {
    const p = getPos(e);

    // Touch: prevent scroll/zoom on canvas
    if (e.pointerType === "touch") {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }

    // Text tool: one-shot prompt
    if (tool === "text") {
      const text = window.prompt("Enter text", "");
      if (text != null && text.trim()) {
        const action: DrawAction = {
          id: uuid(),
          userId: myId.current,
          tool: "text",
          color,
          width,
          points: [{ x: Math.floor(p.x), y: Math.floor(p.y) }],
          text: text.trim(),
        };
        history.current.push(action);
        committedIds.current.add(action.id);
        manager.current?.drawHistory(history.current);
        socket.current?.emit("draw-start", { userId: myId.current, point: p, tool: "text", color, width });
        socket.current?.emit("draw-end", action);
      }
      return;
    }

    // Fill tool: one-shot on click
    if (tool === "fill") {
      manager.current?.applyFill(p.x, p.y, color);
      const action: DrawAction = {
        id: uuid(),
        userId: myId.current,
        tool: "fill",
        color,
        width: 0,
        points: [{ x: Math.floor(p.x), y: Math.floor(p.y) }],
      };
      history.current.push(action);
      committedIds.current.add(action.id);
      manager.current?.drawHistory(history.current);
      socket.current?.emit("draw-start", {
        userId: myId.current,
        point: p,
        tool: "fill",
        color,
        width: 0,
      });
      socket.current?.emit("draw-end", action);
      return;
    }

    drawing.current = true;
    points.current = [p];

    active.current.set(myId.current, {
      id: "tmp",
      userId: myId.current,
      tool,
      color,
      width,
      points: [p],
    });

    socket.current?.emit("draw-start", {
      userId: myId.current,
      point: p,
      tool,
      color,
      width,
    });
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = getPos(e);

    if (TWO_POINT_TOOLS.includes(tool)) {
      points.current = [points.current[0], p];
    } else {
      points.current.push(p);
    }

    const a = active.current.get(myId.current);
    if (a) a.points = points.current;

    // Throttle / batch: send stroke segments at most every STREAM_THROTTLE_MS
    const now = Date.now();
    if (TWO_POINT_TOOLS.includes(tool)) {
      pendingStreamPoints.current = [p];
      if (now - lastStreamTime.current >= STREAM_THROTTLE_MS) {
        lastStreamTime.current = now;
        socket.current?.emit("draw-stream", {
          points: [p],
          color,
          width,
          tool,
        });
        pendingStreamPoints.current = [];
      }
    } else {
      pendingStreamPoints.current.push(p);
      if (now - lastStreamTime.current >= STREAM_THROTTLE_MS) {
        lastStreamTime.current = now;
        const batch = pendingStreamPoints.current;
        pendingStreamPoints.current = [];
        if (batch.length > 0) {
          socket.current?.emit("draw-stream", {
            points: batch,
            color,
            width,
            tool,
          });
        }
      }
    }

    // Cursor: throttle to avoid flooding (optional; server forwards anyway)
    socket.current?.emit("cursor-move", { x: p.x, y: p.y });
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;

    // Flush any remaining batched points (final segment may not have been sent)
    if (
      pendingStreamPoints.current.length > 0 &&
      !TWO_POINT_TOOLS.includes(tool)
    ) {
      socket.current?.emit("draw-stream", {
        points: pendingStreamPoints.current,
        color,
        width,
        tool,
      });
      pendingStreamPoints.current = [];
    }

    const action: DrawAction = {
      id: uuid(),
      userId: myId.current,
      tool,
      color,
      width,
      points: [...points.current],
    };

    history.current.push(action);
    committedIds.current.add(action.id);
    manager.current?.drawHistory(history.current);
    socket.current?.emit("draw-end", action);

    active.current.delete(myId.current);
    points.current = [];
    lastStreamTime.current = 0;
  };

  const clearCanvas = () => {
    history.current = [];
    active.current.clear();
    manager.current?.clearAll();
    socket.current?.emit("clear");
  };

  const saveAsPng = () => {
    const canvas = mainRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `canvas-${room || "drawing"}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const saveAsJson = () => {
    const data = JSON.stringify(history.current, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const link = document.createElement("a");
    link.download = `canvas-${room || "drawing"}-${Date.now()}.json`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const loadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const h = JSON.parse(reader.result as string) as DrawAction[];
        if (Array.isArray(h)) {
          history.current = h;
          committedIds.current = new Set(h.map((a) => a.id));
          manager.current?.drawHistory(h);
          socket.current?.emit("history-replace", h);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const me = users.find((u) => u.id === myId.current);
  const displayName = me?.username ?? (currentUsername || "You");

  if (!room) return <Lobby onJoin={join} />;

  return (
    <>
      {/* Top bar: status + users */}
      <header className="top-bar">
        <div className="top-bar-left">
          <span className={`status-pill ${isConnected ? "connected" : ""}`}>
            <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01" />
            </svg>
            <span className="status-text">{isConnected ? "Connected" : "Connecting…"}</span>
          </span>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          <span className="user-pill" style={{ ["--user-color" as string]: me?.color ?? "#3b82f6" }}>
            <span className="user-pill-dot" />
            <span className="user-pill-name">{displayName}</span>
          </span>
          <div className="top-bar-mobile-row2">
            <span className="room-pill" title={`Room: ${room}`}>
              <span className="room-pill-label">Room:</span>
              <span className="room-pill-id">{room}</span>
            </span>
            <button type="button" className="top-bar-btn" onClick={copyRoomLink} title="Copy room link" aria-label="Copy room link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </button>
            <button type="button" className="top-bar-btn leave" onClick={leaveRoom} title="Leave room" aria-label="Leave room">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
            </button>
          </div>
        </div>
        <div className="top-bar-right">
          <span className="stats-pill" title="Performance">
            {fps > 0 && <span className="stats-fps">{fps} FPS</span>}
            {latencyMs != null && <span className="stats-latency">{latencyMs}ms</span>}
          </span>
          <div className="online-pill-wrap" ref={onlinePanelRef}>
            <button
              type="button"
              className={`online-pill ${onlinePanelOpen ? "open" : ""}`}
              onClick={() => setOnlinePanelOpen((v) => !v)}
              aria-expanded={onlinePanelOpen}
              aria-haspopup="true"
              aria-label="Show online users"
            >
              <svg className="online-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span className="online-pill-label">Online </span>
              <span className="online-pill-count">({users.length})</span>
            </button>
            {onlinePanelOpen && (
              <div className="online-panel" role="listbox" aria-label="Online users">
                <div className="online-panel-header">Online ({users.length})</div>
                <ul className="online-panel-list">
                  {users.map((u) => (
                    <li key={u.id} className="online-panel-item" role="option">
                      <span className="online-panel-dot" style={{ background: u.color }} />
                      <span className="online-panel-name">{u.username}</span>
                      {u.id === myId.current && <span className="online-panel-you">(you)</span>}
                      {u.isDrawing && <span className="online-panel-drawing">drawing</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <span className="user-pill you" style={{ ["--user-color" as string]: me?.color ?? "#3b82f6" }}>
            <span className="user-pill-dot" />
            <span className="user-pill-name">{displayName} (you)</span>
          </span>
        </div>
      </header>

      <input type="file" accept=".json,application/json" className="hidden-input" aria-hidden onChange={loadJson} id="load-json-input" />

      <div className="canvas-wrap">
        <div className="canvas-surface" ref={canvasSurfaceRef}>
          <canvas ref={mainRef} className="main" aria-hidden />
          <canvas
            ref={tempRef}
            className="temp"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Drawing canvas"
          />
        </div>
      </div>

      {/* Bottom toolbar */}
      <div className="toolbar">
        <div className="toolbar-group tools">
          {(["brush", "eraser", "rect", "circle", "arrow", "star", "triangle", "fill", "text"] as Tool[]).map((t) => (
            <ToolIcon
              key={t}
              tool={t}
              active={tool === t}
              onClick={() => setTool(t)}
            />
          ))}
        </div>
        <div className="toolbar-group colors">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${color === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              title={c}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
        <div className="toolbar-group stroke-sizes">
          {STROKE_SIZES.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`stroke-dot ${widthIndex === i ? "active" : ""}`}
              style={{ ["--size" as string]: STROKE_SIZES[i] }}
              onClick={() => setWidthIndex(i)}
              title={`Stroke ${STROKE_SIZES[i]}px`}
              aria-label={`Stroke size ${STROKE_SIZES[i]}`}
            />
          ))}
        </div>
        <div className="toolbar-group actions">
          <button className="tool action" onClick={saveAsPng} title="Save as PNG" aria-label="Save as PNG">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          </button>
          <button className="tool action" onClick={saveAsJson} title="Save as JSON" aria-label="Save as JSON">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M10 13l2 2 4-4" /></svg>
          </button>
          <button className="tool action" onClick={() => document.getElementById("load-json-input")?.click()} title="Load JSON" aria-label="Load JSON">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
          </button>
          <button className="tool action" onClick={() => socket.current?.emit("undo")} title="Undo" aria-label="Undo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h10a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H3" /><path d="M3 10l4-4M3 10l4 4" /></svg>
          </button>
          <button className="tool action" onClick={() => socket.current?.emit("redo")} title="Redo" aria-label="Redo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H11a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h10" /><path d="M21 10l-4-4M21 10l-4 4" /></svg>
          </button>
          <button className="tool action clear" onClick={clearCanvas} title="Clear canvas" aria-label="Clear canvas">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
          </button>
        </div>
      </div>
    </>
  );
}
