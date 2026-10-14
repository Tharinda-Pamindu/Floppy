import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { NotificationPreferences, OrgRole } from "@floppy/shared";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Request } from "express";
import request from "supertest";
import type { z } from "zod";
import { createApp } from "../src/app.js";
import type { Deps } from "../src/context.js";
import type { Db } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import {
  AiProviderError,
  type AiProvider,
  type GithubClient,
  type GithubIssueInfo,
  type IdentityInvitation,
  type IdentityMembership,
  type IdentityProvider,
  type IdentityUser,
  type Notifier,
  type Realtime,
  type SubscriberProfile,
  type WorkflowId,
} from "../src/ports.js";
import { upsertUserMirror } from "../src/services/sync.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// -- Fakes ------------------------------------------------------------------------

export class FakeIdentity implements IdentityProvider {
  users = new Map<string, IdentityUser>();
  orgs = new Map<string, { id: string; name: string; suspended: boolean }>();
  memberships: IdentityMembership[] = [];
  invitations: (IdentityInvitation & { orgId: string })[] = [];
  private seq = 0;

  addUser(u: Partial<IdentityUser> & { id: string }) {
    const user: IdentityUser = {
      email: `${u.id}@example.test`,
      firstName: u.id,
      lastName: "Tester",
      imageUrl: null,
      phone: null,
      platformRole: "none",
      banned: false,
      createdAt: new Date(),
      ...u,
    };
    this.users.set(user.id, user);
    return user;
  }
  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async findUserByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async createUser(input: { email: string; firstName: string; lastName: string; password: string; platformRole?: IdentityUser["platformRole"] }) {
    return this.addUser({ id: `user_${++this.seq}`, email: input.email, firstName: input.firstName, lastName: input.lastName, platformRole: input.platformRole ?? "none" });
  }
  async updateUser(id: string, input: { firstName?: string; lastName?: string }) {
    const u = this.users.get(id);
    if (u) Object.assign(u, Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)));
  }
  async setPlatformRole(id: string, role: IdentityUser["platformRole"]) {
    const u = this.users.get(id);
    if (u) u.platformRole = role;
  }
  async setBanned(id: string, banned: boolean) {
    const u = this.users.get(id);
    if (u) u.banned = banned;
  }
  async createOrganization(input: { name: string; createdBy: string }) {
    const id = `org_${++this.seq}`;
    this.orgs.set(id, { id, name: input.name, suspended: false });
    this.memberships.push({ organizationId: id, organizationName: input.name, userId: input.createdBy, role: "admin", createdAt: new Date() });
    return { id, name: input.name };
  }
  async renameOrganization(id: string, name: string) {
    const o = this.orgs.get(id);
    if (o) o.name = name;
  }
  async setOrganizationSuspended(id: string, suspended: boolean) {
    const o = this.orgs.get(id);
    if (o) o.suspended = suspended;
  }
  async deleteOrganization(id: string) {
    this.orgs.delete(id);
    this.memberships = this.memberships.filter((m) => m.organizationId !== id);
  }
  async getMembership(orgId: string, userId: string) {
    return this.memberships.find((m) => m.organizationId === orgId && m.userId === userId) ?? null;
  }
  async listUserMemberships(userId: string) {
    return this.memberships.filter((m) => m.userId === userId);
  }
  async addMember(orgId: string, userId: string, role: OrgRole) {
    const org = this.orgs.get(orgId)!;
    this.memberships.push({ organizationId: orgId, organizationName: org.name, userId, role, createdAt: new Date() });
  }
  async setMemberRole(orgId: string, userId: string, role: OrgRole) {
    const m = this.memberships.find((x) => x.organizationId === orgId && x.userId === userId);
    if (m) m.role = role;
  }
  async removeMember(orgId: string, userId: string) {
    this.memberships = this.memberships.filter((m) => !(m.organizationId === orgId && m.userId === userId));
  }
  async createInvitation(input: { orgId: string; email: string; role: "admin" | "member" }) {
    const inv = { id: `inv_${++this.seq}`, orgId: input.orgId, email: input.email, role: input.role, status: "pending", createdAt: new Date(), expiresAt: null, url: `https://clerk.test/accept/${this.seq}` };
    this.invitations.push(inv);
    return inv;
  }
  async listPendingInvitations(orgId: string) {
    return this.invitations.filter((i) => i.orgId === orgId && i.status === "pending");
  }
  async revokeInvitation(_orgId: string, invitationId: string) {
    const inv = this.invitations.find((i) => i.id === invitationId);
    if (inv) inv.status = "revoked";
  }
}

export class RecordingNotifier implements Notifier {
  readonly enabled = true;
  sent: { workflowId: WorkflowId; to: string[]; payload: Record<string, unknown> }[] = [];
  subscribers = new Map<string, SubscriberProfile>();
  prefs: NotificationPreferences = { global: { email: true, sms: true, inApp: true }, workflows: [] };

  async trigger(workflowId: WorkflowId, to: string | string[], payload: Record<string, unknown>) {
    this.sent.push({ workflowId, to: Array.isArray(to) ? to : [to], payload });
  }
  async triggerInline(workflowId: WorkflowId, to: { subscriberId: string }, payload: Record<string, unknown>) {
    this.sent.push({ workflowId, to: [to.subscriberId], payload });
  }
  async upsertSubscriber(p: SubscriberProfile) {
    this.subscribers.set(p.id, p);
  }
  async deleteSubscriber(id: string) {
    this.subscribers.delete(id);
  }
  async getPreferences() {
    return this.prefs;
  }
  async updatePreferences(_id: string, input: { channels: { email?: boolean; sms?: boolean; inApp?: boolean } }) {
    Object.assign(this.prefs.global, input.channels);
  }
  inboxSession(subscriberId: string) {
    return { applicationIdentifier: "app_test", subscriberId, subscriberHash: "hash" };
  }
  of(workflowId: WorkflowId) {
    return this.sent.filter((s) => s.workflowId === workflowId);
  }
  clear() {
    this.sent = [];
  }
}

export class FakeGithub implements GithubClient {
  repos = new Map<string, { private: boolean }>([["acme/widgets", { private: false }]]);
  issues: GithubIssueInfo[] = [
    { number: 7, title: "Checkout fails for expired cards", state: "open", url: "https://github.com/acme/widgets/issues/7", labels: ["bug"], author: "octo", createdAt: "2026-10-01T00:00:00Z" },
    { number: 9, title: "Add dark mode", state: "open", url: "https://github.com/acme/widgets/issues/9", labels: [], author: "octo", createdAt: "2026-10-02T00:00:00Z" },
  ];
  async getRepo(owner: string, name: string) {
    const r = this.repos.get(`${owner}/${name}`);
    return r ? { owner, name, htmlUrl: `https://github.com/${owner}/${name}`, private: r.private } : null;
  }
  async listOpenIssues() {
    return { issues: this.issues.filter((i) => i.state === "open"), hasMore: false };
  }
  async getIssue(_o: string, _n: string, number: number) {
    return this.issues.find((i) => i.number === number) ?? null;
  }
}

/** An AI provider whose answer (or failure) the test decides. */
export class ScriptedAi implements AiProvider {
  readonly model = "test-model";
  next: unknown = null;
  fail: AiProviderError | null = null;
  prompts: string[] = [];
  async generateObject<T>(input: { prompt: string; schema: z.ZodType<T> }) {
    this.prompts.push(input.prompt);
    if (this.fail) throw this.fail;
    const parsed = input.schema.safeParse(this.next);
    if (!parsed.success) throw new AiProviderError("invalid_output", "bad");
    return { object: parsed.data, inputTokens: 10, outputTokens: 20 };
  }
}

export class RecordingRealtime implements Realtime {
  events: { room: string; event: string; data: unknown }[] = [];
  toConversation(id: string, event: string, data: unknown) {
    this.events.push({ room: `conv:${id}`, event, data });
  }
  toUser(id: string, event: string, data: unknown) {
    this.events.push({ room: `user:${id}`, event, data });
  }
}

// -- Harness ------------------------------------------------------------------------

export interface Harness {
  deps: Deps;
  db: Db;
  identity: FakeIdentity;
  notifier: RecordingNotifier;
  github: FakeGithub;
  ai: ScriptedAi;
  realtime: RecordingRealtime;
  clock: { now: Date };
  app: import("express").Express;
  orgRouter: import("express").Router;
  /** supertest agent acting as `userId` (null = signed out). */
  as(userId: string | null): ReturnType<typeof agentFor>;
  user(id: string, extra?: Partial<IdentityUser>): Promise<void>;
  close(): Promise<void>;
}

function agentFor(app: import("express").Express, userId: string | null) {
  const wrap = (method: "get" | "post" | "put" | "patch" | "delete") => (url: string) => {
    const r = request(app)[method](url);
    return userId ? r.set("x-test-user", userId) : r;
  };
  return { get: wrap("get"), post: wrap("post"), put: wrap("put"), patch: wrap("patch"), delete: wrap("delete") };
}

export async function createHarness(options: { aiEnabled?: boolean; now?: Date } = {}): Promise<Harness> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(drizzle(client), { migrationsFolder: path.join(here, "..", "drizzle") });

  const identity = new FakeIdentity();
  const notifier = new RecordingNotifier();
  const github = new FakeGithub();
  const ai = new ScriptedAi();
  const realtime = new RecordingRealtime();
  // Wednesday 14 October 2026, 10:00 UTC unless a test says otherwise.
  const clock = { now: options.now ?? new Date("2026-10-14T10:00:00Z") };

  const deps: Deps = {
    config: {
      WEB_ORIGIN: "http://localhost:3000",
      API_PUBLIC_URL: "http://localhost:4000",
      AI_TIMEOUT_SECONDS: 5,
      AI_RATE_LIMIT_PER_MINUTE: 6,
      CLERK_EMAILS_VIA_NOVU: true,
      NODE_ENV: "test",
    },
    db,
    identity,
    notifier,
    github,
    ai: options.aiEnabled === false ? null : ai,
    realtime,
    auth: {
      middleware: (_req, _res, next) => next(),
      userIdOf: (req: Request) => (req.headers["x-test-user"] as string | undefined) ?? null,
      verifyToken: async (token) => token || null,
    },
    now: () => clock.now,
  };
  const { app, orgRouter } = createApp(deps, { requestsPerMinute: 100_000 });

  return {
    deps,
    db,
    identity,
    notifier,
    github,
    ai,
    realtime,
    clock,
    app,
    orgRouter,
    as: (userId) => agentFor(app, userId),
    async user(id, extra) {
      const u = identity.addUser({ id, ...extra });
      await upsertUserMirror(deps, u);
    },
    close: () => client.close(),
  };
}

/**
 * A small organization: owner Olivia, admin Arjun, lead Leila and members
 * Marco and Tom on "Payments", with Tom also on "Growth" (no lead).
 */
export async function seedOrg(h: Harness, prefix = "") {
  const ids = {
    owner: `${prefix}olivia`,
    admin: `${prefix}arjun`,
    lead: `${prefix}leila`,
    member: `${prefix}marco`,
    tom: `${prefix}tom`,
  };
  for (const id of Object.values(ids)) await h.user(id);
  const created = await h.as(ids.owner).post("/organizations").send({ name: `${prefix}Northwind`, firstTeamName: "Payments" });
  if (created.status !== 201) throw new Error(`org create failed: ${JSON.stringify(created.body)}`);
  const orgId = created.body.id as string;
  for (const [id, role] of [
    [ids.admin, "admin"],
    [ids.lead, "member"],
    [ids.member, "member"],
    [ids.tom, "member"],
  ] as const) {
    await h.identity.addMember(orgId, id, role);
  }
  // Lazy sync on first request brings their memberships in.
  for (const id of [ids.admin, ids.lead, ids.member, ids.tom]) await h.as(id).get("/organizations");

  const teams = await h.as(ids.owner).get(`/organizations/${orgId}/teams`);
  const payments = teams.body[0].id as string;
  await h.as(ids.owner).put(`/organizations/${orgId}/teams/${payments}/members/${ids.lead}`).send({ isLead: true });
  await h.as(ids.owner).put(`/organizations/${orgId}/teams/${payments}/members/${ids.member}`).send({ isLead: false });
  await h.as(ids.owner).put(`/organizations/${orgId}/teams/${payments}/members/${ids.tom}`).send({ isLead: false });
  // Olivia was put on the first team when she created the org; take her off so Leila's team is clean.
  await h.as(ids.owner).delete(`/organizations/${orgId}/teams/${payments}/members/${ids.owner}`);
  const growth = await h.as(ids.owner).post(`/organizations/${orgId}/teams`).send({ name: "Growth" });
  await h.as(ids.owner).put(`/organizations/${orgId}/teams/${growth.body.id}/members/${ids.tom}`).send({ isLead: false });
  h.notifier.clear();
  return { orgId, payments, growth: growth.body.id as string, ...ids };
}

export const THIS_MONDAY = "2026-10-12";
export const NEXT_MONDAY = "2026-10-19";

export const goodTasks = [
  { kind: "main", title: "Expired cards are retried, confirmed on staging", why: "Unblocks the EU launch for 40 customers", estimateHours: 16 },
  { kind: "sub_goal", title: "Retry worker merged with tests", estimateHours: 8 },
  { kind: "gtm", title: "Changelog entry published", estimateHours: 1 },
];
