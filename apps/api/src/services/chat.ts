import type { Conversation, ConversationKind, Message } from "@floppy/shared";
import { and, count, desc, eq, gt, inArray, isNotNull, like, lt, ne, or, sql } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import {
  assignedTasks,
  conversationReads,
  conversations,
  messages,
  organizationMemberships,
  teamMemberships,
  teams,
  users,
  weeklyPlans,
} from "../db/schema.js";
import { forbidden, invalid, notFound } from "../errors.js";
import { displayName, iso, loadPeople, personRef } from "./people.js";
import { approverIds, canRead, type Actor } from "./plans.js";
import type { UserRow } from "./sync.js";
import { getVisibleTask } from "./tasks.js";
import { isUuid, loadTeam } from "./teams.js";

export type ConversationRow = typeof conversations.$inferSelect;

export const dmKeyFor = (a: string, b: string) => [a, b].sort().join("|");

/** Mention tokens look like <@user_123>; the UI renders them as @Name. */
const MENTION_RE = /<@([A-Za-z0-9_]{1,64})>/g;
export function parseMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1]!))];
}

// -- Access -------------------------------------------------------------------------

/** Who belongs to a conversation (receives its notifications, may be mentioned). */
export async function conversationMemberIds(deps: Deps, conv: ConversationRow): Promise<string[]> {
  switch (conv.kind as ConversationKind) {
    case "dm":
      return conv.dmKey!.split("|");
    case "team": {
      const rows = await deps.db
        .select({ userId: teamMemberships.userId })
        .from(teamMemberships)
        .where(eq(teamMemberships.teamId, conv.teamId!));
      return rows.map((r) => r.userId);
    }
    case "task": {
      const [task] = await deps.db.select().from(assignedTasks).where(eq(assignedTasks.id, conv.taskId!));
      if (!task) return [];
      const ids = new Set([task.assigneeId, ...(task.assignedById ? [task.assignedById] : [])]);
      if (task.teamId) {
        const leads = await deps.db
          .select({ userId: teamMemberships.userId })
          .from(teamMemberships)
          .where(and(eq(teamMemberships.teamId, task.teamId), eq(teamMemberships.isLead, true)));
        leads.forEach((l) => ids.add(l.userId));
      }
      return [...ids];
    }
    case "plan": {
      const [plan] = await deps.db.select().from(weeklyPlans).where(eq(weeklyPlans.id, conv.planId!));
      if (!plan) return [];
      const ids = new Set([plan.userId]);
      if (plan.status !== "draft") (await approverIds(deps.db, plan.organizationId, plan.userId)).forEach((id) => ids.add(id));
      return [...ids];
    }
  }
}

/** Throws 404 unless `user` may read and post in this conversation. */
export async function assertAccess(deps: Deps, org: OrgContext, user: UserRow, conv: ConversationRow) {
  const actor: Actor = { userId: user.id, organizationId: org.organizationId, role: org.role };
  let ok = false;
  switch (conv.kind as ConversationKind) {
    case "dm":
      ok = conv.dmKey!.split("|").includes(user.id);
      break;
    case "team":
      ok =
        org.isManager ||
        (
          await deps.db
            .select({ n: count() })
            .from(teamMemberships)
            .where(and(eq(teamMemberships.teamId, conv.teamId!), eq(teamMemberships.userId, user.id)))
        )[0]!.n > 0;
      break;
    case "task":
      ok = await getVisibleTask(deps, org, user.id, conv.taskId!).then(
        () => true,
        () => false,
      );
      break;
    case "plan": {
      const [plan] = await deps.db.select().from(weeklyPlans).where(eq(weeklyPlans.id, conv.planId!));
      ok = !!plan && (await canRead(deps.db, actor, plan));
      break;
    }
  }
  if (!ok) throw notFound("Conversation not found");
}

export async function loadConversation(deps: Deps, org: OrgContext, user: UserRow, conversationId: string) {
  if (!isUuid(conversationId)) throw notFound("Conversation not found");
  const [conv] = await deps.db
    .select()
    .from(conversations)
    .where(and(eq(conversations.organizationId, org.organizationId), eq(conversations.id, conversationId)));
  if (!conv) throw notFound("Conversation not found");
  await assertAccess(deps, org, user, conv);
  return conv;
}

async function findOrCreate(
  deps: Deps,
  orgId: string,
  where: ReturnType<typeof eq>,
  values: typeof conversations.$inferInsert,
): Promise<ConversationRow> {
  const [found] = await deps.db.select().from(conversations).where(and(eq(conversations.organizationId, orgId), where));
  if (found) return found;
  await deps.db.insert(conversations).values(values).onConflictDoNothing();
  const [created] = await deps.db.select().from(conversations).where(and(eq(conversations.organizationId, orgId), where));
  return created!;
}

export async function teamConversation(deps: Deps, org: OrgContext, user: UserRow, teamId: string) {
  await loadTeam(deps.db, org.organizationId, teamId);
  const conv = await findOrCreate(deps, org.organizationId, eq(conversations.teamId, teamId), {
    organizationId: org.organizationId,
    kind: "team",
    teamId,
  });
  await assertAccess(deps, org, user, conv);
  return conv;
}

export async function taskConversation(deps: Deps, org: OrgContext, user: UserRow, taskId: string) {
  const task = await getVisibleTask(deps, org, user.id, taskId);
  return findOrCreate(deps, org.organizationId, eq(conversations.taskId, task.id), {
    organizationId: org.organizationId,
    kind: "task",
    taskId: task.id,
  });
}

export async function planConversation(deps: Deps, org: OrgContext, user: UserRow, planId: string) {
  const actor: Actor = { userId: user.id, organizationId: org.organizationId, role: org.role };
  const [plan] = isUuid(planId)
    ? await deps.db.select().from(weeklyPlans).where(and(eq(weeklyPlans.organizationId, org.organizationId), eq(weeklyPlans.id, planId)))
    : [];
  if (!plan || !(await canRead(deps.db, actor, plan))) throw notFound("Plan not found");
  return findOrCreate(deps, org.organizationId, eq(conversations.planId, plan.id), {
    organizationId: org.organizationId,
    kind: "plan",
    planId: plan.id,
  });
}

export async function openDm(deps: Deps, org: OrgContext, user: UserRow, otherUserId: string) {
  if (otherUserId === user.id) throw invalid("You can't message yourself.", "userId");
  const [other] = await deps.db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, org.organizationId), eq(organizationMemberships.userId, otherUserId)));
  if (!other) throw notFound("Member not found");
  const key = dmKeyFor(user.id, otherUserId);
  return findOrCreate(deps, org.organizationId, eq(conversations.dmKey, key), {
    organizationId: org.organizationId,
    kind: "dm",
    dmKey: key,
  });
}

// -- Listing --------------------------------------------------------------------------

async function unreadCounts(deps: Deps, userId: string, ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await deps.db
    .select({ conversationId: messages.conversationId, n: count() })
    .from(messages)
    .leftJoin(
      conversationReads,
      and(eq(conversationReads.conversationId, messages.conversationId), eq(conversationReads.userId, userId)),
    )
    .where(
      and(
        inArray(messages.conversationId, ids),
        or(sql`${messages.authorId} IS NULL`, ne(messages.authorId, userId)),
        or(sql`${conversationReads.lastReadAt} IS NULL`, gt(messages.createdAt, conversationReads.lastReadAt)),
      ),
    )
    .groupBy(messages.conversationId);
  return new Map(rows.map((r) => [r.conversationId, r.n]));
}

/** Team channels the user can join, plus their DMs, with unread counts. */
export async function listConversations(deps: Deps, org: OrgContext, user: UserRow): Promise<Conversation[]> {
  const teamRows = org.isManager
    ? await deps.db.select().from(teams).where(eq(teams.organizationId, org.organizationId)).orderBy(teams.name)
    : await deps.db
        .select({ id: teams.id, name: teams.name, organizationId: teams.organizationId, description: teams.description, createdAt: teams.createdAt, updatedAt: teams.updatedAt })
        .from(teams)
        .innerJoin(teamMemberships, and(eq(teamMemberships.teamId, teams.id), eq(teamMemberships.userId, user.id)))
        .where(eq(teams.organizationId, org.organizationId))
        .orderBy(teams.name);
  const teamConvs: ConversationRow[] = [];
  for (const team of teamRows) {
    teamConvs.push(
      await findOrCreate(deps, org.organizationId, eq(conversations.teamId, team.id), {
        organizationId: org.organizationId,
        kind: "team",
        teamId: team.id,
      }),
    );
  }
  const dms = await deps.db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, org.organizationId),
        eq(conversations.kind, "dm"),
        or(like(conversations.dmKey, `${user.id}|%`), like(conversations.dmKey, `%|${user.id}`)),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const otherIds = dms.map((d) => d.dmKey!.split("|").find((id) => id !== user.id)!);
  const people = await loadPeople(deps.db, otherIds);
  const unread = await unreadCounts(deps, user.id, [...teamConvs, ...dms].map((c) => c.id));

  const result: Conversation[] = teamConvs.map((c) => ({
    id: c.id,
    kind: "team",
    title: `# ${teamName.get(c.teamId!) ?? "team"}`,
    teamId: c.teamId,
    taskId: null,
    planId: null,
    participants: [],
    unread: unread.get(c.id) ?? 0,
    lastMessageAt: iso(c.lastMessageAt),
  }));
  dms.forEach((c, i) => {
    const other = people.get(otherIds[i]!);
    result.push({
      id: c.id,
      kind: "dm",
      title: other ? displayName(other) : "Former member",
      teamId: null,
      taskId: null,
      planId: null,
      participants: other ? [other] : [],
      unread: unread.get(c.id) ?? 0,
      lastMessageAt: iso(c.lastMessageAt),
    });
  });
  return result;
}

export async function describeConversation(deps: Deps, org: OrgContext, user: UserRow, conv: ConversationRow): Promise<Conversation> {
  const memberIds = await conversationMemberIds(deps, conv);
  const people = await loadPeople(deps.db, memberIds);
  const unread = await unreadCounts(deps, user.id, [conv.id]);
  let title = "Conversation";
  if (conv.kind === "team") {
    const [team] = await deps.db.select({ name: teams.name }).from(teams).where(eq(teams.id, conv.teamId!));
    title = `# ${team?.name ?? "team"}`;
  } else if (conv.kind === "dm") {
    const other = people.get(memberIds.find((id) => id !== user.id) ?? "");
    title = other ? displayName(other) : "Former member";
  } else if (conv.kind === "task") {
    const [task] = await deps.db.select({ title: assignedTasks.title }).from(assignedTasks).where(eq(assignedTasks.id, conv.taskId!));
    title = task?.title ?? "Task";
  } else if (conv.kind === "plan") {
    title = "Plan discussion";
  }
  return {
    id: conv.id,
    kind: conv.kind as ConversationKind,
    title,
    teamId: conv.teamId,
    taskId: conv.taskId,
    planId: conv.planId,
    participants: [...people.values()],
    unread: unread.get(conv.id) ?? 0,
    lastMessageAt: iso(conv.lastMessageAt),
  };
}

function toMessage(row: typeof messages.$inferSelect, people: Map<string, ReturnType<typeof personRef>>): Message {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    conversationId: row.conversationId,
    author: row.authorId ? (people.get(row.authorId) ?? null) : null,
    body: deleted ? "" : row.body,
    mentions: deleted ? [] : row.mentions,
    createdAt: row.createdAt.toISOString(),
    editedAt: iso(row.editedAt),
    deleted,
  };
}

export async function listMessages(deps: Deps, conv: ConversationRow, query: { before?: string; limit: number }) {
  const rows = await deps.db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), query.before ? lt(messages.createdAt, new Date(query.before)) : undefined))
    .orderBy(desc(messages.createdAt))
    .limit(query.limit);
  const people = await loadPeople(deps.db, rows.map((r) => r.authorId));
  return { items: rows.reverse().map((r) => toMessage(r, people)), hasMore: rows.length === query.limit };
}

export async function markRead(deps: Deps, conv: ConversationRow, userId: string) {
  const now = deps.now();
  await deps.db
    .insert(conversationReads)
    .values({ conversationId: conv.id, userId, lastReadAt: now })
    .onConflictDoUpdate({ target: [conversationReads.conversationId, conversationReads.userId], set: { lastReadAt: now } });
  deps.realtime.toUser(userId, "conversation:read", { conversationId: conv.id });
}

export async function postMessage(deps: Deps, org: OrgContext, user: UserRow, conv: ConversationRow, body: string) {
  const members = await conversationMemberIds(deps, conv);
  // Managers can post in any team channel even when they aren't on the team.
  const recipients = members.filter((id) => id !== user.id);
  const mentions = parseMentions(body).filter((id) => members.includes(id) && id !== user.id);
  const now = deps.now();
  const [row] = await deps.db
    .insert(messages)
    .values({ conversationId: conv.id, authorId: user.id, body, mentions, createdAt: now })
    .returning();
  await deps.db.update(conversations).set({ lastMessageAt: now }).where(eq(conversations.id, conv.id));
  await markRead(deps, conv, user.id);

  const message = toMessage(row!, new Map([[user.id, personRef(user)]]));
  deps.realtime.toConversation(conv.id, "message:new", message);
  for (const id of recipients) deps.realtime.toUser(id, "conversation:activity", { conversationId: conv.id, organizationId: org.organizationId });

  const described = await describeConversation(deps, org, user, conv);
  const preview = renderPlain(body, await loadPeople(deps.db, parseMentions(body))).slice(0, 280);
  const url = chatUrl(deps, org.organizationId, conv);
  const nonMentioned = recipients.filter((id) => !mentions.includes(id));
  if (nonMentioned.length) {
    await deps.notifier.trigger("chat-message", nonMentioned, {
      organizationId: org.organizationId,
      conversationId: conv.id,
      conversationTitle: conv.kind === "dm" ? displayName(user) : described.title,
      authorName: displayName(user),
      preview,
      url,
    });
  }
  if (mentions.length) {
    await deps.notifier.trigger("chat-mention", mentions, {
      organizationId: org.organizationId,
      conversationId: conv.id,
      conversationTitle: described.title,
      authorName: displayName(user),
      preview,
      url,
    });
  }
  return message;
}

export async function deleteMessage(deps: Deps, conv: ConversationRow, user: UserRow, messageId: string) {
  if (!isUuid(messageId)) throw notFound("Message not found");
  const [row] = await deps.db
    .select()
    .from(messages)
    .where(and(eq(messages.conversationId, conv.id), eq(messages.id, messageId), isNotNull(messages.authorId)));
  if (!row) throw notFound("Message not found");
  if (row.authorId !== user.id) throw forbidden("You can only delete your own messages.", "MESSAGE_AUTHOR_REQUIRED");
  await deps.db.update(messages).set({ deletedAt: deps.now(), body: "" }).where(eq(messages.id, row.id));
  deps.realtime.toConversation(conv.id, "message:deleted", { id: row.id, conversationId: conv.id });
}

/** Replace mention tokens with names for emails/notifications (plain text only). */
export function renderPlain(body: string, people: Map<string, { firstName: string; lastName: string; email: string }>) {
  return body.replace(MENTION_RE, (_m, id: string) => {
    const p = people.get(id);
    return p ? `@${displayName(p)}` : "@someone";
  });
}

function chatUrl(deps: Deps, orgId: string, conv: ConversationRow) {
  const base = `${deps.config.WEB_ORIGIN}/app/${orgId}`;
  if (conv.kind === "task") return `${base}/tasks/${conv.taskId}`;
  if (conv.kind === "plan") return `${base}/plans/${conv.planId}`;
  return `${base}/chat?c=${conv.id}`;
}

export async function memberIdsInOrg(deps: Deps, orgId: string) {
  const rows = await deps.db
    .select({ id: users.id })
    .from(users)
    .innerJoin(organizationMemberships, eq(organizationMemberships.userId, users.id))
    .where(eq(organizationMemberships.organizationId, orgId));
  return rows.map((r) => r.id);
}
