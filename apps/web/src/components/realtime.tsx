"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/api";
import { keys } from "@/lib/queries";

const SocketContext = createContext<Socket | null>(null);

/**
 * One Socket.IO connection per signed-in session, authenticated with the
 * Clerk session token. The server only pushes; messages are sent over REST.
 */
export function RealtimeProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    const s = io(API_URL, {
      transports: ["websocket"],
      // A fresh token on every (re)connect.
      auth: (cb) => {
        void getToken().then((token) => cb({ token }));
      },
    });
    s.on("conversation:activity", () => queryClient.invalidateQueries({ queryKey: keys.conversations(orgId) }));
    s.on("conversation:read", () => queryClient.invalidateQueries({ queryKey: keys.conversations(orgId) }));
    setSocket(s);
    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [isSignedIn, getToken, queryClient, orgId]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}
