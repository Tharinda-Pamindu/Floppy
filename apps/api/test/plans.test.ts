import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, goodTasks, type Harness, NEXT_MONDAY, seedOrg, THIS_MONDAY } from "./harness.js";

let h: Harness;
let o: Awaited<ReturnType<typeof seedOrg>>;
const url = (p: string) => `/organizations/${o.orgId}${p}`;

beforeAll(async () => {
  h = await createHarness();
  o = await seedOrg(h);
});
afterAll(() => h.close());

describe("creating plans", () => {
  it("only allows last, this or next week, and only Mondays", async () => {
    expect((await h.as(o.member).post(url("/plans")).send({ weekStart: "2026-10-13", tasks: [] })).status).toBe(422);
    const far = await h.as(o.member).post(url("/plans")).send({ weekStart: "2026-11-02", tasks: [] });
    expect(far.status).toBe(422);
    expect(far.body.error.message).toMatch(/last week, this week or next week/);
  });

  it("allows one plan per person per week", async () => {
    expect((await h.as(o.member).post(url("/plans")).send({ weekStart: NEXT_MONDAY, tasks: [] })).status).toBe(201);
    const again = await h.as(o.member).post(url("/plans")).send({ weekStart: NEXT_MONDAY, tasks: [] });
    expect(again.status).toBe(409);
  });

  it("rejects two main tasks and a why on a non-main task", async () => {
    const two = await h.as(o.tom).post(url("/plans")).send({
      weekStart: THIS_MONDAY,
      tasks: [
        { kind: "main", title: "A" },
        { kind: "main", title: "B" },
      ],
    });
    expect(two.status).toBe(422);
    const why = await h.as(o.tom).post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: [{ kind: "gtm", title: "A", why: "no" }] });
    expect(why.status).toBe(422);
  });

  it("keeps task ids stable when tasks are edited", async () => {
    const created = await h.as(o.tom).post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: goodTasks });
    expect(created.status).toBe(201);
    const ids = created.body.tasks.map((t: { id: string }) => t.id);
    const edited = await h
      .as(o.tom)
      .put(url(`/plans/${created.body.id}`))
      .send({
        tasks: [
          { ...goodTasks[0], id: ids[0], title: "Retried cards succeed, confirmed on staging" },
          { ...goodTasks[2], id: ids[2] },
        ],
      });
    expect(edited.status).toBe(200);
    expect(edited.body.tasks.map((t: { id: string }) => t.id)).toEqual([ids[0], ids[2]]);
    expect(edited.body.tasks[0].title).toMatch(/Retried cards/);
  });
});

describe("the approval workflow", () => {
  let planId: string;

  it("drafts are private: the lead can't open a draft (404)", async () => {
    const created = await h.as(o.member).post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: goodTasks.slice(1) });
    planId = created.body.id;
    expect((await h.as(o.lead).get(url(`/plans/${planId}`))).status).toBe(404);
  });

  it("can't be submitted without a main task and a why", async () => {
    const res = await h.as(o.member).post(url(`/plans/${planId}/submit`));
    expect(res.status).toBe(422);
    expect(res.body.error.message).toMatch(/main task/);
    await h.as(o.member).put(url(`/plans/${planId}`)).send({ tasks: [{ kind: "main", title: "Ship it" }] });
    const noWhy = await h.as(o.member).post(url(`/plans/${planId}/submit`));
    expect(noWhy.body.error.message).toMatch(/why the main task matters/);
  });

  it("submits, notifies the approvers and becomes visible to the lead", async () => {
    await h.as(o.member).put(url(`/plans/${planId}`)).send({ tasks: goodTasks });
    const res = await h.as(o.member).post(url(`/plans/${planId}/submit`));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("submitted");
    expect(h.notifier.of("plan-submitted")[0]?.to).toEqual([o.lead]);
    expect(h.notifier.of("approval-overdue")[0]?.to).toEqual([o.lead]);
    const asLead = await h.as(o.lead).get(url(`/plans/${planId}`));
    expect(asLead.status).toBe(200);
    expect(asLead.body.permissions.review).toBe(true);
    expect(asLead.body.permissions.edit).toBe(false);
  });

  it("a non-lead member and an org admin can't approve a member's plan", async () => {
    expect((await h.as(o.tom).post(url(`/plans/${planId}/approve`)).send({})).status).toBe(404);
    const admin = await h.as(o.admin).post(url(`/plans/${planId}/approve`)).send({});
    expect(admin.status).toBe(404); // not a possible approver → can't even read it
  });

  it("can't be edited once submitted", async () => {
    const res = await h.as(o.member).put(url(`/plans/${planId}`)).send({ tasks: goodTasks });
    expect(res.status).toBe(409);
  });

  it("sending back needs a comment and returns the plan to draft", async () => {
    expect((await h.as(o.lead).post(url(`/plans/${planId}/request-changes`)).send({ comment: "" })).status).toBe(422);
    const res = await h.as(o.lead).post(url(`/plans/${planId}/request-changes`)).send({ comment: "Split the retry work" });
    expect(res.status).toBe(200);
    expect(h.notifier.of("plan-changes-requested")[0]?.payload.comment).toBe("Split the retry work");
    const mine = await h.as(o.member).get(url(`/plans/${planId}`));
    expect(mine.body.status).toBe("draft");
    expect(mine.body.reviews[0].action).toBe("changes_requested");
  });

  it("tasks can't be ticked before approval", async () => {
    const plan = await h.as(o.member).get(url(`/plans/${planId}`));
    const res = await h.as(o.member).patch(url(`/plans/${planId}/tasks/${plan.body.tasks[0].id}`)).send({ isDone: true });
    expect(res.status).toBe(409);
  });

  it("approves, then the author ticks tasks and closes the week", async () => {
    await h.as(o.member).post(url(`/plans/${planId}/submit`));
    const approved = await h.as(o.lead).post(url(`/plans/${planId}/approve`)).send({ comment: "Go" });
    expect(approved.body.status).toBe("approved");
    expect(h.notifier.of("plan-approved").length).toBe(1);
    const plan = await h.as(o.member).get(url(`/plans/${planId}`));
    const tick = await h.as(o.member).patch(url(`/plans/${planId}/tasks/${plan.body.tasks[0].id}`)).send({ isDone: true });
    expect(tick.body.tasks[0].isDone).toBe(true);
    expect((await h.as(o.member).post(url(`/plans/${planId}/complete`)).send({})).status).toBe(422);
    const done = await h.as(o.member).post(url(`/plans/${planId}/complete`)).send({ mainGoalShipped: true, outcomeNote: "Live" });
    expect(done.body.status).toBe("done");
    expect(done.body.mainGoalShipped).toBe(true);
  });

  it("nobody approves their own plan", async () => {
    const own = await h.as(o.lead).post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: goodTasks });
    await h.as(o.lead).post(url(`/plans/${own.body.id}/submit`));
    const res = await h.as(o.lead).post(url(`/plans/${own.body.id}/approve`)).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("SELF_APPROVAL");
  });

  it("a lead's own plan is approved by an owner or admin", async () => {
    const queue = await h.as(o.admin).get(url("/approvals"));
    expect(queue.body.map((p: { author: { id: string } }) => p.author.id)).toContain(o.lead);
    const plan = queue.body.find((p: { author: { id: string } }) => p.author.id === o.lead);
    expect((await h.as(o.admin).post(url(`/plans/${plan.id}/approve`)).send({})).status).toBe(200);
  });

  it("can't be submitted when nobody can approve it", async () => {
    await h.user("lonely");
    await h.identity.addMember(o.orgId, "lonely", "member");
    await h.as("lonely").get("/organizations");
    const created = await h.as("lonely").post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: goodTasks });
    const res = await h.as("lonely").post(url(`/plans/${created.body.id}/submit`));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("NO_APPROVER");
  });
});

describe("team week and history", () => {
  it("shows the lead each member's status, hiding draft content", async () => {
    const res = await h.as(o.lead).get(url(`/teams/${o.payments}/weeks/${THIS_MONDAY}`));
    expect(res.status).toBe(200);
    const tom = res.body.find((r: { member: { id: string } }) => r.member.id === o.tom);
    expect(tom.plan.status).toBe("draft");
    expect(tom.plan.readable).toBe(false);
    expect(tom.plan.mainTaskTitle).toBeNull();
    const marco = res.body.find((r: { member: { id: string } }) => r.member.id === o.member);
    expect(marco.plan.readable).toBe(true);
    expect(marco.plan.mainGoalShipped).toBe(true);
  });

  it("rolls up history per week", async () => {
    const res = await h.as(o.owner).get(url(`/teams/${o.payments}/weeks`));
    expect(res.status).toBe(200);
    const week = res.body.items.find((w: { weekStart: string }) => w.weekStart === THIS_MONDAY);
    expect(week).toMatchObject({ closed: 1, shipped: 1 });
  });
});

describe("AI review and draft", () => {
  it("maps findings back to task ids, drops invented refs and forces 'adjust' on must-fix", async () => {
    const plan = await h.as(o.member).post(url("/plans")).send({ weekStart: "2026-10-05", tasks: goodTasks });
    h.ai.next = {
      verdict: "approve",
      summary: "Close, but the GTM task is thin.",
      findings: [
        { task_ref: "GTM1", issue: "not_checkable", severity: "must_fix", problem: "Who reads it?", field: "title", suggested_rewrite: "Changelog entry live, linked from the app" },
        { task_ref: "SG7", issue: "unclear", severity: "consider", problem: "ghost", field: "title", suggested_rewrite: "x" },
        { task_ref: "MAIN", issue: "missing_why", severity: "consider", problem: "Sharpen", field: "why", suggested_rewrite: "EU customers can pay" },
      ],
    };
    const res = await h.as(o.member).post(url(`/plans/${plan.body.id}/ai-review`));
    expect(res.status).toBe(200);
    const review = res.body.aiReview;
    expect(review.verdict).toBe("adjust");
    expect(review.findings).toHaveLength(2);
    expect(review.findings[0].taskId).toBe(plan.body.tasks[2].id);
    expect(review.findings[1].field).toBe("why");
    expect(review.isStale).toBe(false);
    // The model never saw names, emails or ids.
    const prompt = h.ai.prompts.at(-1)!;
    expect(prompt).not.toContain(o.member);
    expect(prompt).not.toContain(plan.body.tasks[0].id);
    // Editing makes the review stale.
    await h.as(o.member).put(url(`/plans/${plan.body.id}`)).send({ tasks: plan.body.tasks.map((t: object) => ({ ...t, title: "Changed" })).slice(0, 1) });
    const after = await h.as(o.member).get(url(`/plans/${plan.body.id}`));
    expect(after.body.aiReview.isStale).toBe(true);
  });

  it("turns provider failures into plain-words errors and logs every call", async () => {
    const plan = await h.as(o.admin).post(url("/plans")).send({ weekStart: THIS_MONDAY, tasks: goodTasks });
    const { AiProviderError } = await import("../src/ports.js");
    for (const [kind, status] of [
      ["timeout", 504],
      ["rate_limited", 429],
      ["provider_http", 503],
      ["invalid_output", 502],
    ] as const) {
      h.ai.fail = new AiProviderError(kind, "x", 500);
      const res = await h.as(o.admin).post(url(`/plans/${plan.body.id}/ai-review`));
      expect(res.status, kind).toBe(status);
    }
    h.ai.fail = null;
    // 4 calls this minute + 2 more = the 6/minute limit, then refused locally.
    h.ai.next = { verdict: "approve", summary: "Fine", findings: [] };
    await h.as(o.admin).post(url(`/plans/${plan.body.id}/ai-review`));
    await h.as(o.admin).post(url(`/plans/${plan.body.id}/ai-review`));
    const limited = await h.as(o.admin).post(url(`/plans/${plan.body.id}/ai-review`));
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("AI_RATE_LIMITED");
    await h.user("ai_staff", { platformRole: "staff" });
    const usage = await h.as("ai_staff").get("/staff/ai-usage/summary?days=7");
    const row = usage.body.find((r: { organizationId: string }) => r.organizationId === o.orgId);
    expect(row.failed).toBeGreaterThanOrEqual(3);
    expect(row.rateLimited).toBeGreaterThanOrEqual(2);
  });

  it("drafts from notes without saving anything", async () => {
    h.ai.next = {
      main_task: { title: "Webhook retries stop double-charging, confirmed on staging", why: "Stops refunds" },
      sub_goals: [{ title: "Idempotency key stored", estimate_hours: 4 }],
      gtm_goals: [{ title: "Changelog entry" }],
      left_out: ["office move"],
    };
    const before = await h.as(o.tom).get(url("/plans"));
    const res = await h.as(o.tom).post(url("/ai/plan-drafts")).send({ notes: "webhooks double charge, fix it, also office move" });
    expect(res.status).toBe(200);
    expect(res.body.mainTask.title).toMatch(/Webhook/);
    const after = await h.as(o.tom).get(url("/plans"));
    expect(after.body.total).toBe(before.body.total);
  });

  it("answers 503 when AI isn't configured", async () => {
    const off = await createHarness({ aiEnabled: false });
    const org = await seedOrg(off);
    const res = await off.as(org.member).post(`/organizations/${org.orgId}/ai/plan-drafts`).send({ notes: "some notes about the week" });
    expect(res.status).toBe(503);
    expect((await off.as(org.member).get("/ai/status")).body.enabled).toBe(false);
    await off.close();
  });
});
