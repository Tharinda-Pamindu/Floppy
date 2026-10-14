/**
 * Every Novu workflow, defined in code with @novu/framework and served from
 * the API's bridge endpoint (/api/novu). `npx novu sync` (or `npm run
 * novu:sync`) publishes them to Novu Cloud; `npm run novu:dev` tunnels the
 * local bridge for development.
 *
 * Channels: in-app (the bell / <Inbox />), email (Resend) and SMS (Twilio),
 * connected as providers in the Novu dashboard.
 */
import { workflow } from "@novu/framework";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { weeklyPlans } from "../db/schema.js";
import { WORKFLOW_NAMES } from "./catalog.js";
import { emailLayout, esc, formatDeadline } from "./email.js";
import type { WorkflowId } from "../ports.js";

type Payload = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const url = (p: Payload) => s(p.url) || undefined;
const inAppLink = (p: Payload, label = "Open") =>
  url(p) ? { redirect: { url: url(p)!, target: "_self" as const }, primaryAction: { label, redirect: { url: url(p)!, target: "_self" as const } } } : {};

const critical = { all: { enabled: true, readOnly: true } };
const smsOff = { all: { enabled: true }, channels: { sms: { enabled: false } } };

const opts = (id: WorkflowId, tags: string[], preferences?: object) => ({
  name: WORKFLOW_NAMES[id],
  tags,
  ...(preferences ? { preferences } : {}),
});

export function buildWorkflows(db: Db) {
  const welcome = workflow(
    "welcome",
    async ({ step, payload }) => {
      await step.inApp("welcome-inapp", async () => ({
        subject: "Welcome to Floppy",
        body: "Start by creating an organization or opening an invite. Then write this week's plan: one main thing to ship.",
        redirect: { url: "/app", target: "_self" },
      }));
      await step.email("welcome-email", async () => ({
        subject: "Welcome to Floppy",
        body: emailLayout({
          heading: `Hi ${esc(payload.firstName || "there")}, welcome aboard`,
          paragraphs: [
            "Floppy is weekly planning for software teams: every engineer commits to <strong>one thing they'll ship this week</strong>, a lead approves it, and by Friday the team knows what actually shipped.",
            "Create an organization, or accept the invite a teammate sent you, and write your first plan.",
          ],
        }),
      }));
    },
    opts("welcome", ["account"]),
  );

  const verificationCode = workflow(
    "auth-verification-code",
    async ({ step, payload }) => {
      await step.email(
        "code-email",
        async () => ({
          subject: payload.code ? `Your Floppy code: ${s(payload.code)}` : "Verify your email for Floppy",
          body: emailLayout({
            heading: "Verify it's you",
            paragraphs: payload.code
              ? [`Your verification code is <strong style="font-size:22px;letter-spacing:.2em">${esc(payload.code)}</strong>.`, "It expires in 10 minutes. If you didn't ask for it, ignore this email."]
              : ["Use the button below to continue.", "If you didn't ask for this, ignore this email."],
            cta: payload.url ? { label: "Continue", url: payload.url } : undefined,
          }),
        }),
        { skip: () => payload.channel !== "email" },
      );
      await step.sms("code-sms", async () => ({ body: s(payload.message) || `Your Floppy code is ${s(payload.code)}` }), {
        skip: () => payload.channel !== "sms",
      });
    },
    opts("auth-verification-code", ["account"], critical),
  );

  const passwordReset = workflow(
    "auth-password-reset",
    async ({ step, payload }) => {
      await step.email("reset-email", async () => ({
        subject: "Reset your Floppy password",
        body: emailLayout({
          heading: "Reset your password",
          paragraphs: payload.code
            ? [`Your reset code is <strong style="font-size:22px;letter-spacing:.2em">${esc(payload.code)}</strong>.`, "If you didn't ask to reset your password, you can ignore this email; your password stays the same."]
            : ["Use the button below to choose a new password.", "If you didn't ask for this, ignore this email."],
          cta: payload.url ? { label: "Choose a new password", url: payload.url } : undefined,
        }),
      }));
    },
    opts("auth-password-reset", ["account"], critical),
  );

  const orgInvitation = workflow(
    "org-invitation",
    async ({ step, payload }) => {
      await step.email("invite-email", async () => ({
        subject: `You're invited to ${s(payload.organizationName) || "a team"} on Floppy`,
        body: emailLayout({
          heading: `Join ${esc(payload.organizationName || "your team")} on Floppy`,
          paragraphs: [
            `${esc(payload.inviterName || "A teammate")} invited you to plan your weeks together in Floppy.`,
            "The link works once, for this email address only.",
          ],
          cta: { label: "Accept the invitation", url: payload.url },
        }),
      }));
    },
    opts("org-invitation", ["account"], critical),
  );

  const memberJoined = workflow(
    "member-joined",
    async ({ step, payload }) => {
      await step.inApp("joined-inapp", async () => ({
        subject: `${s(payload.memberName)} joined ${s(payload.organizationName)}`,
        body: `They joined as ${s(payload.role)}. Add them to a team so someone can approve their plans.`,
        redirect: { url: `/app/${s(payload.organizationId)}/teams`, target: "_self" },
      }));
    },
    opts("member-joined", ["organization"]),
  );

  const planSubmitted = workflow(
    "plan-submitted",
    async ({ step, payload }) => {
      await step.inApp("submitted-inapp", async () => ({
        subject: `${s(payload.authorName)} submitted a plan`,
        body: `${s(payload.weekLabel)}: “${s(payload.mainTask)}”. Approve it or send it back with a comment.`,
        ...inAppLink(payload, "Review plan"),
      }));
      const { events } = await step.digest("submitted-digest", async () => ({ amount: 30, unit: "minutes" }));
      await step.email("submitted-email", async () => {
        const items = events.map((e) => e.payload as Payload);
        const list = items.map((p) => `<li style="margin-bottom:6px"><strong>${esc(p.authorName)}</strong>: ${esc(p.mainTask)} <span style="color:#78716c">(${esc(p.weekLabel)})</span></li>`).join("");
        return {
          subject: items.length > 1 ? `${items.length} plans are waiting for your approval` : `${s(payload.authorName)}'s plan is waiting for your approval`,
          body: emailLayout({
            heading: items.length > 1 ? `${items.length} plans to review` : "A plan to review",
            paragraphs: [`<ul style="padding-left:18px;margin:0">${list}</ul>`],
            cta: { label: "Open approvals", url: payload.url },
          }),
        };
      });
    },
    opts("plan-submitted", ["plans"]),
  );

  const approvalOverdue = workflow(
    "approval-overdue",
    async ({ step, payload }) => {
      await step.delay("wait-a-day", async () => ({ amount: 24, unit: "hours" }));
      // Runs in our bridge, so it can check the plan's current state.
      const stillWaiting = async () => {
        const [plan] = await db
          .select({ status: weeklyPlans.status })
          .from(weeklyPlans)
          .where(and(eq(weeklyPlans.id, s(payload.planId)), eq(weeklyPlans.organizationId, s(payload.organizationId))));
        return plan?.status === "submitted";
      };
      await step.inApp(
        "overdue-inapp",
        async () => ({
          subject: `${s(payload.authorName)}'s plan has waited a day`,
          body: `“${s(payload.mainTask)}” is still waiting for approval.`,
          ...inAppLink(payload, "Review now"),
        }),
        { skip: async () => !(await stillWaiting()) },
      );
      await step.email(
        "overdue-email",
        async () => ({
          subject: `Reminder: ${s(payload.authorName)}'s plan is still waiting`,
          body: emailLayout({
            heading: "A plan has been waiting a day",
            paragraphs: [`${esc(payload.authorName)} submitted “${esc(payload.mainTask)}” for ${esc(payload.weekLabel)}. The week is moving; approve it or send it back.`],
            cta: { label: "Review the plan", url: payload.url },
          }),
        }),
        { skip: async () => !(await stillWaiting()) },
      );
    },
    opts("approval-overdue", ["plans", "reminders"]),
  );

  const planApproved = workflow(
    "plan-approved",
    async ({ step, payload }) => {
      const text = `${s(payload.reviewerName)} approved your plan for ${s(payload.weekLabel).toLowerCase()}.${payload.comment ? ` “${s(payload.comment)}”` : ""}`;
      await step.inApp("approved-inapp", async () => ({ subject: "Plan approved", body: text, ...inAppLink(payload, "Open my week") }));
      await step.email("approved-email", async () => ({
        subject: "Your plan was approved",
        body: emailLayout({
          heading: "You're good to go",
          paragraphs: [esc(text), "Tick tasks off as you finish them, and close the week on Friday."],
          cta: { label: "Open my week", url: payload.url },
        }),
      }));
      await step.sms("approved-sms", async () => ({ body: `Floppy: ${text}` }));
    },
    opts("plan-approved", ["plans"], smsOff),
  );

  const planChanges = workflow(
    "plan-changes-requested",
    async ({ step, payload }) => {
      const text = `${s(payload.reviewerName)} sent your plan back: “${s(payload.comment)}”`;
      await step.inApp("changes-inapp", async () => ({ subject: "Plan sent back", body: text, ...inAppLink(payload, "Edit plan") }));
      await step.email("changes-email", async () => ({
        subject: "Your plan was sent back with a comment",
        body: emailLayout({
          heading: "A few changes before approval",
          paragraphs: [`${esc(payload.reviewerName)} wrote:`, `<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #0f766e;background:#f4f1ea">${esc(payload.comment)}</blockquote>`, "Your plan is a draft again. Update it and submit when ready."],
          cta: { label: "Edit my plan", url: payload.url },
        }),
      }));
      await step.sms("changes-sms", async () => ({ body: `Floppy: your plan was sent back. ${s(payload.comment).slice(0, 100)}` }));
    },
    opts("plan-changes-requested", ["plans"], smsOff),
  );

  const leadAssigned = workflow(
    "team-lead-assigned",
    async ({ step, payload }) => {
      await step.inApp("lead-inapp", async () => ({
        subject: `You now lead ${s(payload.teamName)}`,
        body: "You'll approve your teammates' weekly plans and see the team's week.",
        ...inAppLink(payload, "Open team"),
      }));
      await step.email("lead-email", async () => ({
        subject: `You're the lead of ${s(payload.teamName)}`,
        body: emailLayout({
          heading: `You now lead ${esc(payload.teamName)}`,
          paragraphs: ["Your teammates' plans will come to you for approval. Approve them, or send them back with a comment.", "You'll also see the team's week and its history."],
          cta: { label: "Open the team", url: payload.url },
        }),
      }));
    },
    opts("team-lead-assigned", ["organization"]),
  );

  const weeklyPlanReminder = workflow(
    "weekly-plan-reminder",
    async ({ step, payload }) => {
      const text = payload.hasDraft
        ? "Your plan for this week is still a draft. Submit it so your lead can approve it."
        : "What's the one thing you'll ship this week? Write your plan.";
      await step.inApp("plan-reminder-inapp", async () => ({ subject: "Plan your week", body: text, ...inAppLink(payload, "Write my plan") }));
      await step.email("plan-reminder-email", async () => ({
        subject: payload.hasDraft ? "Your weekly plan is still a draft" : "Monday: what will you ship this week?",
        body: emailLayout({ heading: "Plan your week", paragraphs: [esc(text)], cta: { label: "Open my week", url: payload.url } }),
      }));
      await step.sms("plan-reminder-sms", async () => ({ body: `Floppy: ${text}` }));
    },
    opts("weekly-plan-reminder", ["reminders"], smsOff),
  );

  const weekCloseReminder = workflow(
    "week-close-reminder",
    async ({ step, payload }) => {
      const text = "It's Friday. Tick off what's done and record whether your main task shipped.";
      await step.inApp("close-inapp", async () => ({ subject: "Close your week", body: text, ...inAppLink(payload, "Close the week") }));
      await step.email("close-email", async () => ({
        subject: "Friday: did it ship?",
        body: emailLayout({ heading: "Close your week", paragraphs: [esc(text)], cta: { label: "Close the week", url: payload.url } }),
      }));
    },
    opts("week-close-reminder", ["reminders"]),
  );

  const orgSuspended = workflow(
    "org-suspended",
    async ({ step, payload }) => {
      await step.inApp("suspended-inapp", async () => ({
        subject: `${s(payload.organizationName)} is suspended`,
        body: "Members can't open it until it's reinstated. Contact support if this is unexpected.",
      }));
      await step.email("suspended-email", async () => ({
        subject: `${s(payload.organizationName)} has been suspended`,
        body: emailLayout({
          heading: `${esc(payload.organizationName)} is suspended`,
          paragraphs: [`Reason: ${esc(payload.reason)}`, "Nobody can open this organization until it's reinstated. Reply to support if you think this is a mistake."],
        }),
      }));
    },
    opts("org-suspended", ["organization"], critical),
  );

  const orgReinstated = workflow(
    "org-reinstated",
    async ({ step, payload }) => {
      await step.inApp("reinstated-inapp", async () => ({
        subject: `${s(payload.organizationName)} is back`,
        body: "The organization has been reinstated. Everything is where you left it.",
        ...inAppLink(payload),
      }));
      await step.email("reinstated-email", async () => ({
        subject: `${s(payload.organizationName)} has been reinstated`,
        body: emailLayout({ heading: "You're back in", paragraphs: [`${esc(payload.organizationName)} has been reinstated.`], cta: { label: "Open Floppy", url: payload.url } }),
      }));
    },
    opts("org-reinstated", ["organization"]),
  );

  const taskAssigned = workflow(
    "task-assigned",
    async ({ step, payload }) => {
      const due = formatDeadline(payload.deadline, payload.timezone);
      await step.inApp("assigned-inapp", async () => ({
        subject: `New task: ${s(payload.taskTitle)}`,
        body: `${s(payload.assignerName)} assigned this to you. Due ${due}. Priority: ${s(payload.priority)}.`,
        ...inAppLink(payload, "Open task"),
      }));
      await step.email("assigned-email", async () => ({
        subject: `New assignment: ${s(payload.taskTitle)}`,
        body: emailLayout({
          heading: "You have a new assignment",
          paragraphs: [
            `<strong>${esc(payload.taskTitle)}</strong>`,
            payload.description ? esc(payload.description).replace(/\n/g, "<br>") : "",
            `Assigned by ${esc(payload.assignerName)} in ${esc(payload.organizationName)}.`,
            `<strong>Due:</strong> ${esc(due)} &nbsp;·&nbsp; <strong>Priority:</strong> ${esc(payload.priority)}`,
            payload.githubRef ? `<strong>GitHub:</strong> <a href="${esc(payload.githubIssueUrl)}">${esc(payload.githubRef)}</a>` : "",
          ].filter(Boolean),
          cta: { label: "Open the task", url: payload.url },
          footnote: "Add it to your weekly plan from the task page.",
        }),
      }));
      await step.sms("assigned-sms", async () => ({ body: `Floppy: new task "${s(payload.taskTitle).slice(0, 80)}", due ${due}.` }));
    },
    opts("task-assigned", ["tasks"], smsOff),
  );

  const taskUpdated = workflow(
    "task-updated",
    async ({ step, payload }) => {
      await step.inApp("updated-inapp", async () => ({
        subject: `Task changed: ${s(payload.taskTitle)}`,
        body: `${s(payload.changedBy)} updated it. Due ${formatDeadline(payload.deadline, payload.timezone)}, priority ${s(payload.priority)}.`,
        ...inAppLink(payload, "Open task"),
      }));
    },
    opts("task-updated", ["tasks"]),
  );

  const taskCompleted = workflow(
    "task-completed",
    async ({ step, payload }) => {
      await step.inApp("completed-inapp", async () => ({
        subject: `Done: ${s(payload.taskTitle)}`,
        body: `${s(payload.completedBy) || "The assignee"} marked it done.`,
        ...inAppLink(payload, "Open task"),
      }));
    },
    opts("task-completed", ["tasks"]),
  );

  const taskDeadline = workflow(
    "task-deadline-reminder",
    async ({ step, payload }) => {
      const due = formatDeadline(payload.deadline, payload.timezone);
      await step.inApp("deadline-inapp", async () => ({
        subject: `Due soon: ${s(payload.taskTitle)}`,
        body: `Deadline: ${due}.`,
        ...inAppLink(payload, "Open task"),
      }));
      await step.email("deadline-email", async () => ({
        subject: `Due soon: ${s(payload.taskTitle)}`,
        body: emailLayout({ heading: "A deadline is coming up", paragraphs: [`<strong>${esc(payload.taskTitle)}</strong> is due ${esc(due)}.`], cta: { label: "Open the task", url: payload.url } }),
      }));
      await step.sms("deadline-sms", async () => ({ body: `Floppy: "${s(payload.taskTitle).slice(0, 80)}" is due ${due}.` }));
    },
    opts("task-deadline-reminder", ["tasks", "reminders"], smsOff),
  );

  const taskOverdue = workflow(
    "task-overdue",
    async ({ step, payload }) => {
      await step.inApp("overdue-task-inapp", async () => ({
        subject: `Overdue: ${s(payload.taskTitle)}`,
        body: `The deadline (${formatDeadline(payload.deadline, payload.timezone)}) has passed.`,
        ...inAppLink(payload, "Open task"),
      }));
      await step.email("overdue-task-email", async () => ({
        subject: `Overdue: ${s(payload.taskTitle)}`,
        body: emailLayout({
          heading: "A task is overdue",
          paragraphs: [`<strong>${esc(payload.taskTitle)}</strong> was due ${esc(formatDeadline(payload.deadline, payload.timezone))}. Finish it, or agree a new deadline.`],
          cta: { label: "Open the task", url: payload.url },
        }),
      }));
    },
    opts("task-overdue", ["tasks", "reminders"]),
  );

  const chatMessage = workflow(
    "chat-message",
    async ({ step, payload }) => {
      await step.inApp("message-inapp", async () => ({
        subject: `${s(payload.authorName)} in ${s(payload.conversationTitle)}`,
        body: s(payload.preview),
        ...inAppLink(payload, "Reply"),
      }));
      const { events } = await step.digest("message-digest", async () => ({ amount: 15, unit: "minutes" }));
      await step.email("message-email", async () => {
        const items = events.map((e) => e.payload as Payload);
        const list = items
          .slice(-10)
          .map((p) => `<li style="margin-bottom:8px"><strong>${esc(p.authorName)}</strong> in ${esc(p.conversationTitle)}:<br><span style="color:#44403c">${esc(p.preview)}</span></li>`)
          .join("");
        return {
          subject: items.length > 1 ? `${items.length} new messages on Floppy` : `New message from ${s(payload.authorName)}`,
          body: emailLayout({ heading: "You have unread messages", paragraphs: [`<ul style="padding-left:18px;margin:0">${list}</ul>`], cta: { label: "Open chat", url: payload.url } }),
        };
      });
    },
    opts("chat-message", ["chat"]),
  );

  const chatMention = workflow(
    "chat-mention",
    async ({ step, payload }) => {
      await step.inApp("mention-inapp", async () => ({
        subject: `${s(payload.authorName)} mentioned you`,
        body: s(payload.preview),
        ...inAppLink(payload, "Reply"),
      }));
      await step.email("mention-email", async () => ({
        subject: `${s(payload.authorName)} mentioned you in ${s(payload.conversationTitle)}`,
        body: emailLayout({
          heading: "You were mentioned",
          paragraphs: [`<strong>${esc(payload.authorName)}</strong> in ${esc(payload.conversationTitle)}:`, `<blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid #0f766e;background:#f4f1ea">${esc(payload.preview)}</blockquote>`],
          cta: { label: "Reply", url: payload.url },
        }),
      }));
    },
    opts("chat-mention", ["chat"]),
  );

  const pageUpdated = workflow(
    "page-updated",
    async ({ step, payload }) => {
      const { events } = await step.digest("page-digest", async () => ({ amount: 1, unit: "hours" }));
      await step.inApp("page-inapp", async () => {
        const titles = [...new Set(events.map((e) => s((e.payload as Payload).pageTitle)))];
        return {
          subject: titles.length > 1 ? `${titles.length} pages were updated` : `“${s(payload.pageTitle)}” was updated`,
          body: titles.length > 1 ? titles.slice(0, 5).join(", ") : `${s(payload.editorName)} saved version ${s(payload.version)}.`,
          ...inAppLink(payload, "Read"),
        };
      });
    },
    opts("page-updated", ["pages"]),
  );

  const deletionRequested = workflow(
    "org-deletion-requested",
    async ({ step, payload }) => {
      await step.inApp("deletion-requested-inapp", async () => ({
        subject: `Deletion requested: ${s(payload.organizationName)}`,
        body: `${s(payload.requestedBy)}: “${s(payload.reason)}”`,
        redirect: { url: "/staff/super?tab=deletions", target: "_self" },
      }));
      await step.email("deletion-requested-email", async () => ({
        subject: `Organization deletion requested: ${s(payload.organizationName)}`,
        body: emailLayout({
          heading: "An owner asked to delete their organization",
          paragraphs: [`<strong>${esc(payload.organizationName)}</strong>, requested by ${esc(payload.requestedBy)}.`, `Reason: ${esc(payload.reason)}`, "Review it on the super admin page."],
        }),
      }));
    },
    opts("org-deletion-requested", ["admin"]),
  );

  const deletionDecided = workflow(
    "org-deletion-decided",
    async ({ step, payload }) => {
      const approved = payload.approved === true;
      const text = approved
        ? `${s(payload.organizationName)} has been permanently deleted, as you requested.`
        : `Your request to delete ${s(payload.organizationName)} was declined.${payload.note ? ` Note: ${s(payload.note)}` : ""}`;
      await step.inApp("deletion-decided-inapp", async () => ({ subject: approved ? "Organization deleted" : "Deletion request declined", body: text }));
      await step.email("deletion-decided-email", async () => ({
        subject: approved ? `${s(payload.organizationName)} was deleted` : `Deletion request for ${s(payload.organizationName)} declined`,
        body: emailLayout({ heading: approved ? "Your organization was deleted" : "Your deletion request was declined", paragraphs: [esc(text)] }),
      }));
    },
    opts("org-deletion-decided", ["admin"], critical),
  );

  const accountSuspended = workflow(
    "account-suspended",
    async ({ step, payload }) => {
      const suspended = payload.suspended === true;
      await step.email("account-status-email", async () => ({
        subject: suspended ? "Your Floppy account has been suspended" : "Your Floppy account has been reinstated",
        body: emailLayout({
          heading: suspended ? "Your account is suspended" : "Your account is active again",
          paragraphs: suspended
            ? [`Reason: ${esc(payload.reason)}`, "You can't sign in while the account is suspended. Reply to support if you think this is a mistake."]
            : ["You can sign in again. Everything is where you left it."],
          cta: suspended ? undefined : { label: "Sign in", url: payload.url },
        }),
      }));
    },
    opts("account-suspended", ["account"], critical),
  );

  const testNotification = workflow(
    "test-notification",
    async ({ step, payload }) => {
      await step.inApp("test-inapp", async () => ({
        subject: "Test notification",
        body: `In-app works. Sent ${s(payload.sentAt)}.`,
      }));
      await step.email("test-email", async () => ({
        subject: "Floppy test email",
        body: emailLayout({ heading: `Hi ${esc(payload.firstName)}, email works`, paragraphs: [`This is a test sent at ${esc(payload.sentAt)}.`] }),
      }));
      await step.sms("test-sms", async () => ({ body: `Floppy test SMS: it works (${s(payload.sentAt)}).` }), {
        skip: () => payload.hasPhone !== true,
      });
    },
    opts("test-notification", ["account"]),
  );

  return [
    welcome,
    verificationCode,
    passwordReset,
    orgInvitation,
    memberJoined,
    planSubmitted,
    approvalOverdue,
    planApproved,
    planChanges,
    leadAssigned,
    weeklyPlanReminder,
    weekCloseReminder,
    orgSuspended,
    orgReinstated,
    taskAssigned,
    taskUpdated,
    taskCompleted,
    taskDeadline,
    taskOverdue,
    chatMessage,
    chatMention,
    pageUpdated,
    deletionRequested,
    deletionDecided,
    accountSuspended,
    testNotification,
  ];
}
