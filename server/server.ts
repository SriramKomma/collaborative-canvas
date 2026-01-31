import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { RoomManager } from "./rooms";
import { SessionManager } from "./session-manager";
import { handleConnection } from "./socket-handlers";

const app = express();
app.use(cors());

// Rate Limiting (Basic protection)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const roomManager = new RoomManager();
const sessionManager = new SessionManager();

// Create 'global' room by default
roomManager.createRoom("global");

io.on("connection", (socket) => {
  handleConnection(io, socket, roomManager, sessionManager);
});

// Periodic Cleanup of idle rooms (every 5 minutes)
setInterval(
  () => {
    roomManager.cleanupIdleRooms(30 * 60 * 1000); // 30 mins
  },
  5 * 60 * 1000,
);

let PORT = Number(process.env.PORT || 3001);
const start = (p: number) => {
  PORT = p;
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};
server.on("error", (err: any) => {
  if (err && err.code === "EADDRINUSE") {
    const next = PORT + 1;
    console.log(`Port ${PORT} in use, switching to ${next}`);
    start(next);
  }
});
start(PORT);
