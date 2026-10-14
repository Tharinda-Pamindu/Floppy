import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { organizations, teams, weeklyPlans } from "../src/db/schema.js";
import { deadlineState, runDeadlineReminders, runWeeklyReminders, weeklyReminderDue } from "../src/jobs/reminders.js";
import { handleClerkEvent } from "../src/services/webhooks.js";
import { createHarness, goodTasks, type Harness, seedOrg, THIS_MONDAY } from "./harness.js";

let h: Harness;
let o: Awaited<ReturnType<typeof seedOrg>>;
const url = (p: string) => `/organizations/${o.orgId}${p}`;

beforeAll(async () => {
  h = await createHarness();
  o = await seedOrg(h);
  await h.user("root", { platformRole: "superadmin" });
  await h.user("staffy", { platformRole: "staff" });
});
afterAll(() => h.close());

describe("staff console rules", () => {
  it("staff can't deactivate an organization owner or another staff member", async () => {
    const owner = await h.as("staffy").patch(`/staff/users/${o.owner}`).send({ isActive: false });
    expect(owner.status).toBe(403);
    expect(owner.body.error.code).toBe("SUPERADMIN_REQUIRED");
    expect((await h.as("staffy").patch("/staff/users/root").send({ isActive: false })).status).toBe(403);
    expect((await h.as("staffy").patch("/staff/users/staffy").send({ isActive: false })).status).toBe(409);
  });

  it("staff deactivate a regular customer, which ends their access", async () => {
    expect((await h.as("staffy").patch(`/staff/users/${o.tom}`).send({ isActive: false })).status).toBe(200);
    expect(h.identity.users.get(o.tom)?.banned).toBe(true);
    expect((await h.as(o.tom).get("/me")).status).toBe(403);
    await h.as("staffy").patch(`/staff/users/${o.tom}`).send({ isActive: true });
    expect((await h.as(o.tom).get("/me")).status).toBe(200);
  });

  it("staff create customer accounts only", async () => {
    const res = await h.as("staffy").post("/staff/users").send({ firstName: "Cara", lastName: "Customer", email: "cara@example.test", password: "correct-horse-1" });
    expect(res.status).toBe(201);
    expect(res.body.platformRole).toBe("none");
  });
});

describe("super admin", () => {
  it("creates a staff account and shows the generated password once", async () => {
    const res = await h.as("root").post("/staff/super/staff").send({ firstName: "Nia", lastName: "Ops", email: "nia@floppy.test" });
    expect(res.status).toBe(201);
    expect(res.body.password).toHaveLength(24);
    const list = await h.as("root").get("/staff/super/staff");
    expect(list.body.map((s: { email: string }) => s.email)).toContain("nia@floppy.test");
    const audit = await h.as("root").get("/staff/super/audit");
    expect(audit.body[0].action).toBe("staff.create");
  });

  it("suspends an owner's account (ban + email) and reinstates it", async () => {
    const owners = await h.as("root").get("/staff/super/owners");
    expect(owners.body.map((r: { id: string }) => r.id)).toContain(o.owner);
    expect((await h.as("root").post(`/staff/super/owners/${o.owner}/suspend`).send({})).status).toBe(422);
    expect((await h.as("root").post(`/staff/super/owners/${o.owner}/suspend`).send({ reason: "Fraud report" })).status).toBe(204);
    expect(h.identity.users.get(o.owner)?.banned).toBe(true);
    expect((await h.as(o.owner).get("/me")).status).toBe(403);
    expect(h.notifier.of("account-suspended").at(-1)?.payload.suspended).toBe(true);
    expect((await h.as("root").post(`/staff/super/owners/${o.owner}/suspend`).send({ reason: "again" })).status).toBe(409);
    expect((await h.as("root").post(`/staff/super/owners/${o.owner}/reinstate`)).status).toBe(204);
    expect((await h.as(o.owner).get("/me")).status).toBe(200);
  });

  it("only owners request deletion, once at a time; reject keeps the org", async () => {
    expect((await h.as(o.admin).post(url("/deletion-request")).send({ reason: "Closing" })).status).toBe(403);
    expect((await h.as(o.owner).post(url("/deletion-request")).send({ reason: "We're closing the company" })).status).toBe(201);
    expect(h.notifier.of("org-deletion-requested").at(-1)?.to).toEqual(["root"]);
    expect((await h.as(o.owner).post(url("/deletion-request")).send({ reason: "again" })).status).toBe(409);
    const pending = await h.as("root").get("/staff/super/deletion-requests?status=pending");
    const request = pending.body[0];
    expect(request.counts.teams).toBe(2);
    expect((await h.as("root").post(`/staff/super/deletion-requests/${request.id}/decision`).send({ decision: "reject" })).status).toBe(422);
    await h.as("root").post(`/staff/super/deletion-requests/${request.id}/decision`).send({ decision: "reject", note: "Export your data first" });
    expect((await h.as(o.member).get(url(""))).status).toBe(200);
    expect(h.notifier.of("org-deletion-decided").at(-1)?.payload).toMatchObject({ approved: false, note: "Export your data first" });
  });

  it("approving a deletion removes the organization and every tenant row", async () => {
    await h.as(o.member).post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: goodTasks });
    await h.as(o.owner).post(url("/pages")).send({ title: "Doomed", bodyMd: "bye" });
    await h.as(o.owner).post(url("/deletion-request")).send({ reason: "Done for real" });
    const [request] = (await h.as("root").get("/staff/super/deletion-requests?status=pending")).body;
    expect((await h.as("root").post(`/staff/super/deletion-requests/${request.id}/decision`).send({ decision: "approve" })).status).toBe(204);
    expect(h.identity.orgs.has(o.orgId)).toBe(false);
    expect(await h.db.select().from(organizations).where(eq(organizations.id, o.orgId))).toHaveLength(0);
    expect(await h.db.select().from(teams).where(eq(teams.organizationId, o.orgId))).toHaveLength(0);
    expect(await h.db.select().from(weeklyPlans).where(eq(weeklyPlans.organizationId, o.orgId))).toHaveLength(0);
    expect((await h.as(o.member).get(url(""))).status).toBe(404);
    const audit = await h.as("root").get("/staff/super/audit");
    expect(audit.body[0].action).toBe("organization.delete");
  });
});

describe("reminders", () => {
  it("knows when weekly reminders are due", () => {
    expect(weeklyReminderDue({ weekday: 1, hour: 9 })).toBe("weekly-plan");
    expect(weeklyReminderDue({ weekday: 5, hour: 16 })).toBe("week-close");
    expect(weeklyReminderDue({ weekday: 1, hour: 10 })).toBeNull();
  });

  it("computes deadline states for each lead time", () => {
    const now = new Date("2026-10-14T10:00:00Z");
    const in2h = new Date("2026-10-14T12:00:00Z");
    expect(deadlineState(in2h, "1h", now)).toBe("none");
    expect(deadlineState(in2h, "1d", now)).toBe("reminder");
    expect(deadlineState(new Date("2026-10-16T09:00:00Z"), "3d", now)).toBe("reminder");
    expect(deadlineState(new Date("2026-10-14T09:59:00Z"), "1h", now)).toBe("overdue");
  });

  it("sends Monday 09:00 local reminders once, honouring each person's time zone", async () => {
    const r = await createHarness({ now: new Date("2026-10-12T03:30:00Z") }); // 09:00 in Colombo
    const org = await seedOrg(r);
    await r.as(org.member).patch("/me/settings").send({ timezone: "Asia/Colombo" });
    r.notifier.clear();
    expect(await runWeeklyReminders(r.deps)).toBe(1);
    expect(r.notifier.of("weekly-plan-reminder")[0]?.to).toEqual([org.member]);
    expect(await runWeeklyReminders(r.deps)).toBe(0); // idempotent
    await r.close();
  });

  it("sends deadline reminders by the assignee's lead time, re-arms on a new deadline, then flags overdue", async () => {
    const r = await createHarness({ now: new Date("2026-10-14T10:00:00Z") });
    const org = await seedOrg(r);
    await r.as(org.member).patch("/me/settings").send({ deadlineLead: "3d" });
    const task = await r.as(org.lead).post(`/organizations/${org.orgId}/tasks`).send({ title: "Ship", assigneeId: org.member, deadline: "2026-10-16T09:00:00Z" });
    r.notifier.clear();
    expect(await runDeadlineReminders(r.deps)).toBe(1);
    expect(r.notifier.of("task-deadline-reminder")[0]?.to).toEqual([org.member]);
    expect(await runDeadlineReminders(r.deps)).toBe(0);
    // Moving the deadline re-arms the reminder.
    await r.as(org.lead).patch(`/organizations/${org.orgId}/tasks/${task.body.id}`).send({ deadline: "2026-10-15T09:00:00Z" });
    expect(await runDeadlineReminders(r.deps)).toBe(1);
    // After the deadline: overdue goes to the assignee and the assigner.
    r.clock.now = new Date("2026-10-15T10:00:00Z");
    r.notifier.clear();
    expect(await runDeadlineReminders(r.deps)).toBe(1);
    expect(r.notifier.of("task-overdue")[0]?.to).toEqual([org.member, org.lead]);
    await r.close();
  });
});

describe("Clerk webhooks", () => {
  it("routes Clerk's verification emails through Novu when enabled", async () => {
    h.notifier.clear();
    await handleClerkEvent(h.deps, {
      type: "email.created",
      data: {
        slug: "verification_code",
        to_email_address: "new@example.test",
        delivered_by_clerk: false,
        data: { otp_code: "424242" },
        user_id: null,
      },
    } as never);
    const sent = h.notifier.of("auth-verification-code")[0]!;
    expect(sent.to).toEqual(["email:new@example.test"]);
    expect(sent.payload.code).toBe("424242");
  });

  it("creates the user mirror and Novu subscriber on user.created, with a welcome", async () => {
    h.identity.addUser({ id: "hook_user", email: "hook@example.test" });
    await handleClerkEvent(h.deps, { type: "user.created", data: { id: "hook_user" } } as never);
    expect(h.notifier.subscribers.get("hook_user")?.email).toBe("hook@example.test");
    expect(h.notifier.of("welcome").some((s) => s.to.includes("hook_user"))).toBe(true);
  });
});

describe("me and notification settings", () => {
  it("validates settings and syncs the phone to the subscriber", async () => {
    expect((await h.as(o.tom).patch("/me/settings").send({ phone: "0771234567" })).status).toBe(422);
    expect((await h.as(o.tom).patch("/me/settings").send({ timezone: "Mars/Olympus" })).status).toBe(422);
    const ok = await h.as(o.tom).patch("/me/settings").send({ phone: "+94771234567", deadlineLead: "1h" });
    expect(ok.body.settings).toMatchObject({ phone: "+94771234567", deadlineLead: "1h" });
    expect(h.notifier.subscribers.get(o.tom)?.phone).toBe("+94771234567");
  });

  it("sends a test notification on every channel", async () => {
    const res = await h.as(o.tom).post("/me/notifications/test");
    expect(res.body.channels).toEqual({ inApp: true, email: true, sms: true });
    expect(h.notifier.of("test-notification").at(-1)?.payload.hasPhone).toBe(true);
  });

  it("returns an HMAC-signed inbox session", async () => {
    const res = await h.as(o.tom).get("/me/notifications/session");
    expect(res.body).toMatchObject({ subscriberId: o.tom, applicationIdentifier: "app_test" });
  });
});
