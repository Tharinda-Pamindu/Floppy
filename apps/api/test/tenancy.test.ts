import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, goodTasks, type Harness, seedOrg, THIS_MONDAY } from "./harness.js";

let h: Harness;
let a: Awaited<ReturnType<typeof seedOrg>>;
let b: Awaited<ReturnType<typeof seedOrg>>;
let planA: string;
let taskA: string;
let pageA: string;

beforeAll(async () => {
  h = await createHarness();
  a = await seedOrg(h, "a_");
  b = await seedOrg(h, "b_");
  const plan = await h.as(a.member).post(`/organizations/${a.orgId}/plans`).send({ weekStart: THIS_MONDAY, tasks: goodTasks });
  planA = plan.body.id;
  const task = await h
    .as(a.lead)
    .post(`/organizations/${a.orgId}/tasks`)
    .send({ title: "Fix flaky test", assigneeId: a.member, deadline: "2026-10-16T17:00:00Z" });
  taskA = task.body.id;
  const page = await h.as(a.owner).post(`/organizations/${a.orgId}/pages`).send({ title: "Project overview", bodyMd: "# Hello" });
  pageA = page.body.id;
});
afterAll(() => h.close());

describe("authentication", () => {
  it("refuses signed-out requests", async () => {
    expect((await h.as(null).get("/me")).status).toBe(401);
    expect((await h.as(null).get(`/organizations/${a.orgId}`)).status).toBe(401);
  });

  it("refuses a deactivated account even with a valid session", async () => {
    await h.user("banned_bob", { banned: true });
    const res = await h.as("banned_bob").get("/me");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DISABLED");
  });
});

describe("cross-organization access looks like nothing exists (404)", () => {
  const routes = () =>
    [
      ["get", `/organizations/${a.orgId}`],
      ["patch", `/organizations/${a.orgId}`, { name: "Hacked" }],
      ["get", `/organizations/${a.orgId}/members`],
      ["get", `/organizations/${a.orgId}/teams`],
      ["get", `/organizations/${a.orgId}/teams/${a.payments}`],
      ["get", `/organizations/${a.orgId}/teams/${a.payments}/weeks/${THIS_MONDAY}`],
      ["put", `/organizations/${a.orgId}/teams/${a.payments}/members/${b.member}`, { isLead: true }],
      ["get", `/organizations/${a.orgId}/plans`],
      ["get", `/organizations/${a.orgId}/plans/${planA}`],
      ["post", `/organizations/${a.orgId}/plans/${planA}/approve`, {}],
      ["get", `/organizations/${a.orgId}/approvals`],
      ["get", `/organizations/${a.orgId}/tasks/${taskA}`],
      ["get", `/organizations/${a.orgId}/pages/${pageA}`],
      ["get", `/organizations/${a.orgId}/conversations`],
      ["post", `/organizations/${a.orgId}/invites`, { email: "x@example.test", role: "admin" }],
    ] as const;

  it("answers 404 to another org's owner on every org route", async () => {
    for (const [method, url, body] of routes()) {
      const res = await h.as(b.owner)[method](url).send(body ?? {});
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(404);
    }
  });

  it("answers 404 for another org's ids used inside your own org", async () => {
    const own = b.orgId;
    expect((await h.as(b.owner).get(`/organizations/${own}/plans/${planA}`)).status).toBe(404);
    expect((await h.as(b.owner).get(`/organizations/${own}/teams/${a.payments}`)).status).toBe(404);
    expect((await h.as(b.owner).get(`/organizations/${own}/tasks/${taskA}`)).status).toBe(404);
    expect((await h.as(b.owner).get(`/organizations/${own}/pages/${pageA}`)).status).toBe(404);
    // Adding someone from another org to your team is refused.
    expect((await h.as(b.owner).put(`/organizations/${own}/teams/${b.payments}/members/${a.member}`).send({ isLead: false })).status).toBe(404);
  });

  it("answers 404 for a made-up organization id", async () => {
    expect((await h.as(a.owner).get("/organizations/org_does_not_exist")).status).toBe(404);
  });
});

describe("roles inside one organization", () => {
  it("a member can't act as an admin", async () => {
    const m = h.as(a.member);
    expect((await m.patch(`/organizations/${a.orgId}`).send({ name: "Mine" })).status).toBe(403);
    expect((await m.post(`/organizations/${a.orgId}/teams`).send({ name: "Rogue" })).status).toBe(403);
    expect((await m.post(`/organizations/${a.orgId}/invites`).send({ email: "x@example.test", role: "member" })).status).toBe(403);
    expect((await m.patch(`/organizations/${a.orgId}/members/${a.tom}`).send({ role: "admin" })).status).toBe(403);
  });

  it("an org admin can't touch owners or grant ownership", async () => {
    const res = await h.as(a.admin).patch(`/organizations/${a.orgId}/members/${a.member}`).send({ role: "owner" });
    expect(res.status).toBe(403);
    expect((await h.as(a.admin).delete(`/organizations/${a.orgId}/members/${a.owner}`)).status).toBe(403);
  });

  it("the last owner can't step down or leave", async () => {
    const res = await h.as(a.owner).delete(`/organizations/${a.orgId}/membership`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_OWNER");
  });

  it("a non-lead can't see a team's week", async () => {
    const res = await h.as(a.member).get(`/organizations/${a.orgId}/teams/${a.payments}/weeks/${THIS_MONDAY}`);
    expect(res.status).toBe(403);
  });
});

describe("platform staff vs org admins", () => {
  it("customers (even owners) get 404 from the staff console and the super-admin page", async () => {
    expect((await h.as(a.owner).get("/staff/overview")).status).toBe(404);
    expect((await h.as(a.admin).get("/staff/organizations")).status).toBe(404);
    expect((await h.as(a.owner).get("/staff/super/staff")).status).toBe(404);
  });

  it("staff get 404 from the hidden super-admin page", async () => {
    await h.user("sam_staff", { platformRole: "staff" });
    expect((await h.as("sam_staff").get("/staff/overview")).status).toBe(200);
    expect((await h.as("sam_staff").get("/staff/super/staff")).status).toBe(404);
    expect((await h.as("sam_staff").get("/staff/super/deletion-requests")).status).toBe(404);
  });

  it("staff never see plan, chat or page content in org detail", async () => {
    const res = await h.as("sam_staff").get(`/staff/organizations/${a.orgId}`);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain("Expired cards");
    expect(text).not.toContain("# Hello");
    expect(res.body.organization.planCount).toBe(1);
  });
});

describe("suspension", () => {
  it("locks members out with 403 ORGANIZATION_SUSPENDED and back in when reinstated", async () => {
    await h.user("sue_staff", { platformRole: "staff" });
    expect((await h.as("sue_staff").post(`/staff/organizations/${b.orgId}/suspend`).send({ reason: "Unpaid" })).status).toBe(200);
    const res = await h.as(b.member).get(`/organizations/${b.orgId}/plans`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ORGANIZATION_SUSPENDED");
    expect(h.notifier.of("org-suspended").length).toBe(1);
    await h.as("sue_staff").post(`/staff/organizations/${b.orgId}/reinstate`);
    expect((await h.as(b.member).get(`/organizations/${b.orgId}/plans`)).status).toBe(200);
  });
});

describe("route meta-test", () => {
  it("every route under /organizations/:orgId passes through orgContext first", () => {
    const stack = (h.orgRouter as unknown as { stack: { handle: { isOrgContext?: boolean } }[] }).stack;
    expect(stack[0]?.handle.isOrgContext).toBe(true);
  });
});
