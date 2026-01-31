import { useState } from "react";

function randomRoomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function Lobby({
  onJoin,
}: {
  onJoin: (room: string, name: string, options?: { createNew?: boolean }) => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const presetRoom = params.get("room") || "";
  const [room, setRoom] = useState(presetRoom || "global");
  const [name, setName] = useState("");

  const canJoin = name.trim().length > 0 && room.trim().length > 0;
  const canCreate = name.trim().length > 0;

  return (
    <div className="lobby">
      <div className="lobby-bg" aria-hidden />
      <div className="lobby-card">
        <div className="lobby-brand">
          <div className="lobby-icon" aria-hidden>
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8 28L14 14L22 22L32 8"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="14" cy="14" r="2.5" fill="currentColor" />
              <circle cx="22" cy="22" r="2.5" fill="currentColor" />
            </svg>
          </div>
          <h1 className="lobby-title">Collaborative Canvas</h1>
          <p className="lobby-subtitle">Draw together in real time</p>
        </div>

        <form
          className="lobby-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (canJoin) onJoin(room.trim(), name.trim());
          }}
        >
          <label className="lobby-label">Your name</label>
          <input
            type="text"
            className="lobby-input"
            placeholder="e.g. Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            maxLength={32}
          />
          <label className="lobby-label">Room</label>
          <input
            type="text"
            className="lobby-input"
            placeholder="e.g. global"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            autoComplete="off"
          />
          <div className="lobby-buttons">
            <button
              type="submit"
              className="lobby-join"
              disabled={!canJoin}
            >
              Join room
            </button>
            <button
              type="button"
              className="lobby-create"
              disabled={!canCreate}
              onClick={() => {
                if (!canCreate) return;
                const newId = randomRoomId();
                onJoin(newId, name.trim(), { createNew: true });
              }}
            >
              Create new room
            </button>
          </div>
        </form>

        <p className="lobby-hint">
          Share the room name or link with others to draw on the same canvas.
        </p>
      </div>
    </div>
  );
}
