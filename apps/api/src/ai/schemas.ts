import { z } from "zod";

/** What the reviewer returns. Task refs (MAIN, SG1, GTM1, NEW) are mapped back to ids by the server. */
export const reviewOutputSchema = z.object({
  verdict: z.enum(["approve", "adjust"]).describe("approve only when there is no must_fix finding"),
  summary: z.string().min(1).max(600).describe("One or two sentences, as a lead would say them in the approval meeting."),
  findings: z
    .array(
      z.object({
        task_ref: z.string().describe("MAIN, SG1, GTM1… exactly as labelled, or NEW for a missing task"),
        issue: z.enum(["not_checkable", "missing_why", "missing_gtm", "scope_too_big", "carried_over", "unclear"]),
        severity: z.enum(["must_fix", "consider"]),
        problem: z.string().min(1).max(500),
        field: z.enum(["title", "why"]).default("title"),
        suggested_rewrite: z.string().min(1).max(400),
        new_task_kind: z.enum(["sub_goal", "gtm"]).nullable().optional(),
      }),
    )
    .max(12),
});
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;

const draftTask = z.object({
  title: z.string().min(1).max(300),
  estimate_hours: z.number().int().min(1).max(60).nullable().optional(),
});

export const draftOutputSchema = z.object({
  main_task: draftTask.extend({ why: z.string().min(1).max(1000) }),
  sub_goals: z.array(draftTask).max(6),
  gtm_goals: z.array(draftTask).max(4),
  left_out: z.array(z.string().max(200)).max(8).default([]),
});
export type DraftOutput = z.infer<typeof draftOutputSchema>;
