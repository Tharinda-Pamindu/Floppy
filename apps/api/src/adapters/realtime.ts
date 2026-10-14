import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { resolveOrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import { logger } from "../logger.js";
import type { Realtime } from "../ports.js";
import { loadConversation } from "../services/chat.js";
import { ensureUser, type UserRow } from "../services/sync.js";

/**
 * Socket.IO rooms: `user:<id>` for each signed-in person (unread badges) and
 * `conv:<id>` for an open conversation. The handshake carries a Clerk session
 * token; joining a conversation re-checks access exactly like the REST API.
 * Clients only receive over the socket — they post messages through REST.
 */
export class SocketRealtime implements Realtime {
  private io: Server | null = null;

  attach(server: HttpServer, deps: Deps) {
    const io = new Server(server, {
      cors: { origin: deps.config.WEB_ORIGIN, credentials: false },
      maxHttpBufferSize: 16 * 1024,
    });

    io.use(async (socket, next) => {
      try {
        const token = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : "";
        const userId = token ? await deps.auth.verifyToken(token) : null;
        const user = userId ? await ensureUser(deps, userId) : null;
        if (!user || !user.isActive) return next(new Error("unauthorized"));
        socket.data.user = user;
        next();
      } catch {
        next(new Error("unauthorized"));
      }
    });

    io.on("connection", (socket: Socket) => {
      const user = socket.data.user as UserRow;
      void socket.join(`user:${user.id}`);

      socket.on("conversation:join", async (msg: { organizationId?: unknown; conversationId?: unknown }, ack?: (r: { ok: boolean }) => void) => {
        try {
          const org = await resolveOrgContext(deps, String(msg?.organizationId ?? ""), user);
          const conv = await loadConversation(deps, org, user, String(msg?.conversationId ?? ""));
          await socket.join(`conv:${conv.id}`);
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      });

      socket.on("conversation:leave", (msg: { conversationId?: unknown }) => {
        void socket.leave(`conv:${String(msg?.conversationId ?? "")}`);
      });
    });

    this.io = io;
    logger.info({}, "Realtime (Socket.IO) attached");
    return io;
  }

  toConversation(conversationId: string, event: string, data: unknown) {
    this.io?.to(`conv:${conversationId}`).emit(event, data);
  }

  toUser(userId: string, event: string, data: unknown) {
    this.io?.to(`user:${userId}`).emit(event, data);
  }
}
