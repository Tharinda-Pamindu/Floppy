/**
 * Demo data: two organizations, several teams with leads, members in every
 * role, five closed weeks of plans (some shipped, some not), this week's plans
 * in every state, assigned tasks with deadlines, a linked GitHub repo, chat,
 * versioned pages and synthetic AI usage. Plus one staff and one super-admin
 * account.
 *
 *   npm run db:seed            # create (re-running reuses existing accounts)
 *   npm run db:seed -- --reset # delete the demo organizations first, then create
 *
 * Every demo account gets DEMO_PASSWORD from apps/api/.env. Emails use Clerk's
 * "+clerk_test" addresses, so in a Clerk development instance any email
 * verification code is 424242.
 */
import { addWeeks, mondayOf, type OrgRole } from "@floppy/shared";
import { and, eq, inArray } from "drizzle-orm";
import {
  aiUsageEvents,
  assignedTasks,
  conversations,
  messages,
  organizationMemberships,
  organizations,
  orgPages,
  orgPageVersions,
  planReviews,
  planTasks,
  teamMemberships,
  teamRepos,
  teams,
  userSettings,
  weeklyPlans,
} from "../src/db/schema.js";
import { dmKeyFor } from "../src/services/chat.js";
import { upsertUserMirror, type UserRow } from "../src/services/sync.js";
import { bootstrap, flag } from "./_bootstrap.js";

const { deps, config, close } = bootstrap({ quietNotifications: true });
const demoPassword = config.DEMO_PASSWORD;
if (!demoPassword || demoPassword.length < 8) {
  console.error("Set DEMO_PASSWORD (8+ characters) in apps/api/.env first. Every demo account gets it.");
  process.exit(1);
}
const password: string = demoPassword;

const DEMO_ORGS = ["Northwind Labs", "Harbor Health"];
const email = (handle: string) => `${handle}+clerk_test@example.com`;

const PEOPLE = {
  olivia: { first: "Olivia", last: "Okafor" },
  arjun: { first: "Arjun", last: "Mehta" },
  leila: { first: "Leila", last: "Haddad" },
  marco: { first: "Marco", last: "Rossi" },
  tom: { first: "Tom", last: "Becker" },
  priya: { first: "Priya", last: "Nair" },
  dev: { first: "Dev", last: "Kumar" },
  hana: { first: "Hana", last: "Sato" },
  ken: { first: "Ken", last: "Adebayo" },
  lucy: { first: "Lucy", last: "Moreau" },
  staff: { first: "Sam", last: "Support" },
  root: { first: "Rory", last: "Root" },
} as const;
type Handle = keyof typeof PEOPLE;

const users = {} as Record<Handle, UserRow>;

async function ensurePerson(handle: Handle, platformRole: "none" | "staff" | "superadmin" = "none") {
  const p = PEOPLE[handle];
  let remote = await deps.identity.findUserByEmail(email(handle));
  if (!remote) {
    remote = await deps.identity.createUser({ email: email(handle), firstName: p.first, lastName: p.last, password, platformRole });
  } else if (remote.platformRole !== platformRole) {
    await deps.identity.setPlatformRole(remote.id, platformRole);
    remote = { ...remote, platformRole };
  }
  users[handle] = await upsertUserMirror(deps, remote);
  await deps.db.update(userSettings).set({ timezone: "Asia/Colombo" }).where(eq(userSettings.userId, remote.id));
}

async function reset() {
  const existing = await deps.db.select().from(organizations).where(inArray(organizations.name, DEMO_ORGS));
  for (const org of existing) {
    await deps.identity.deleteOrganization(org.id);
    await deps.db.delete(organizations).where(eq(organizations.id, org.id));
    console.log(`  removed ${org.name}`);
  }
}

async function createOrg(name: string, owner: Handle, members: [Handle, OrgRole][]) {
  const remote = await deps.identity.createOrganization({ name, createdBy: users[owner].id });
  await deps.identity.setMemberRole(remote.id, users[owner].id, "owner");
  await deps.db.insert(organizations).values({ id: remote.id, name, createdAt: daysAgo(60) }).onConflictDoNothing();
  await deps.db.insert(organizationMemberships).values({ organizationId: remote.id, userId: users[owner].id, role: "owner", createdAt: daysAgo(60) });
  for (const [handle, role] of members) {
    await deps.identity.addMember(remote.id, users[handle].id, role);
    await deps.db.insert(organizationMemberships).values({ organizationId: remote.id, userId: users[handle].id, role, createdAt: daysAgo(55) });
  }
  return remote.id;
}

async function createTeam(orgId: string, name: string, description: string, lead: Handle, members: Handle[]) {
  const [team] = await deps.db.insert(teams).values({ organizationId: orgId, name, description }).returning();
  await deps.db.insert(teamMemberships).values([
    { organizationId: orgId, teamId: team!.id, userId: users[lead].id, isLead: true },
    ...members.map((m) => ({ organizationId: orgId, teamId: team!.id, userId: users[m].id, isLead: false })),
  ]);
  return team!.id;
}

const now = new Date();
const thisMonday = mondayOf(now);
function daysAgo(n: number) {
  return new Date(now.getTime() - n * 86_400_000);
}
const at = (monday: string, dayOffset: number, hour: number) => {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour);
  return d;
};

interface SeedTask {
  kind: "main" | "sub_goal" | "gtm";
  title: string;
  why?: string;
  hours?: number;
  done?: boolean;
  assignedTaskId?: string;
}

async function plan(
  orgId: string,
  author: Handle,
  weekStart: string,
  status: "draft" | "submitted" | "approved" | "done",
  tasks: SeedTask[],
  extra: { approver?: Handle; shipped?: boolean; note?: string; sentBackBy?: Handle; sentBackComment?: string } = {},
) {
  const [row] = await deps.db
    .insert(weeklyPlans)
    .values({
      organizationId: orgId,
      userId: users[author].id,
      weekStart,
      status,
      submittedAt: status === "draft" ? null : at(weekStart, 0, 6),
      approvedAt: status === "approved" || status === "done" ? at(weekStart, 0, 9) : null,
      approvedById: extra.approver ? users[extra.approver].id : null,
      completedAt: status === "done" ? at(weekStart, 4, 12) : null,
      mainGoalShipped: status === "done" ? (extra.shipped ?? false) : null,
      outcomeNote: status === "done" ? (extra.note ?? null) : null,
      createdAt: at(weekStart, 0, 4),
    })
    .returning();
  await deps.db.insert(planTasks).values(
    tasks.map((t, position) => ({
      planId: row!.id,
      kind: t.kind,
      title: t.title,
      why: t.kind === "main" ? (t.why ?? null) : null,
      estimateHours: t.hours ?? null,
      position,
      isDone: !!t.done,
      doneAt: t.done ? at(weekStart, 3, 10) : null,
      assignedTaskId: t.assignedTaskId ?? null,
    })),
  );
  if (extra.approver && (status === "approved" || status === "done")) {
    await deps.db.insert(planReviews).values({ planId: row!.id, reviewerId: users[extra.approver].id, action: "approved", comment: null, createdAt: at(weekStart, 0, 9) });
  }
  if (extra.sentBackBy) {
    await deps.db.insert(planReviews).values({
      planId: row!.id,
      reviewerId: users[extra.sentBackBy].id,
      action: "changes_requested",
      comment: extra.sentBackComment ?? "Please tighten the scope.",
      createdAt: at(weekStart, 0, 8),
    });
  }
  return row!.id;
}

async function main() {
  console.log("Seeding demo data…");
  if (flag("reset")) {
    console.log("Resetting demo organizations:");
    await reset();
  } else {
    const existing = await deps.db.select().from(organizations).where(inArray(organizations.name, DEMO_ORGS));
    if (existing.length) {
      console.error("Demo organizations already exist. Run with --reset to rebuild them.");
      process.exitCode = 1;
      return;
    }
  }

  for (const handle of Object.keys(PEOPLE) as Handle[]) {
    await ensurePerson(handle, handle === "staff" ? "staff" : handle === "root" ? "superadmin" : "none");
  }

  // -- Northwind Labs ---------------------------------------------------------------
  const nw = await createOrg("Northwind Labs", "olivia", [
    ["arjun", "admin"],
    ["leila", "member"],
    ["marco", "member"],
    ["tom", "member"],
    ["priya", "member"],
    ["dev", "member"],
  ]);
  const payments = await createTeam(nw, "Payments", "Card payments, refunds and billing exports", "leila", ["marco", "tom"]);
  const growth = await createTeam(nw, "Growth", "Onboarding, activation and experiments", "priya", ["tom", "dev"]);

  // Five closed weeks.
  const shippedPattern: Record<string, boolean[]> = {
    marco: [true, true, false, true, true],
    dev: [false, true, true, false, true],
    leila: [true, false, true, true, true],
  };
  for (let w = 5; w >= 1; w--) {
    const monday = addWeeks(thisMonday, -w);
    const idx = 5 - w;
    await plan(nw, "marco", monday, "done", [
      { kind: "main", title: `Refund flow step ${idx + 1} live behind the beta flag`, why: "Support spends 6h/week on manual refunds", hours: 18, done: shippedPattern.marco![idx] },
      { kind: "sub_goal", title: "Integration tests green on staging", hours: 6, done: true },
      { kind: "gtm", title: "Changelog entry published", hours: 1, done: shippedPattern.marco![idx] },
    ], { approver: "leila", shipped: shippedPattern.marco![idx], note: shippedPattern.marco![idx] ? "Shipped Thursday." : "Blocked on the bank sandbox." });
    await plan(nw, "dev", monday, "done", [
      { kind: "main", title: `Onboarding checklist variant ${String.fromCharCode(65 + idx)} running for 10% of sign-ups`, why: "Activation is flat at 31%", hours: 14, done: shippedPattern.dev![idx] },
      { kind: "gtm", title: "Experiment results posted in #growth", hours: 1, done: true },
    ], { approver: "priya", shipped: shippedPattern.dev![idx] });
    await plan(nw, "leila", monday, "done", [
      { kind: "main", title: `Payments on-call runbook section ${idx + 1} reviewed and merged`, why: "New hires can take on-call alone", hours: 10, done: shippedPattern.leila![idx] },
      { kind: "gtm", title: "Runbook linked from the incident bot", hours: 1, done: true },
    ], { approver: "olivia", shipped: shippedPattern.leila![idx] });
    // Tom: shipped early on, then the billing export slips twice (carried-over case).
    const tomShipped = w > 2;
    await plan(nw, "tom", monday, "done", [
      {
        kind: "main",
        title: w <= 2 ? "Enterprise accounts can download billing exports as CSV" : `Invoice PDF footer fix ${idx + 1} deployed`,
        why: w <= 2 ? "Three enterprise customers asked for it this quarter" : "Finance flagged wrong VAT ids",
        hours: w <= 2 ? 24 : 8,
        done: tomShipped,
      },
      { kind: "sub_goal", title: "Export query reviewed by the data team", hours: 4, done: tomShipped },
    ], { approver: "leila", shipped: tomShipped, note: tomShipped ? undefined : "Export still timing out on large accounts." });
  }

  // Assigned tasks (one overdue, one due tomorrow, one pulled into a plan).
  const [refundTask] = await deps.db
    .insert(assignedTasks)
    .values({
      organizationId: nw,
      teamId: payments,
      title: "Refund webhook retries capped at 5 attempts",
      description: "We retried a failing webhook 400 times last week. Cap it and alert after the 5th failure.",
      assigneeId: users.marco.id,
      assignedById: users.leila.id,
      deadline: new Date(now.getTime() + 26 * 3_600_000),
      priority: "high",
      status: "in_progress",
    })
    .returning();
  await deps.db.insert(assignedTasks).values([
    {
      organizationId: nw,
      teamId: payments,
      title: "Expired-card banner copy reviewed with support",
      assigneeId: users.tom.id,
      assignedById: users.leila.id,
      deadline: daysAgo(1),
      priority: "normal",
      status: "todo",
    },
    {
      organizationId: nw,
      teamId: growth,
      title: "Q4 growth experiment shortlist shared",
      description: "Five experiments, each with the metric it moves.",
      assigneeId: users.priya.id,
      assignedById: users.olivia.id,
      deadline: new Date(now.getTime() + 3 * 86_400_000),
      priority: "urgent",
      status: "todo",
    },
  ]);

  // This week, in every state.
  await plan(nw, "marco", thisMonday, "approved", [
    { kind: "main", title: "Partial refunds available to all EU merchants, confirmed in production", why: "Top support request in September", hours: 16, done: false },
    { kind: "sub_goal", title: refundTask!.title, hours: 6, done: false, assignedTaskId: refundTask!.id },
    { kind: "sub_goal", title: "Refund amounts validated against the ledger", hours: 4, done: true },
    { kind: "gtm", title: "Help-centre article on partial refunds published", hours: 2 },
  ], { approver: "leila" });
  await plan(nw, "tom", thisMonday, "draft", [
    { kind: "main", title: "Work on billing exports for enterprise", why: "Customers keep asking", hours: 24 },
    { kind: "sub_goal", title: "Look into the export timeout", hours: 8 },
  ]);
  await plan(nw, "dev", thisMonday, "submitted", [
    { kind: "main", title: "Welcome email A/B test live for all new workspaces", why: "Day-1 retention dropped 4 points", hours: 12 },
    { kind: "sub_goal", title: "Email variants approved by design", hours: 3 },
    { kind: "gtm", title: "Experiment dashboard shared with the team", hours: 2 },
  ]);
  await plan(nw, "leila", thisMonday, "submitted", [
    { kind: "main", title: "Chargeback alerts reach the on-call channel within 5 minutes", why: "We missed two disputes last month", hours: 12 },
    { kind: "gtm", title: "Note in the payments newsletter", hours: 1 },
  ]);

  // GitHub repo (public) linked to Payments.
  const repo = await deps.github.getRepo("octocat", "Hello-World").catch(() => null);
  const [repoRow] = await deps.db
    .insert(teamRepos)
    .values({ organizationId: nw, teamId: payments, owner: repo?.owner ?? "octocat", name: repo?.name ?? "Hello-World", htmlUrl: repo?.htmlUrl ?? "https://github.com/octocat/Hello-World", addedById: users.leila.id })
    .returning();
  const issues = await deps.github.listOpenIssues(repoRow!.owner, repoRow!.name, 1).catch(() => ({ issues: [], hasMore: false }));
  const issue = issues.issues[0];
  if (issue) {
    await deps.db.insert(assignedTasks).values({
      organizationId: nw,
      teamId: payments,
      title: `Triage: ${issue.title}`.slice(0, 300),
      assigneeId: users.tom.id,
      assignedById: users.leila.id,
      deadline: new Date(now.getTime() + 5 * 86_400_000),
      priority: "low",
      githubRepoId: repoRow!.id,
      githubIssueNumber: issue.number,
      githubIssueUrl: issue.url,
      githubIssueTitle: issue.title,
      githubIssueState: issue.state,
      githubSyncedAt: now,
    });
  }

  // Chat: team channel and a DM.
  const [channel] = await deps.db.insert(conversations).values({ organizationId: nw, kind: "team", teamId: payments, lastMessageAt: daysAgo(0.1) }).returning();
  await deps.db.insert(messages).values([
    { conversationId: channel!.id, authorId: users.leila.id, body: "Morning! Plans in by 11 please, I'll review right after standup.", createdAt: daysAgo(2) },
    { conversationId: channel!.id, authorId: users.marco.id, body: `Partial refunds are behind the flag on staging <@${users.leila.id}>`, mentions: [users.leila.id], createdAt: daysAgo(0.5) },
    { conversationId: channel!.id, authorId: users.tom.id, body: "The export timeout is back on the big accounts, digging in.", createdAt: daysAgo(0.1) },
  ]);
  const [dm] = await deps.db.insert(conversations).values({ organizationId: nw, kind: "dm", dmKey: dmKeyFor(users.marco.id, users.leila.id), lastMessageAt: daysAgo(1) }).returning();
  await deps.db.insert(messages).values([
    { conversationId: dm!.id, authorId: users.marco.id, body: "Can the webhook cap slip to Friday?", createdAt: daysAgo(1.1) },
    { conversationId: dm!.id, authorId: users.leila.id, body: "Thursday please, finance is watching it.", createdAt: daysAgo(1) },
  ]);

  // Pages with versions.
  const [overview] = await deps.db
    .insert(orgPages)
    .values({ organizationId: nw, title: "Northwind project overview", slug: "northwind-project-overview", currentVersion: 3, createdById: users.olivia.id, createdAt: daysAgo(30), updatedAt: daysAgo(2) })
    .returning();
  await deps.db.insert(orgPageVersions).values([
    { pageId: overview!.id, version: 1, title: overview!.title, bodyMd: "# Northwind\n\nWe build payments for marketplaces.", changeNote: "Created", authorId: users.olivia.id, createdAt: daysAgo(30) },
    { pageId: overview!.id, version: 2, title: overview!.title, bodyMd: "# Northwind\n\nWe build payments for marketplaces.\n\n## Q4 goals\n- EU partial refunds\n- Enterprise billing exports", changeNote: "Added Q4 goals", authorId: users.olivia.id, createdAt: daysAgo(10) },
    {
      pageId: overview!.id,
      version: 3,
      title: overview!.title,
      bodyMd: "# Northwind\n\nWe build payments for marketplaces.\n\n## Q4 goals\n- [x] EU partial refunds (beta)\n- [ ] Enterprise billing exports\n- [ ] Activation to 35%\n\n## Teams\n| Team | Lead |\n| --- | --- |\n| Payments | Leila |\n| Growth | Priya |",
      changeNote: "Progress and team table",
      authorId: users.arjun.id,
      createdAt: daysAgo(2),
    },
  ]);
  const [runbook] = await deps.db
    .insert(orgPages)
    .values({ organizationId: nw, teamId: payments, parentId: overview!.id, title: "Payments on-call runbook", slug: "payments-on-call-runbook", currentVersion: 1, createdById: users.leila.id })
    .returning();
  await deps.db.insert(orgPageVersions).values({
    pageId: runbook!.id,
    version: 1,
    title: runbook!.title,
    bodyMd: "# On-call\n\n1. Acknowledge the page within 5 minutes.\n2. Check the payments dashboard.\n3. If refunds fail, pause the retry worker.",
    changeNote: "Created",
    authorId: users.leila.id,
  });

  // -- Harbor Health -----------------------------------------------------------------
  const hb = await createOrg("Harbor Health", "hana", [
    ["ken", "member"],
    ["lucy", "member"],
  ]);
  await createTeam(hb, "Clinical apps", "Patient-facing scheduling", "ken", ["lucy", "hana"]);
  for (let w = 3; w >= 1; w--) {
    const monday = addWeeks(thisMonday, -w);
    await plan(hb, "lucy", monday, "done", [
      { kind: "main", title: `Appointment reminders step ${4 - w} sent by SMS`, why: "No-shows cost clinics 12% of slots", hours: 15, done: w !== 2 },
      { kind: "gtm", title: "Clinic newsletter mention", hours: 1, done: true },
    ], { approver: "ken", shipped: w !== 2 });
  }
  await plan(hb, "lucy", thisMonday, "draft", [
    { kind: "main", title: "Improve the booking page", why: "It's slow", hours: 30 },
  ], { sentBackBy: "ken", sentBackComment: "What does 'improve' mean by Friday? Pick one measurable change." });

  // Synthetic AI usage history for the staff console.
  const outcomes: ["succeeded" | "failed" | "rate_limited", string | null][] = [
    ["succeeded", null], ["succeeded", null], ["succeeded", null], ["failed", "timeout"], ["rate_limited", "local_limit"], ["succeeded", null], ["failed", "provider_http_503"],
  ];
  const usage = [];
  for (let i = 0; i < 28; i++) {
    const [outcome, errorKind] = outcomes[i % outcomes.length]!;
    usage.push({
      organizationId: i % 4 === 0 ? hb : nw,
      userId: (i % 4 === 0 ? users.lucy : i % 2 ? users.marco : users.tom).id,
      operation: i % 3 === 0 ? "plan_draft" : "plan_review",
      outcome,
      errorKind,
      model: "llama-3.3-70b-versatile",
      latencyMs: 900 + ((i * 137) % 2400),
      inputTokens: outcome === "succeeded" ? 700 + i * 11 : null,
      outputTokens: outcome === "succeeded" ? 300 + i * 7 : null,
      createdAt: daysAgo(i / 2),
    });
  }
  await deps.db.insert(aiUsageEvents).values(usage);

  console.log("\n✔ Demo data ready. Sign in at http://localhost:3000/sign-in with password DEMO_PASSWORD:\n");
  const rows: [string, Handle, string][] = [
    ["Member (Payments)", "marco", "app"],
    ["Team lead (Payments)", "leila", "app"],
    ["Org owner (Northwind)", "olivia", "app"],
    ["Org admin (Northwind)", "arjun", "app"],
    ["Lead (Growth) with a task due soon", "priya", "app"],
    ["Member with carried-over work", "tom", "app"],
    ["Owner of Harbor Health", "hana", "app"],
    ["Platform staff", "staff", "/staff"],
    ["Super admin", "root", "/staff/super"],
  ];
  for (const [who, handle, where] of rows) console.log(`  ${who.padEnd(38)} ${email(handle).padEnd(40)} ${where}`);
  console.log("\n  (Clerk dev instances accept verification code 424242 for +clerk_test emails.)");
}

try {
  await main();
} catch (err) {
  console.error("✖ Seed failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await close();
}

export { and };
