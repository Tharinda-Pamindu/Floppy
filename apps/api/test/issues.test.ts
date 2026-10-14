import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, seedOrg } from "./harness.js";

let h: Harness;
let o: Awaited<ReturnType<typeof seedOrg>>;
const url = (p: string) => `/organizations/${o.orgId}${p}`;

beforeAll(async () => {
  h = await createHarness();
  o = await seedOrg(h);
});
afterAll(() => h.close());

const assign = (body: Record<string, unknown>) =>
  h.as(o.lead).post(url("/tasks")).send({ assigneeId: o.member, deadline: "2026-10-16T17:00:00Z", ...body });

describe("issue keys, types, points and labels", () => {
  it("numbers tasks per organization and shows keys from the org name", async () => {
    const first = await assign({ title: "Retry expired cards" });
    const second = await assign({ title: "Refund webhook cap", type: "bug", storyPoints: 3, labels: ["Payments", "web hooks", "payments"] });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ number: 1, key: "NORT-1", type: "task", storyPoints: null, labels: [] });
    // Labels are normalised (lower case, dashes) and de-duplicated.
    expect(second.body).toMatchObject({ number: 2, key: "NORT-2", type: "bug", storyPoints: 3, labels: ["payments", "web-hooks"] });

    // Another organization starts its own sequence.
    const other = await seedOrg(h, "x_");
    const theirs = await h.as(other.lead).post(`/organizations/${other.orgId}/tasks`).send({ title: "Theirs", assigneeId: other.member, deadline: "2026-10-16T17:00:00Z" });
    expect(theirs.body).toMatchObject({ number: 1, key: "XN-1" });
  });

  it("rejects bad points and labels (422)", async () => {
    expect((await assign({ title: "x", storyPoints: 0 })).status).toBe(422);
    expect((await assign({ title: "x", storyPoints: 101 })).status).toBe(422);
    expect((await assign({ title: "x", labels: ["no/slashes"] })).status).toBe(422);
    expect((await assign({ title: "x", labels: ["a", "b", "c", "d", "e", "f"] })).status).toBe(422);
  });

  it("only managers change type, points and labels; the assignee moves it through review", async () => {
    const task = (await assign({ title: "Ledger report", type: "story" })).body;
    expect((await h.as(o.member).patch(url(`/tasks/${task.id}`)).send({ storyPoints: 5 })).status).toBe(403);
    const edited = await h.as(o.lead).patch(url(`/tasks/${task.id}`)).send({ storyPoints: 5, labels: ["reporting"], type: "task" });
    expect(edited.body).toMatchObject({ storyPoints: 5, labels: ["reporting"], type: "task" });

    const review = await h.as(o.member).patch(url(`/tasks/${task.id}`)).send({ status: "in_review" });
    expect(review.status).toBe(200);
    expect(review.body.status).toBe("in_review");
    // Still open: it can be pulled into a plan, and it isn't completed.
    expect(review.body.completedAt).toBeNull();
    expect(review.body.permissions.pull).toBe(true);
    const open = await h.as(o.member).get(url("/tasks?scope=mine&status=in_review"));
    expect(open.body.map((t: { id: string }) => t.id)).toContain(task.id);
  });
});

describe("filters", () => {
  beforeAll(async () => {
    await assign({ title: "Calendar: due Monday", deadline: "2026-10-19T09:00:00Z", priority: "urgent", labels: ["calendar"] });
    await assign({ title: "Calendar: due in November", deadline: "2026-11-20T09:00:00Z", labels: ["calendar"] });
  });

  it("filters by type, priority and label", async () => {
    const bugs = await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&type=bug"));
    expect(bugs.body.length).toBeGreaterThan(0);
    expect(bugs.body.every((t: { type: string }) => t.type === "bug")).toBe(true);
    const urgent = await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&priority=urgent"));
    expect(urgent.body.map((t: { title: string }) => t.title)).toEqual(["Calendar: due Monday"]);
    const labelled = await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&label=Calendar"));
    expect(labelled.body).toHaveLength(2);
  });

  it("searches titles and finds a task by its key", async () => {
    const byTitle = await h.as(o.lead).get(url(`/tasks?scope=assigned_by_me&q=${encodeURIComponent("webhook")}`));
    expect(byTitle.body.map((t: { key: string }) => t.key)).toEqual(["NORT-2"]);
    const byKey = await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&q=NORT-1"));
    expect(byKey.body.map((t: { key: string }) => t.key)).toEqual(["NORT-1"]);
    // A literal % is not a wildcard.
    expect((await h.as(o.lead).get(url(`/tasks?scope=assigned_by_me&q=${encodeURIComponent("%")}`))).body).toEqual([]);
  });

  it("returns a deadline window for the calendar, and caps how wide it can be", async () => {
    const october = await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z"));
    const titles = october.body.map((t: { title: string }) => t.title);
    expect(titles).toContain("Calendar: due Monday");
    expect(titles).not.toContain("Calendar: due in November");
    expect((await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&from=2026-10-01T00:00:00Z"))).status).toBe(422);
    expect((await h.as(o.lead).get(url("/tasks?scope=assigned_by_me&from=2026-01-01T00:00:00Z&to=2026-12-01T00:00:00Z"))).status).toBe(422);
  });
});

describe("activity history", () => {
  it("records creation and each changed field, with names for people", async () => {
    const task = (await assign({ title: "History please", storyPoints: 2 })).body;
    await h.as(o.lead).patch(url(`/tasks/${task.id}`)).send({ deadline: "2026-10-20T17:00:00Z", storyPoints: 3, priority: "normal" });
    await h.as(o.member).patch(url(`/tasks/${task.id}`)).send({ status: "in_progress" });
    await h.as(o.lead).patch(url(`/tasks/${task.id}`)).send({ assigneeId: o.tom, description: "New details" });

    const res = await h.as(o.lead).get(url(`/tasks/${task.id}/activity`));
    expect(res.status).toBe(200);
    const fields = res.body.map((e: { field: string }) => e.field);
    expect(fields[0]).toBe("created");
    // Priority was already "normal": unchanged fields leave no entry.
    expect(fields).not.toContain("priority");
    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "deadline", from: "2026-10-16T17:00:00.000Z", to: "2026-10-20T17:00:00.000Z" }),
        expect.objectContaining({ field: "story_points", from: "2", to: "3" }),
        expect.objectContaining({ field: "status", from: "todo", to: "in_progress", actor: expect.objectContaining({ id: o.member }) }),
        expect.objectContaining({ field: "assignee", from: expect.any(String), to: expect.any(String) }),
        // The description's text is not copied into history.
        expect.objectContaining({ field: "description", from: null, to: null }),
      ]),
    );
    const assignee = res.body.find((e: { field: string }) => e.field === "assignee");
    expect(assignee.from).not.toBe(o.member);
  });

  it("is hidden (404) from people who can't see the task", async () => {
    const task = (await assign({ title: "Private-ish" })).body;
    expect((await h.as(o.tom).get(url(`/tasks/${task.id}/activity`))).status).toBe(404);
    expect((await h.as(o.member).get(url(`/tasks/${task.id}/activity`))).status).toBe(200);
  });
});
