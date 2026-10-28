import { createServer, type Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { io } from "socket.io-client";
import { fullstackHandler } from "../src/fullstack-handler.js";
import { SocketRealtime } from "../src/adapters/realtime.js";
import { createHarness, seedOrg, type Harness } from "./harness.js";

let h: Harness;
let server: Server;
let org: Awaited<ReturnType<typeof seedOrg>>;
let outsider: string;
let realtime: ReturnType<SocketRealtime["attach"]>;
beforeAll(async () => {
  h = await createHarness();
  org = await seedOrg(h, "one_");
  outsider = (await seedOrg(h, "two_")).member;
  server = createServer(fullstackHandler(h.app, (_req, res) => res.end("frontend")));
  realtime = new SocketRealtime().attach(server, h.deps);
});
afterAll(async () => {
  await new Promise<void>((resolve) => realtime.close(() => resolve()));
  await h.close();
});
it("serves pages separately from API auth, including the staff page", async () => {
  expect((await request(server).get("/staff")).text).toBe("frontend");
  expect((await request(server).get("/api/me")).status).toBe(401);
  expect((await request(server).get("/api/staff/users").set("x-test-user", org.member)).status).toBe(404);
  expect((await request(server).get("/api/health")).body).toEqual({ ok: true });
  expect((await request(server).get("/health")).body).toEqual({ ok: true });
});
it("keeps org access checks behind the API prefix", async () => {
  const path = `/api/organizations/${org.orgId}/members`;
  expect((await request(server).get(path).set("x-test-user", org.owner)).status).toBe(200);
  expect((await request(server).get(path).set("x-test-user", outsider)).status).toBe(404);
});
it("preserves raw webhook bodies and query strings, and keeps Novu's route", async () => {
  const api = express();
  api.use(express.raw({ type: "application/json" }));
  api.use((req, res) => res.json({ url: req.url, body: req.body.toString(), signature: req.get("svix-signature"), cookie: req.get("cookie") ?? null, authorization: req.get("authorization") }));
  const handler = fullstackHandler(api, (_req, res) => res.end("frontend"));
  const body = '{ "signed": true }';
  for (const path of ["/webhooks/clerk", "/api/webhooks/clerk", "/api/novu"]) {
    const res = await request(handler).post(`${path}?check=1`).set("Content-Type", "application/json")
      .set("svix-signature", "test-signature").set("Cookie", "session=browser-cookie").set("Authorization", "Bearer test-token").send(body);
    expect(res.body).toEqual({ url: `${path === "/api/webhooks/clerk" ? "/webhooks/clerk" : path}?check=1`, body, signature: "test-signature", cookie: null, authorization: "Bearer test-token" });
  }
  expect((await request(handler).get("/apiary")).text).toBe("frontend");
});
it("authenticates Socket.IO over the same public HTTP server", async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  const socket = io(`http://127.0.0.1:${address.port}`, { transports: ["websocket"], auth: { token: org.member }, reconnection: false });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    expect(socket.connected).toBe(true);
  } finally {
    socket.disconnect();
  }
});
