/**
 * Clerk webhooks (verified with the svix signature before reaching here).
 * They keep the Supabase mirror in step and, when CLERK_EMAILS_VIA_NOVU is on,
 * deliver Clerk's own auth emails and SMS through Novu.
 */
import type { WebhookEvent } from "@clerk/express/webhooks";
import { eq } from "drizzle-orm";
import type { Deps } from "../context.js";
import { organizations, users } from "../db/schema.js";
import { logger } from "../logger.js";
import type { WorkflowId } from "../ports.js";
import {
  applyMembership,
  ensureOrganizationMirror,
  notifyMemberJoined,
  removeMembershipMirror,
  upsertUserMirror,
} from "./sync.js";

const EMAIL_WORKFLOWS: Record<string, WorkflowId> = {
  verification_code: "auth-verification-code",
  magic_link_sign_up: "auth-verification-code",
  magic_link_sign_in: "auth-verification-code",
  reset_password_code: "auth-password-reset",
  organization_invitation: "org-invitation",
};

export async function handleClerkEvent(deps: Deps, event: WebhookEvent) {
  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const user = await deps.identity.getUser(event.data.id);
      if (user) await upsertUserMirror(deps, user);
      return;
    }
    case "user.deleted": {
      if (!event.data.id) return;
      await deps.db.delete(users).where(eq(users.id, event.data.id));
      await deps.notifier.deleteSubscriber(event.data.id);
      return;
    }
    case "organization.created":
      await ensureOrganizationMirror(deps.db, event.data.id, event.data.name);
      return;
    case "organization.updated":
      await deps.db.update(organizations).set({ name: event.data.name, updatedAt: deps.now() }).where(eq(organizations.id, event.data.id));
      return;
    case "organization.deleted":
      if (event.data.id) await deps.db.delete(organizations).where(eq(organizations.id, event.data.id));
      return;
    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const orgId = event.data.organization.id;
      const userId = event.data.public_user_data.user_id;
      const m = await deps.identity.getMembership(orgId, userId);
      if (!m) return;
      // Make sure the person exists locally before the membership row references them.
      const person = await deps.identity.getUser(userId);
      if (person) await upsertUserMirror(deps, person);
      await applyMembership(deps.db, m);
      if (event.type === "organizationMembership.created") await notifyMemberJoined(deps, m);
      return;
    }
    case "organizationMembership.deleted":
      await removeMembershipMirror(deps.db, event.data.organization.id, event.data.public_user_data.user_id);
      return;
    case "email.created": {
      if (!deps.config.CLERK_EMAILS_VIA_NOVU || event.data.delivered_by_clerk) return;
      const workflow = EMAIL_WORKFLOWS[event.data.slug ?? ""];
      const to = event.data.to_email_address;
      if (!workflow || !to) {
        logger.warn({ slug: event.data.slug }, "Clerk email with no Novu workflow mapped; it was not delivered");
        return;
      }
      const data = event.data.data ?? {};
      await deps.notifier.triggerInline(
        workflow,
        { subscriberId: event.data.user_id ?? `email:${to.toLowerCase()}`, email: to },
        {
          code: data.otp_code ?? null,
          url: data.action_url ?? data.magic_link ?? null,
          organizationName: data.org?.name ?? data.organization_name ?? null,
          inviterName: data.inviter_name ?? null,
          appName: data.app?.name ?? "Floppy",
          channel: "email",
        },
      );
      return;
    }
    case "sms.created": {
      if (!deps.config.CLERK_EMAILS_VIA_NOVU || event.data.delivered_by_clerk) return;
      const data = event.data.data ?? {};
      await deps.notifier.triggerInline(
        "auth-verification-code",
        { subscriberId: event.data.user_id ?? `phone:${event.data.to_phone_number}`, phone: event.data.to_phone_number },
        { code: data.otp_code ?? null, message: event.data.message, appName: "Floppy", channel: "sms" },
      );
      return;
    }
    default:
      return;
  }
}
