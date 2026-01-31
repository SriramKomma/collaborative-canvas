"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rooms_1 = require("./rooms");
const session_manager_1 = require("./session-manager");
const socket_handlers_1 = require("./socket-handlers");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Rate Limiting (Basic protection)
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
const roomManager = new rooms_1.RoomManager();
const sessionManager = new session_manager_1.SessionManager();
// Create 'global' room by default
roomManager.createRoom("global");
io.on("connection", (socket) => {
    (0, socket_handlers_1.handleConnection)(io, socket, roomManager, sessionManager);
});
// Periodic Cleanup of idle rooms (every 5 minutes)
setInterval(() => {
    roomManager.cleanupIdleRooms(30 * 60 * 1000); // 30 mins
}, 5 * 60 * 1000);
let PORT = Number(process.env.PORT || 3001);
const start = (p) => {
    PORT = p;
    server.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};
server.on("error", (err) => {
    if (err && err.code === "EADDRINUSE") {
        const next = PORT + 1;
        console.log(`Port ${PORT} in use, switching to ${next}`);
        start(next);
    }
});
start(PORT);
