import { StateManager } from "./state-manager";

export interface RoomUser {
  id: string; // This is the persistent userId
  username: string;
  color: string;
  cursor?: { x: number; y: number };
}

export class Room {
  id: string;
  users: Map<string, RoomUser> = new Map();
  stateManager: StateManager = new StateManager();
  createdAt: number;
  lastActive: number;

  constructor(id: string) {
    this.id = id;
    this.createdAt = Date.now();
    this.lastActive = Date.now();
  }

  addUser(userId: string, username: string, color: string): RoomUser {
    const user: RoomUser = {
      id: userId,
      username,
      color,
    };
    this.users.set(userId, user);
    this.lastActive = Date.now();
    return user;
  }

  removeUser(userId: string) {
    this.users.delete(userId);
    this.lastActive = Date.now();
  }

  getUser(userId: string) {
    return this.users.get(userId);
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  updateCursor(userId: string, x: number, y: number) {
    const user = this.users.get(userId);
    if (user) {
      user.cursor = { x, y };
      this.lastActive = Date.now();
    }
  }

  isEmpty(): boolean {
    return this.users.size === 0;
  }
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();

  createRoom(roomId: string): Room {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Room(roomId));
    }
    return this.rooms.get(roomId)!;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  hasRoom(roomId: string): boolean {
    return this.rooms.has(roomId);
  }

  removeRoom(roomId: string) {
    this.rooms.delete(roomId);
  }

  getAllRooms(): { id: string; userCount: number }[] {
    return Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      userCount: room.users.size,
    }));
  }

  // Optional: Cleanup idle rooms
  cleanupIdleRooms(maxIdleTimeMs: number) {
    const now = Date.now();
    for (const [id, room] of this.rooms.entries()) {
      if (room.isEmpty() && now - room.lastActive > maxIdleTimeMs) {
        this.rooms.delete(id);
      }
    }
  }
}
