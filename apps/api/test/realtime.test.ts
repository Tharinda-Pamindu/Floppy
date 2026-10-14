import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SocketRealtime } from "../src/adapters/realtime.js";
import { createHarness, type Harness, seedOrg } from "./harness.js";

let h: Harness;
let o: Awaited<ReturnType<typeof seedOrg>>;
let server: Server;
let url: string;
const sockets: Socket[] = [];

function client(token: string | null) {
  // The harness's verifyToken treats the token as the user id.
  const s = connect(url, { transports: ["websocket"], auth: token ? { token } : {}, reconnection: false, forceNew: true });
  sockets.push(s);
  return s;
}

const connected = (s: Socket) =>
  new Promise<"ok" | string>((resolve) => {
    s.on("connect", () => resolve("ok"));
    s.on("connect_error", (e) => resolve(e.message));
  });

beforeAll(async () => {
  h = await createHarness();
  o = await seedOrg(h);
  const realtime = new SocketRealtime();
  h.deps.realtime = realtime;
  server = createServer(h.app);
  realtime.attach(server, h.deps);
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await new Promise((r) => server.close(r));
  await h.close();
});

describe("Socket.IO realtime", () => {
  it("refuses a connection without a valid session token", async () => {
    expect(await connected(client(null))).toBe("unauthorized");
    expect(await connected(client("nobody_like_this"))).toBe("unauthorized");
  });

  it("lets a member join their team channel and receive messages live, but not an outsider", async () => {
    const conv = (await h.as(o.member).get(`/organizations/${o.orgId}/teams/${o.payments}/conversation`)).body;
    const member = client(o.tom);
    expect(await connected(member)).toBe("ok");
    const joined = await member.emitWithAck("conversation:join", { organizationId: o.orgId, conversationId: conv.id });
    expect(joined).toEqual({ ok: true });

    await h.user("intruder");
    const outsider = client("intruder");
    expect(await connected(outsider)).toBe("ok");
    expect(await outsider.emitWithAck("conversation:join", { organizationId: o.orgId, conversationId: conv.id })).toEqual({ ok: false });

    const received = new Promise<{ body: string }>((resolve) => member.on("message:new", resolve));
    let leaked = false;
    outsider.on("message:new", () => (leaked = true));
    await h.as(o.member).post(`/organizations/${o.orgId}/conversations/${conv.id}/messages`).send({ body: "live hello" });
    expect((await received).body).toBe("live hello");
    await new Promise((r) => setTimeout(r, 200));
    expect(leaked).toBe(false);
  });
});
