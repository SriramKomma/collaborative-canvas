"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
class SessionManager {
    constructor() {
        // Map userId -> UserSession
        this.sessions = new Map();
        // Map socketId -> userId (for quick lookup)
        this.socketToUser = new Map();
    }
    createSession(userId, socketId, username) {
        const existing = this.sessions.get(userId);
        const color = (existing === null || existing === void 0 ? void 0 : existing.color) || this.generateRandomColor();
        const name = username || (existing === null || existing === void 0 ? void 0 : existing.username) || `User ${userId.slice(0, 4)}`;
        const session = {
            userId,
            socketId,
            username: name,
            color,
            currentRoomId: existing === null || existing === void 0 ? void 0 : existing.currentRoomId,
            lastActive: Date.now(),
            lastRoomCreated: existing === null || existing === void 0 ? void 0 : existing.lastRoomCreated,
        };
        this.sessions.set(userId, session);
        this.socketToUser.set(socketId, userId);
        return session;
    }
    updateSocket(userId, newSocketId) {
        const session = this.sessions.get(userId);
        if (session) {
            // Remove old socket mapping
            this.socketToUser.delete(session.socketId);
            // Update session
            session.socketId = newSocketId;
            session.lastActive = Date.now();
            // Add new socket mapping
            this.socketToUser.set(newSocketId, userId);
        }
    }
    getSessionBySocket(socketId) {
        const userId = this.socketToUser.get(socketId);
        if (userId) {
            return this.sessions.get(userId);
        }
        return undefined;
    }
    getSession(userId) {
        return this.sessions.get(userId);
    }
    removeSession(socketId) {
        const userId = this.socketToUser.get(socketId);
        if (userId) {
            this.socketToUser.delete(socketId);
            // We might want to keep the session object for reconnection,
            // but maybe mark it as inactive?
            // For now, let's keep it in 'sessions' map indefinitely (or until cleanup).
        }
    }
    joinRoom(userId, roomId) {
        const session = this.sessions.get(userId);
        if (session) {
            session.currentRoomId = roomId;
            session.lastActive = Date.now();
        }
    }
    leaveRoom(userId) {
        const session = this.sessions.get(userId);
        if (session) {
            session.currentRoomId = undefined;
            session.lastActive = Date.now();
        }
    }
    generateRandomColor() {
        const letters = "0123456789ABCDEF";
        let color = "#";
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }
}
exports.SessionManager = SessionManager;
