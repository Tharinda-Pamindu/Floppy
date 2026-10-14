import type { WorkflowId } from "../ports.js";

/** Human names (shown in the Inbox preferences and our settings page). */
export const WORKFLOW_NAMES: Record<WorkflowId, string> = {
  welcome: "Welcome",
  "auth-verification-code": "Verification codes",
  "auth-password-reset": "Password reset",
  "org-invitation": "Organization invitations",
  "member-joined": "New member joined",
  "plan-submitted": "Plan waiting for your approval",
  "approval-overdue": "Approval reminders",
  "plan-approved": "Your plan was approved",
  "plan-changes-requested": "Your plan was sent back",
  "team-lead-assigned": "You were made team lead",
  "weekly-plan-reminder": "Monday: write your plan",
  "week-close-reminder": "Friday: close your week",
  "org-suspended": "Organization suspended",
  "org-reinstated": "Organization reinstated",
  "task-assigned": "New task assigned to you",
  "task-updated": "Task changed",
  "task-completed": "Task you assigned was completed",
  "task-deadline-reminder": "Task deadline coming up",
  "task-overdue": "Task overdue",
  "chat-message": "New chat messages",
  "chat-mention": "You were mentioned",
  "page-updated": "Page updated",
  "org-deletion-requested": "Organization deletion requested",
  "org-deletion-decided": "Organization deletion decision",
  "account-suspended": "Account status",
  "test-notification": "Test notification",
};

/** Security and account messages people can't switch off. */
export const CRITICAL_WORKFLOWS: WorkflowId[] = [
  "auth-verification-code",
  "auth-password-reset",
  "org-invitation",
  "account-suspended",
  "org-deletion-decided",
  "org-suspended",
];
