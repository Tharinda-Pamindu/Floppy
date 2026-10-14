import type { AiDraft, AiFinding, TaskKind } from "@floppy/shared";
import { and, count, desc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { DRAFT_SYSTEM, REVIEW_SYSTEM } from "../ai/prompts.js";
import { draftOutputSchema, reviewOutputSchema, type ReviewOutput } from "../ai/schemas.js";
import type { Deps } from "../context.js";
import { aiUsageEvents, weeklyPlans } from "../db/schema.js";
import { AppError, forbidden, invalid } from "../errors.js";
import { logger } from "../logger.js";
import { AiProviderError } from "../ports.js";
import { type Actor, loadTasks, planContentHash, type PlanRow, type PlanTaskRow } from "./plans.js";

const REF_PREFIX: Record<Exclude<TaskKind, "main">, string> = { sub_goal: "SG", gtm: "GTM" };

/** Short labels for the model (MAIN, SG1, GTM2). The model never sees ids, names or emails. */
export function taskRefs(tasks: PlanTaskRow[]): Map<string, PlanTaskRow> {
  const refs = new Map<string, PlanTaskRow>();
  const counters = { sub_goal: 0, gtm: 0 };
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    if (task.kind === "main") refs.set("MAIN", task);
    else {
      const kind = task.kind as Exclude<TaskKind, "main">;
      counters[kind] += 1;
      refs.set(`${REF_PREFIX[kind]}${counters[kind]}`, task);
    }
  }
  return refs;
}

interface PreviousPlan {
  weekStart: string;
  status: string;
  mainShipped: boolean | null;
  tasks: { kind: string; title: string; done: boolean }[];
}

export function renderPlan(weekStart: string, refs: Map<string, PlanTaskRow>, previous: PreviousPlan[]): string {
  const lines = [`Plan for the week starting Monday ${weekStart}.`, ""];
  if (!refs.has("MAIN")) lines.push("MAIN: (no main task)", "");
  let total = 0;
  for (const [ref, task] of refs) {
    const estimate = task.estimateHours ? ` (estimated ${task.estimateHours}h)` : "";
    total += task.estimateHours ?? 0;
    lines.push(`${ref}: ${task.title}${estimate}`);
    if (task.kind === "main") lines.push(`  why: ${task.why || "(not given)"}`);
  }
  if (![...refs.values()].some((t) => t.kind === "gtm")) lines.push("(no go-to-market tasks)");
  if (total) lines.push("", `Estimated total: ${total}h`);
  lines.push("", "PREVIOUS PLANS (the author's two most recent earlier weeks, newest first):");
  if (!previous.length) lines.push("(none)");
  for (const p of previous) {
    lines.push(`- Week of ${p.weekStart}, status ${p.status}, main task shipped: ${p.mainShipped ?? "not recorded"}`);
    for (const t of p.tasks) lines.push(`  - [${t.done ? "done" : "not done"}] ${t.kind}: ${t.title}`);
  }
  return lines.join("\n");
}

/** Tie each finding to a real task id, dropping any the model invented. */
export function mapReview(review: ReviewOutput, refs: Map<string, PlanTaskRow>) {
  const findings: AiFinding[] = [];
  for (const f of review.findings) {
    const ref = f.task_ref.trim().toUpperCase();
    if (ref === "NEW") {
      const kind = f.new_task_kind ?? (f.issue === "missing_gtm" ? "gtm" : null);
      if (!kind) continue;
      findings.push({
        taskId: null,
        taskKind: kind,
        issue: f.issue,
        severity: f.severity,
        problem: f.problem,
        field: "title",
        suggestedRewrite: f.suggested_rewrite,
      });
      continue;
    }
    const task = refs.get(ref);
    if (!task) {
      logger.info({ ref }, "Dropping AI finding for an unknown task ref");
      continue;
    }
    findings.push({
      taskId: task.id,
      taskKind: task.kind as TaskKind,
      issue: f.issue,
      severity: f.severity,
      problem: f.problem,
      // Only the main task has a "why".
      field: task.kind === "main" ? f.field : "title",
      suggestedRewrite: f.suggested_rewrite,
    });
  }
  // Never let the model approve a plan it has must-fix findings about.
  const verdict = findings.some((f) => f.severity === "must_fix") ? "adjust" : review.verdict;
  return { verdict, summary: review.summary, findings };
}

async function previousPlans(deps: Deps, plan: PlanRow): Promise<PreviousPlan[]> {
  // Scoped by the server: only this author's own plans in this organization.
  const rows = await deps.db
    .select()
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.organizationId, plan.organizationId),
        eq(weeklyPlans.userId, plan.userId),
        lt(weeklyPlans.weekStart, plan.weekStart),
      ),
    )
    .orderBy(desc(weeklyPlans.weekStart))
    .limit(2);
  const result: PreviousPlan[] = [];
  for (const p of rows) {
    const tasks = await loadTasks(deps.db, p.id);
    result.push({
      weekStart: p.weekStart,
      status: p.status,
      mainShipped: p.mainGoalShipped,
      tasks: tasks.map((t) => ({ kind: t.kind, title: t.title, done: t.isDone })),
    });
  }
  return result;
}

const aiError = (status: number, code: string, message: string) => new AppError(status, code, message);

/**
 * Runs one AI call for an org member. Every call — succeeded, failed or
 * refused by the rate limit — writes one ai_usage_events row (metadata only).
 */
async function run<T>(
  deps: Deps,
  actor: Actor,
  operation: "plan_review" | "plan_draft",
  call: (signal: AbortSignal) => Promise<{ object: T; inputTokens: number | null; outputTokens: number | null }>,
): Promise<T> {
  const started = performance.now();
  const record = (outcome: "succeeded" | "failed" | "rate_limited", errorKind: string | null, tokens?: { i: number | null; o: number | null }) =>
    deps.db.insert(aiUsageEvents).values({
      organizationId: actor.organizationId,
      userId: actor.userId,
      operation,
      outcome,
      errorKind,
      model: deps.ai?.model ?? "not-configured",
      latencyMs: Math.round(performance.now() - started),
      inputTokens: tokens?.i ?? null,
      outputTokens: tokens?.o ?? null,
      createdAt: deps.now(),
    });

  if (!deps.ai) {
    await record("failed", "not_configured");
    throw aiError(503, "AI_UNAVAILABLE", "The AI assistant isn't set up on this server. You can still write and submit your plan without it.");
  }
  const since = new Date(deps.now().getTime() - 60_000);
  const [recent] = await deps.db
    .select({ n: count() })
    .from(aiUsageEvents)
    .where(
      and(
        eq(aiUsageEvents.userId, actor.userId),
        gte(aiUsageEvents.createdAt, since),
        or(isNull(aiUsageEvents.errorKind), ne(aiUsageEvents.errorKind, "local_limit")),
      ),
    );
  if ((recent?.n ?? 0) >= deps.config.AI_RATE_LIMIT_PER_MINUTE) {
    await record("rate_limited", "local_limit");
    throw aiError(429, "AI_RATE_LIMITED", "You've asked the AI a lot in the last minute. Wait a minute and try again.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.config.AI_TIMEOUT_SECONDS * 1000);
  try {
    const result = await call(controller.signal);
    await record("succeeded", null, { i: result.inputTokens, o: result.outputTokens });
    return result.object;
  } catch (err) {
    if (!(err instanceof AiProviderError)) {
      logger.error({ err }, "Unexpected AI failure");
      await record("failed", "unexpected");
      throw aiError(502, "AI_BAD_OUTPUT", "Something went wrong with the AI. Try again.");
    }
    switch (err.kind) {
      case "timeout":
        await record("failed", "timeout");
        throw aiError(504, "AI_TIMEOUT", "The AI took too long to answer. Try again, or carry on without it.");
      case "rate_limited":
        await record("rate_limited", "provider_rate_limit");
        throw aiError(429, "AI_RATE_LIMITED", "The AI service is busy right now. Try again in a minute, or carry on without it.");
      case "provider_http":
        await record("failed", `provider_http_${err.httpStatus ?? "error"}`);
        throw aiError(503, "AI_UNAVAILABLE", "The AI service is having trouble right now. Try again later, or carry on without it.");
      case "unreachable":
        await record("failed", "provider_unreachable");
        throw aiError(503, "AI_UNAVAILABLE", "We couldn't reach the AI service. Try again later, or carry on without it.");
      case "invalid_output":
        await record("failed", "invalid_output");
        throw aiError(502, "AI_BAD_OUTPUT", "The AI gave an answer we couldn't use. Try again.");
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function reviewPlan(deps: Deps, actor: Actor, plan: PlanRow) {
  if (plan.userId !== actor.userId) throw forbidden("Only the plan's author can ask for a review.", "PLAN_AUTHOR_REQUIRED");
  if (plan.status !== "draft") {
    throw new AppError(409, "INVALID_PLAN_STATUS", `Only a draft plan can be reviewed. This plan is ${plan.status}.`);
  }
  const tasks = await loadTasks(deps.db, plan.id);
  if (!tasks.length) throw invalid("Add some tasks before asking for a review.", "tasks");
  const refs = taskRefs(tasks);
  const prompt = renderPlan(plan.weekStart, refs, await previousPlans(deps, plan));
  const output = await run(deps, actor, "plan_review", (signal) =>
    deps.ai!.generateObject({
      system: REVIEW_SYSTEM,
      prompt,
      schema: reviewOutputSchema,
      schemaName: "PlanReview",
      temperature: 0.2,
      signal,
    }),
  );
  const mapped = mapReview(output, refs);
  await deps.db
    .update(weeklyPlans)
    .set({ aiReview: mapped, aiReviewedAt: deps.now(), aiReviewPlanHash: planContentHash(tasks) })
    .where(eq(weeklyPlans.id, plan.id));
}

/** Returned to the form only. Nothing here is written to a plan. */
export async function draftPlan(deps: Deps, actor: Actor, notes: string): Promise<AiDraft> {
  const output = await run(deps, actor, "plan_draft", (signal) =>
    deps.ai!.generateObject({
      system: DRAFT_SYSTEM,
      prompt: notes,
      schema: draftOutputSchema,
      schemaName: "PlanDraft",
      temperature: 0.3,
      signal,
    }),
  );
  const task = (t: { title: string; estimate_hours?: number | null }) => ({ title: t.title, estimateHours: t.estimate_hours ?? null });
  return {
    mainTask: { ...task(output.main_task), why: output.main_task.why },
    subGoals: output.sub_goals.map(task),
    gtmGoals: output.gtm_goals.map(task),
    leftOut: output.left_out,
  };
}
