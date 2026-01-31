"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = exports.Room = void 0;
const state_manager_1 = require("./state-manager");
class Room {
    constructor(id) {
        this.users = new Map();
        this.stateManager = new state_manager_1.StateManager();
        this.id = id;
        this.createdAt = Date.now();
        this.lastActive = Date.now();
    }
    addUser(userId, username, color) {
        const user = {
            id: userId,
            username,
            color,
        };
        this.users.set(userId, user);
        this.lastActive = Date.now();
        return user;
    }
    removeUser(userId) {
        this.users.delete(userId);
        this.lastActive = Date.now();
    }
    getUser(userId) {
        return this.users.get(userId);
    }
    getAllUsers() {
        return Array.from(this.users.values());
    }
    updateCursor(userId, x, y) {
        const user = this.users.get(userId);
        if (user) {
            user.cursor = { x, y };
            this.lastActive = Date.now();
        }
    }
    isEmpty() {
        return this.users.size === 0;
    }
}
exports.Room = Room;
class RoomManager {
    constructor() {
        this.rooms = new Map();
    }
    createRoom(roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Room(roomId));
        }
        return this.rooms.get(roomId);
    }
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    hasRoom(roomId) {
        return this.rooms.has(roomId);
    }
    removeRoom(roomId) {
        this.rooms.delete(roomId);
    }
    getAllRooms() {
        return Array.from(this.rooms.values()).map((room) => ({
            id: room.id,
            userCount: room.users.size,
        }));
    }
    // Optional: Cleanup idle rooms
    cleanupIdleRooms(maxIdleTimeMs) {
        const now = Date.now();
        for (const [id, room] of this.rooms.entries()) {
            if (room.isEmpty() && now - room.lastActive > maxIdleTimeMs) {
                this.rooms.delete(id);
            }
        }
    }
}
exports.RoomManager = RoomManager;
