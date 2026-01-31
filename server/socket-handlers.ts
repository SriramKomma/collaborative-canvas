import { Server, Socket } from "socket.io";
import { RoomManager } from "./rooms";
import { SessionManager } from "./session-manager";
import type { Stroke } from "./state-manager";

export const handleConnection = (
  io: Server,
  socket: Socket,
  roomManager: RoomManager,
  sessionManager: SessionManager,
) => {
  // 1. Identify User
  const userId = socket.handshake.query.userId as string;
  const username = socket.handshake.query.username as string;

  if (!userId) {
    socket.disconnect(true);
    return;
  }

  console.log(`User connected: ${userId} (${username || "Anonymous"})`);

  // Create or Retrieve Session
  const session = sessionManager.createSession(userId, socket.id, username);

  // Send available rooms (Lobby)
  socket.emit("room-list", roomManager.getAllRooms());

  // Helper to get current room
  const getCurrentRoom = () => {
    if (session.currentRoomId) {
      return roomManager.getRoom(session.currentRoomId);
    }
    return undefined;
  };

  // Helper to leave current room
  const leaveCurrentRoom = () => {
    if (session.currentRoomId) {
      const room = roomManager.getRoom(session.currentRoomId);
      if (room) {
        room.removeUser(userId);
        socket.leave(session.currentRoomId);
        // Broadcast to others in that room
        socket.to(session.currentRoomId).emit("user-left", userId);

        // Cleanup empty room if not global
        if (room.isEmpty() && room.id !== "global") {
          // roomManager.removeRoom(room.id); // Optional: immediate cleanup
        }
      }
      sessionManager.leaveRoom(userId);
    }
  };

  // Event: Create Room
  socket.on("create-room", (roomId: string) => {
    // Validate roomId (basic alphanumeric)
    if (!/^[a-zA-Z0-9-_]+$/.test(roomId)) {
      socket.emit("error", "Invalid room ID");
      return;
    }

    // Rate limit: 1 room per 10 seconds
    if (
      session.lastRoomCreated &&
      Date.now() - session.lastRoomCreated < 10000
    ) {
      socket.emit("error", "Please wait before creating another room");
      return;
    }

    if (roomManager.hasRoom(roomId)) {
      socket.emit("error", "Room already exists");
      return;
    }

    roomManager.createRoom(roomId);
    session.lastRoomCreated = Date.now();
    io.emit("room-list", roomManager.getAllRooms()); // Broadcast update to all lobby
  });

  // Event: Join Room
  socket.on("join-room", (roomId: string) => {
    const room = roomManager.getRoom(roomId);
    if (!room) {
      socket.emit("error", "Room not found");
      return;
    }

    // Leave current room first
    leaveCurrentRoom();

    // Join new room
    sessionManager.joinRoom(userId, roomId);
    socket.join(roomId);

    // Add user to room
    const user = room.addUser(userId, session.username, session.color);

    // Send initial state (full history for late-joining users)
    socket.emit("init-room", {
      roomId: room.id,
      users: room.getAllUsers(),
      history: room.stateManager.getHistory(),
    });

    // Broadcast new user
    socket.to(roomId).emit("user-joined", user);
  });

  // Event: Leave Room
  socket.on("leave-room", () => {
    leaveCurrentRoom();
    socket.emit("left-room");
  });

  // Handle cursor movement
  socket.on("cursor-move", (pos: { x: number; y: number }) => {
    const room = getCurrentRoom();
    if (room) {
      room.updateCursor(userId, pos.x, pos.y);
      socket.to(room.id).emit("cursor-update", { userId, pos });
    }
  });
  socket.on("cursor:update", (pos: { x: number; y: number }) => {
    const room = getCurrentRoom();
    if (room) {
      room.updateCursor(userId, pos.x, pos.y);
      socket.to(room.id).emit("cursor-update", { userId, pos });
    }
  });

  // Handle live drawing
  socket.on(
    "draw-stream",
    (data: { points: any[]; color: string; width: number; tool: string }) => {
      const room = getCurrentRoom();
      if (room) {
        socket.to(room.id).emit("draw-stream", { userId, ...data });
      }
    },
  );
  socket.on(
    "stroke:move",
    (data: { points: any[]; color: string; width: number; tool: string }) => {
      const room = getCurrentRoom();
      if (room) {
        socket.to(room.id).emit("stroke:move", { userId, ...data });
      }
    },
  );

  // Handle drawing start
  socket.on(
    "draw-start",
    (data: {
      point: { x: number; y: number };
      color: string;
      width: number;
      tool: string;
    }) => {
      const room = getCurrentRoom();
      if (room) {
        socket.to(room.id).emit("draw-start", { userId, ...data });
        io.to(room.id).emit("user-drawing", {
          userId,
          username: session.username,
          color: session.color,
        });
      }
    },
  );
  socket.on(
    "stroke:start",
    (data: {
      point: { x: number; y: number };
      color: string;
      width: number;
      tool: string;
    }) => {
      const room = getCurrentRoom();
      if (room) {
        socket.to(room.id).emit("stroke:start", { userId, ...data });
        io.to(room.id).emit("user-drawing", {
          userId,
          username: session.username,
          color: session.color,
        });
      }
    },
  );

  // Handle completed stroke (draw-end / stroke:end)
  socket.on("draw-end", (stroke: Stroke) => {
    const room = getCurrentRoom();
    if (room) {
      stroke.userId = userId;
      room.stateManager.addStroke(stroke);
      io.to(room.id).emit("action-added", stroke);
      io.to(room.id).emit("user-drawing-end", { userId });
    }
  });
  socket.on("stroke:end", (stroke: Stroke) => {
    const room = getCurrentRoom();
    if (room) {
      stroke.userId = userId;
      room.stateManager.addStroke(stroke);
      io.to(room.id).emit("action-added", stroke);
      io.to(room.id).emit("user-drawing-end", { userId });
    }
  });

  // Undo: server pops last stroke, broadcasts id; clients redraw from local history
  socket.on("undo", () => {
    const room = getCurrentRoom();
    if (room) {
      const stroke = room.stateManager.undo();
      if (stroke) {
        io.to(room.id).emit("undo-action", stroke.id);
      }
    }
  });

  // Redo: server pushes from redo stack, broadcasts stroke
  socket.on("redo", () => {
    const room = getCurrentRoom();
    if (room) {
      const stroke = room.stateManager.redo();
      if (stroke) {
        io.to(room.id).emit("action-added", stroke);
      }
    }
  });

  // Global clear: server clears state and broadcasts to room
  socket.on("clear", () => {
    const room = getCurrentRoom();
    if (room) {
      room.stateManager.clear();
      io.to(room.id).emit("clear");
    }
  });

  // Optional: client requests full state (e.g. after reconnect)
  socket.on("state:sync", () => {
    const room = getCurrentRoom();
    if (room) {
      socket.emit("state:sync", {
        roomId: room.id,
        users: room.getAllUsers(),
        history: room.stateManager.getHistory(),
      });
    }
  });

  // Replace room history (e.g. load from file) and broadcast to all in room
  socket.on("history-replace", (history: Stroke[]) => {
    const room = getCurrentRoom();
    if (room && Array.isArray(history)) {
      room.stateManager.replaceHistory(history);
      io.to(room.id).emit("state:sync", { history: room.stateManager.getHistory() });
    }
  });

  // Ping for latency measurement
  socket.on("ping", (sent: number) => {
    socket.emit("pong", { sent });
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${userId}`);
    leaveCurrentRoom();
    sessionManager.removeSession(socket.id);
  });
};
