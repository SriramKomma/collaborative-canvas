import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { RoomManager } from "./rooms";
import { SessionManager } from "./session-manager";
import { handleConnection } from "./socket-handlers";

const app = express();

/* =======================
   CORS CONFIG (IMPORTANT)
======================= */

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://collaborative-canvas-j1of7ks3r-sriram-kommas-projects.vercel.app"
];

app.use(
  cors({
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  })
);

// Rate Limiting (Basic protection)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use(limiter);

const server = http.createServer(app);

/* =======================
   SOCKET.IO SERVER
======================= */

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

const roomManager = new RoomManager();
const sessionManager = new SessionManager();

// Create global room
roomManager.createRoom("global");

io.on("connection", (socket) => {
  handleConnection(io, socket, roomManager, sessionManager);
});

// Cleanup idle rooms every 5 minutes
setInterval(() => {
  roomManager.cleanupIdleRooms(30 * 60 * 1000); // 30 mins
}, 5 * 60 * 1000);

/* =======================
   SERVER START
======================= */

let PORT = Number(process.env.PORT || 3001);

const start = (p: number) => {
  PORT = p;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    const next = PORT + 1;
    console.log(`Port ${PORT} in use, switching to ${next}`);
    start(next);
  }
});

start(PORT);
