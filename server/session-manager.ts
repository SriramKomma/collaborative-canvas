export interface UserSession {
  userId: string;
  socketId: string;
  username: string;
  color: string;
  currentRoomId?: string;
  lastActive: number;
  lastRoomCreated?: number;
}

export class SessionManager {
  // Map userId -> UserSession
  private sessions: Map<string, UserSession> = new Map();
  // Map socketId -> userId (for quick lookup)
  private socketToUser: Map<string, string> = new Map();

  createSession(
    userId: string,
    socketId: string,
    username?: string,
  ): UserSession {
    const existing = this.sessions.get(userId);
    const color = existing?.color || this.generateRandomColor();
    const name = username || existing?.username || `User ${userId.slice(0, 4)}`;

    const session: UserSession = {
      userId,
      socketId,
      username: name,
      color,
      currentRoomId: existing?.currentRoomId,
      lastActive: Date.now(),
      lastRoomCreated: existing?.lastRoomCreated,
    };

    this.sessions.set(userId, session);
    this.socketToUser.set(socketId, userId);
    return session;
  }

  updateSocket(userId: string, newSocketId: string) {
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

  getSessionBySocket(socketId: string): UserSession | undefined {
    const userId = this.socketToUser.get(socketId);
    if (userId) {
      return this.sessions.get(userId);
    }
    return undefined;
  }

  getSession(userId: string): UserSession | undefined {
    return this.sessions.get(userId);
  }

  removeSession(socketId: string) {
    const userId = this.socketToUser.get(socketId);
    if (userId) {
      this.socketToUser.delete(socketId);
      // We might want to keep the session object for reconnection,
      // but maybe mark it as inactive?
      // For now, let's keep it in 'sessions' map indefinitely (or until cleanup).
    }
  }

  joinRoom(userId: string, roomId: string) {
    const session = this.sessions.get(userId);
    if (session) {
      session.currentRoomId = roomId;
      session.lastActive = Date.now();
    }
  }

  leaveRoom(userId: string) {
    const session = this.sessions.get(userId);
    if (session) {
      session.currentRoomId = undefined;
      session.lastActive = Date.now();
    }
  }

  private generateRandomColor(): string {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }
}
