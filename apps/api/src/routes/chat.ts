import { LIMITS, listMessagesQuery, openDmSchema, postMessageSchema } from "@floppy/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { currentUser } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import {
  deleteMessage,
  describeConversation,
  listConversations,
  listMessages,
  loadConversation,
  markRead,
  openDm,
  planConversation,
  postMessage,
  taskConversation,
  teamConversation,
} from "../services/chat.js";
import { ctx, param, parse } from "./util.js";

export function chatRoutes(deps: Deps) {
  const r = Router({ mergeParams: true });
  const postLimiter = rateLimit({
    windowMs: 60_000,
    limit: LIMITS.messagesPerMinute,
    keyGenerator: (req) => currentUser(req).id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "You're sending messages too fast. Wait a moment." } },
  });

  r.get("/conversations", async (req, res) => {
    const { org, user } = ctx(req);
    res.json(await listConversations(deps, org, user));
  });

  r.post("/conversations/dm", async (req, res) => {
    const { org, user } = ctx(req);
    const conv = await openDm(deps, org, user, parse(openDmSchema, req.body).userId);
    res.json(await describeConversation(deps, org, user, conv));
  });

  r.get("/teams/:teamId/conversation", async (req, res) => {
    const { org, user } = ctx(req);
    res.json(await describeConversation(deps, org, user, await teamConversation(deps, org, user, param(req, "teamId"))));
  });

  r.get("/tasks/:taskId/conversation", async (req, res) => {
    const { org, user } = ctx(req);
    res.json(await describeConversation(deps, org, user, await taskConversation(deps, org, user, param(req, "taskId"))));
  });

  r.get("/plans/:planId/conversation", async (req, res) => {
    const { org, user } = ctx(req);
    res.json(await describeConversation(deps, org, user, await planConversation(deps, org, user, param(req, "planId"))));
  });

  r.get("/conversations/:conversationId", async (req, res) => {
    const { org, user } = ctx(req);
    const conv = await loadConversation(deps, org, user, param(req, "conversationId"));
    res.json(await describeConversation(deps, org, user, conv));
  });

  r.get("/conversations/:conversationId/messages", async (req, res) => {
    const { org, user } = ctx(req);
    const conv = await loadConversation(deps, org, user, param(req, "conversationId"));
    res.json(await listMessages(deps, conv, parse(listMessagesQuery, req.query)));
  });

  r.post("/conversations/:conversationId/messages", postLimiter, async (req, res) => {
    const { org, user } = ctx(req);
    const conv = await loadConversation(deps, org, user, param(req, "conversationId"));
    res.status(201).json(await postMessage(deps, org, user, conv, parse(postMessageSchema, req.body).body));
  });

  r.delete("/conversations/:conversationId/messages/:messageId", async (req, res) => {
    const { org, user } = ctx(req);
    const conv = await loadConversation(deps, org, user, param(req, "conversationId"));
    await deleteMessage(deps, conv, user, param(req, "messageId"));
    res.status(204).end();
  });

  r.post("/conversations/:conversationId/read", async (req, res) => {
    const { org, user } = ctx(req);
    const conv = await loadConversation(deps, org, user, param(req, "conversationId"));
    await markRead(deps, conv, user.id);
    res.status(204).end();
  });

  return r;
}
