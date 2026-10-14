import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, goodTasks, type Harness, seedOrg, THIS_MONDAY } from "./harness.js";

let h: Harness;
let o: Awaited<ReturnType<typeof seedOrg>>;
const url = (p: string) => `/organizations/${o.orgId}${p}`;

beforeAll(async () => {
  h = await createHarness();
  o = await seedOrg(h);
});
afterAll(() => h.close());

describe("teams", () => {
  it("creating an organization creates its first team with the creator in it", async () => {
    await h.user("newbie");
    const org = await h.as("newbie").post("/organizations").send({ name: "Fresh Co" });
    expect(org.status).toBe(201);
    const teams = await h.as("newbie").get(`/organizations/${org.body.id}/teams`);
    expect(teams.body).toHaveLength(1);
    expect(teams.body[0].name).toBe("Core team");
    expect(teams.body[0].members.map((m: { id: string }) => m.id)).toEqual(["newbie"]);
  });

  it("refuses to delete the last team (409) but deletes others", async () => {
    await h.user("solo");
    const org = await h.as("solo").post("/organizations").send({ name: "Solo Co", firstTeamName: "Only" });
    const [only] = (await h.as("solo").get(`/organizations/${org.body.id}/teams`)).body;
    const res = await h.as("solo").delete(`/organizations/${org.body.id}/teams/${only.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("LAST_TEAM");
    const extra = await h.as("solo").post(`/organizations/${org.body.id}/teams`).send({ name: "Extra" });
    expect((await h.as("solo").delete(`/organizations/${org.body.id}/teams/${extra.body.id}`)).status).toBe(204);
  });

  it("only owners and admins manage teams; a lead gets 403", async () => {
    expect((await h.as(o.lead).post(url("/teams")).send({ name: "Lead's team" })).status).toBe(403);
    expect((await h.as(o.lead).patch(url(`/teams/${o.payments}`)).send({ name: "Renamed" })).status).toBe(403);
    expect((await h.as(o.admin).patch(url(`/teams/${o.payments}`)).send({ description: "Card payments" })).status).toBe(200);
  });

  it("team names are unique per organization", async () => {
    expect((await h.as(o.owner).post(url("/teams")).send({ name: "Growth" })).status).toBe(409);
  });

  it("making someone lead replaces the old lead and notifies them", async () => {
    const res = await h.as(o.owner).put(url(`/teams/${o.growth}/members/${o.tom}`)).send({ isLead: true });
    expect(res.body.lead.id).toBe(o.tom);
    expect(h.notifier.of("team-lead-assigned").at(-1)?.to).toEqual([o.tom]);
    // Restore: no lead on Growth for the rest of the suite.
    await h.as(o.owner).put(url(`/teams/${o.growth}/members/${o.tom}`)).send({ isLead: false });
  });
});

describe("assigned tasks", () => {
  let taskId: string;

  it("a lead assigns to their team; the assignee gets the assignment email", async () => {
    const res = await h
      .as(o.lead)
      .post(url("/tasks"))
      .send({ title: "Fix flaky checkout test", assigneeId: o.member, deadline: "2026-10-16T17:00:00Z", priority: "high" });
    expect(res.status).toBe(201);
    taskId = res.body.id;
    expect(res.body.teamId).toBe(o.payments);
    const sent = h.notifier.of("task-assigned").at(-1)!;
    expect(sent.to).toEqual([o.member]);
    expect(sent.payload).toMatchObject({ taskTitle: "Fix flaky checkout test", priority: "High" });
  });

  it("a lead can't assign outside their teams; a member can't assign at all", async () => {
    await h.user("outsider");
    await h.identity.addMember(o.orgId, "outsider", "member");
    await h.as("outsider").get("/organizations");
    const lead = await h.as(o.lead).post(url("/tasks")).send({ title: "x", assigneeId: "outsider", deadline: "2026-10-16T17:00:00Z" });
    expect(lead.status).toBe(403);
    const member = await h.as(o.member).post(url("/tasks")).send({ title: "x", assigneeId: o.tom, deadline: "2026-10-16T17:00:00Z" });
    expect(member.status).toBe(403);
    // Owners and admins can assign anyone in the org.
    const admin = await h.as(o.admin).post(url("/tasks")).send({ title: "Onboard", assigneeId: "outsider", deadline: "2026-10-16T17:00:00Z" });
    expect(admin.status).toBe(201);
  });

  it("other members can't see someone else's task (404)", async () => {
    expect((await h.as(o.tom).get(url(`/tasks/${taskId}`))).status).toBe(404);
    expect((await h.as(o.member).get(url(`/tasks/${taskId}`))).status).toBe(200);
  });

  it("the assignee changes status but not the details", async () => {
    expect((await h.as(o.member).patch(url(`/tasks/${taskId}`)).send({ deadline: "2026-12-01T00:00:00Z" })).status).toBe(403);
    expect((await h.as(o.member).patch(url(`/tasks/${taskId}`)).send({ status: "cancelled" })).status).toBe(403);
    expect((await h.as(o.member).patch(url(`/tasks/${taskId}`)).send({ status: "in_progress" })).body.status).toBe("in_progress");
  });

  it("is pulled into the assignee's plan and stays in sync both ways", async () => {
    const pulled = await h.as(o.member).post(url(`/tasks/${taskId}/pull-into-plan`)).send({ weekStart: THIS_MONDAY, kind: "sub_goal" });
    expect(pulled.status).toBe(201);
    const plan = await h.as(o.member).get(url(`/plans/${pulled.body.planId}`));
    const linked = plan.body.tasks.find((t: { assignedTaskId: string | null }) => t.assignedTaskId === taskId);
    expect(linked.title).toBe("Fix flaky checkout test");
    expect((await h.as(o.member).post(url(`/tasks/${taskId}/pull-into-plan`)).send({ weekStart: THIS_MONDAY })).status).toBe(409);

    // Approve the plan, then tick the plan task: the assigned task completes and the assigner hears about it.
    await h.as(o.member).put(url(`/plans/${pulled.body.planId}`)).send({
      tasks: [...plan.body.tasks.map((t: object) => t), { kind: "main", title: "Checkout passes in CI", why: "Unblocks releases" }],
    });
    expect((await h.as(o.member).post(url(`/plans/${pulled.body.planId}/submit`))).status).toBe(200);
    await h.as(o.lead).post(url(`/plans/${pulled.body.planId}/approve`)).send({});
    h.notifier.clear();
    await h.as(o.member).patch(url(`/plans/${pulled.body.planId}/tasks/${linked.id}`)).send({ isDone: true });
    const task = await h.as(o.member).get(url(`/tasks/${taskId}`));
    expect(task.body.status).toBe("done");
    expect(h.notifier.of("task-completed")[0]?.to).toEqual([o.lead]);

    // And the other way: reopening the task unticks the plan task.
    await h.as(o.member).patch(url(`/tasks/${taskId}`)).send({ status: "in_progress" });
    const after = await h.as(o.member).get(url(`/plans/${pulled.body.planId}`));
    expect(after.body.tasks.find((t: { id: string }) => t.id === linked.id).isDone).toBe(false);
  });

  it("lists by scope", async () => {
    const mine = await h.as(o.member).get(url("/tasks?scope=mine"));
    expect(mine.body.map((t: { id: string }) => t.id)).toContain(taskId);
    const byMe = await h.as(o.lead).get(url("/tasks?scope=assigned_by_me"));
    expect(byMe.body).toHaveLength(1);
    expect((await h.as(o.member).get(url(`/tasks?scope=team&teamId=${o.payments}`))).status).toBe(403);
  });
});

describe("GitHub repos and issues", () => {
  let repoId: string;

  it("a lead links a repo after checking it exists", async () => {
    expect((await h.as(o.lead).post(url(`/teams/${o.payments}/repos`)).send({ repo: "acme/missing" })).status).toBe(422);
    const res = await h.as(o.lead).post(url(`/teams/${o.payments}/repos`)).send({ repo: "https://github.com/acme/widgets" });
    expect(res.status).toBe(201);
    expect(res.body.fullName).toBe("acme/widgets");
    repoId = res.body.id;
    expect((await h.as(o.lead).post(url(`/teams/${o.payments}/repos`)).send({ repo: "acme/widgets" })).status).toBe(409);
  });

  it("members can't link repos to a team they don't lead", async () => {
    expect((await h.as(o.member).post(url(`/teams/${o.payments}/repos`)).send({ repo: "acme/widgets" })).status).toBe(403);
    expect((await h.as(o.lead).post(url(`/teams/${o.growth}/repos`)).send({ repo: "acme/widgets" })).status).toBe(403);
  });

  it("lists open issues and turns one into an assigned task", async () => {
    const issues = await h.as(o.member).get(url(`/teams/${o.payments}/repos/${repoId}/issues`));
    expect(issues.body.issues.map((i: { number: number }) => i.number)).toEqual([7, 9]);
    const task = await h
      .as(o.lead)
      .post(url("/tasks"))
      .send({ title: "Expired cards", assigneeId: o.tom, deadline: "2026-10-20T12:00:00Z", githubRepoId: repoId, githubIssueNumber: 7 });
    expect(task.status).toBe(201);
    expect(task.body.github).toMatchObject({ repoFullName: "acme/widgets", number: 7, state: "open" });
    const again = await h.as(o.member).get(url(`/teams/${o.payments}/repos/${repoId}/issues`));
    expect(again.body.issues[0].assignedTaskId).toBe(task.body.id);
    const bad = await h.as(o.lead).post(url("/tasks")).send({ title: "x", assigneeId: o.tom, deadline: "2026-10-20T12:00:00Z", githubRepoId: repoId, githubIssueNumber: 404 });
    expect(bad.status).toBe(422);
  });
});

describe("chat", () => {
  it("team channels are for team members and managers only", async () => {
    const conv = await h.as(o.member).get(url(`/teams/${o.payments}/conversation`));
    expect(conv.status).toBe(200);
    await h.user("stranger");
    await h.identity.addMember(o.orgId, "stranger", "member");
    await h.as("stranger").get("/organizations");
    expect((await h.as("stranger").get(url(`/conversations/${conv.body.id}/messages`))).status).toBe(404);
    expect((await h.as(o.owner).get(url(`/conversations/${conv.body.id}/messages`))).status).toBe(200);
  });

  it("posts in realtime, counts unread and notifies mentions", async () => {
    const conv = (await h.as(o.member).get(url(`/teams/${o.payments}/conversation`))).body;
    h.notifier.clear();
    const res = await h
      .as(o.member)
      .post(url(`/conversations/${conv.id}/messages`))
      .send({ body: `Retry worker is merged <@${o.lead}> <@stranger>` });
    expect(res.status).toBe(201);
    expect(res.body.mentions).toEqual([o.lead]); // stranger isn't on the team
    expect(h.realtime.events.some((e) => e.room === `conv:${conv.id}` && e.event === "message:new")).toBe(true);
    expect(h.notifier.of("chat-mention")[0]?.to).toEqual([o.lead]);
    expect(h.notifier.of("chat-message")[0]?.to).toEqual([o.tom]);
    const list = await h.as(o.lead).get(url("/conversations"));
    expect(list.body.find((c: { id: string }) => c.id === conv.id).unread).toBe(1);
    await h.as(o.lead).post(url(`/conversations/${conv.id}/read`));
    const after = await h.as(o.lead).get(url("/conversations"));
    expect(after.body.find((c: { id: string }) => c.id === conv.id).unread).toBe(0);
  });

  it("DMs are private to the two people", async () => {
    const dm = await h.as(o.member).post(url("/conversations/dm")).send({ userId: o.tom });
    expect(dm.status).toBe(200);
    expect((await h.as(o.tom).get(url(`/conversations/${dm.body.id}/messages`))).status).toBe(200);
    expect((await h.as(o.owner).get(url(`/conversations/${dm.body.id}/messages`))).status).toBe(404);
    expect((await h.as(o.member).post(url("/conversations/dm")).send({ userId: o.member })).status).toBe(422);
  });

  it("plan threads follow plan visibility: drafts stay private", async () => {
    const draft = await h.as(o.tom).post(url("/plans")).send({ weekStart: "2026-10-05", tasks: goodTasks });
    expect((await h.as(o.lead).get(url(`/plans/${draft.body.id}/conversation`))).status).toBe(404);
    expect((await h.as(o.tom).get(url(`/plans/${draft.body.id}/conversation`))).status).toBe(200);
  });

  it("only the author deletes a message", async () => {
    const conv = (await h.as(o.member).get(url(`/teams/${o.payments}/conversation`))).body;
    const msg = await h.as(o.member).post(url(`/conversations/${conv.id}/messages`)).send({ body: "oops" });
    expect((await h.as(o.lead).delete(url(`/conversations/${conv.id}/messages/${msg.body.id}`))).status).toBe(403);
    expect((await h.as(o.member).delete(url(`/conversations/${conv.id}/messages/${msg.body.id}`))).status).toBe(204);
  });
});

describe("pages", () => {
  let pageId: string;

  it("owners create org-wide pages; members can read but not edit", async () => {
    const res = await h.as(o.owner).post(url("/pages")).send({ title: "Project overview", bodyMd: "# v1" });
    expect(res.status).toBe(201);
    pageId = res.body.id;
    expect(res.body.version).toBe(1);
    expect((await h.as(o.member).get(url(`/pages/${pageId}`))).status).toBe(200);
    const edit = await h.as(o.member).put(url(`/pages/${pageId}`)).send({ title: "x", bodyMd: "x", baseVersion: 1 });
    expect(edit.status).toBe(403);
    expect((await h.as(o.member).post(url("/pages")).send({ title: "Mine", bodyMd: "" })).status).toBe(403);
  });

  it("a lead edits only their own team's pages", async () => {
    expect((await h.as(o.lead).post(url("/pages")).send({ title: "Payments runbook", bodyMd: "", teamId: o.payments })).status).toBe(201);
    expect((await h.as(o.lead).post(url("/pages")).send({ title: "Growth notes", bodyMd: "", teamId: o.growth })).status).toBe(403);
    expect((await h.as(o.lead).put(url(`/pages/${pageId}`)).send({ title: "x", bodyMd: "x", baseVersion: 1 })).status).toBe(403);
  });

  it("every save adds a version; a stale base version is a 409", async () => {
    expect((await h.as(o.owner).put(url(`/pages/${pageId}`)).send({ title: "Project overview", bodyMd: "# v2", baseVersion: 1 })).body.version).toBe(2);
    const conflict = await h.as(o.admin).put(url(`/pages/${pageId}`)).send({ title: "Project overview", bodyMd: "# mine", baseVersion: 1 });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("PAGE_VERSION_CONFLICT");
    const versions = await h.as(o.member).get(url(`/pages/${pageId}/versions`));
    expect(versions.body.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    const v1 = await h.as(o.member).get(url(`/pages/${pageId}/versions/1`));
    expect(v1.body.bodyMd).toBe("# v1");
  });

  it("exports the exact body of a version as a .md file", async () => {
    const res = await h.as(o.member).get(url(`/pages/${pageId}/export?version=1`));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/markdown/);
    expect(res.headers["content-disposition"]).toContain("project-overview-v1.md");
    expect(res.text).toBe("# v1");
  });

  it("imports a .md file as a new version and rejects binary or oversized files", async () => {
    const ok = await h
      .as(o.owner)
      .post(url(`/pages/${pageId}/import?baseVersion=2&fileName=notes.md`))
      .set("Content-Type", "text/markdown")
      .send("# Imported\n\nHello");
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(3);
    expect(ok.body.changeNote).toBe("Imported notes.md");
    const binary = await h
      .as(o.owner)
      .post(url(`/pages/${pageId}/import?baseVersion=3`))
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe]));
    expect(binary.status).toBe(422);
    const big = await h
      .as(o.owner)
      .post(url(`/pages/${pageId}/import?baseVersion=3`))
      .set("Content-Type", "text/markdown")
      .send("a".repeat(210 * 1024));
    expect([413, 422]).toContain(big.status);
  });

  it("notifies readers when a page changes, but not the editor", async () => {
    h.notifier.clear();
    await h.as(o.owner).put(url(`/pages/${pageId}`)).send({ title: "Project overview", bodyMd: "# v4", baseVersion: 3 });
    const sent = h.notifier.of("page-updated")[0]!;
    expect(sent.to).not.toContain(o.owner);
    expect(sent.to).toContain(o.member);
  });
});
