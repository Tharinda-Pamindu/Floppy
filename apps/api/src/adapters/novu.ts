import { createHmac } from "node:crypto";
import { Novu } from "@novu/api";
import type { NotificationPreferences } from "@floppy/shared";
import { logger } from "../logger.js";
import type { Notifier, SubscriberProfile, WorkflowId } from "../ports.js";
import { CRITICAL_WORKFLOWS, WORKFLOW_NAMES } from "../notifications/catalog.js";

const MAX_RECIPIENTS = 100;

export class NovuNotifier implements Notifier {
  readonly enabled = true;
  private readonly novu: Novu;

  constructor(
    private readonly secretKey: string,
    private readonly applicationIdentifier: string | undefined,
    serverURL?: string,
  ) {
    this.novu = new Novu({ secretKey, ...(serverURL ? { serverURL } : {}) });
  }

  async trigger(workflowId: WorkflowId, to: string | string[], payload: Record<string, unknown>, options?: { transactionId?: string }) {
    const ids = [...new Set(Array.isArray(to) ? to : [to])].filter(Boolean);
    for (let i = 0; i < ids.length; i += MAX_RECIPIENTS) {
      const chunk = ids.slice(i, i + MAX_RECIPIENTS);
      try {
        await this.novu.trigger({
          workflowId,
          to: chunk.map((subscriberId) => ({ subscriberId })),
          payload,
          ...(options?.transactionId ? { transactionId: chunk.length === ids.length ? options.transactionId : `${options.transactionId}-${i}` } : {}),
        });
      } catch (err) {
        // A notification failure never fails the user's action.
        logger.error({ err, workflowId, recipients: chunk.length }, "Novu trigger failed");
      }
    }
  }

  async triggerInline(workflowId: WorkflowId, to: { subscriberId: string; email?: string; phone?: string }, payload: Record<string, unknown>) {
    try {
      await this.novu.trigger({ workflowId, to, payload });
    } catch (err) {
      logger.error({ err, workflowId }, "Novu inline trigger failed");
    }
  }

  async upsertSubscriber(p: SubscriberProfile) {
    const body = {
      email: p.email,
      firstName: p.firstName || null,
      lastName: p.lastName || null,
      phone: p.phone,
      ...(p.timezone ? { timezone: p.timezone } : {}),
    };
    try {
      await this.novu.subscribers.patch(body, p.id);
    } catch (err) {
      if ((err as { statusCode?: number })?.statusCode !== 404) {
        logger.warn({ err, subscriberId: p.id }, "Novu subscriber update failed; trying create");
      }
      try {
        await this.novu.subscribers.create({ subscriberId: p.id, ...body }, false);
      } catch (createErr) {
        logger.error({ err: createErr, subscriberId: p.id }, "Novu subscriber create failed");
      }
    }
  }

  async deleteSubscriber(subscriberId: string) {
    try {
      await this.novu.subscribers.delete(subscriberId);
    } catch (err) {
      logger.warn({ err, subscriberId }, "Novu subscriber delete failed");
    }
  }

  async getPreferences(subscriberId: string): Promise<NotificationPreferences> {
    const { result } = await this.novu.subscribers.preferences.list({ subscriberId });
    const g = result.global.channels;
    return {
      global: { email: g.email ?? true, sms: g.sms ?? true, inApp: g.inApp ?? true },
      workflows: result.workflows.map((w) => ({
        workflowId: w.workflow.identifier,
        name: w.workflow.name || WORKFLOW_NAMES[w.workflow.identifier as WorkflowId] || w.workflow.identifier,
        critical: CRITICAL_WORKFLOWS.includes(w.workflow.identifier as WorkflowId),
        channels: { email: w.channels.email, sms: w.channels.sms, inApp: w.channels.inApp },
      })),
    };
  }

  async updatePreferences(subscriberId: string, input: { workflowId?: string; channels: { email?: boolean; sms?: boolean; inApp?: boolean } }) {
    await this.novu.subscribers.preferences.update(
      { channels: input.channels, ...(input.workflowId ? { workflowId: input.workflowId } : {}) },
      subscriberId,
    );
  }

  /** HMAC so the browser can't open someone else's inbox by guessing their subscriber id. */
  inboxSession(subscriberId: string) {
    if (!this.applicationIdentifier) return null;
    return {
      applicationIdentifier: this.applicationIdentifier,
      subscriberId,
      subscriberHash: createHmac("sha256", this.secretKey).update(subscriberId).digest("hex"),
    };
  }
}

/** Used when NOVU_SECRET_KEY is empty: the app works, notifications are logged and dropped. */
export class DisabledNotifier implements Notifier {
  readonly enabled = false;
  async trigger(workflowId: WorkflowId, to: string | string[]) {
    logger.debug({ workflowId, recipients: Array.isArray(to) ? to.length : 1 }, "Novu disabled; notification skipped");
  }
  async triggerInline(workflowId: WorkflowId) {
    logger.warn({ workflowId }, "Novu disabled; an auth message routed to Novu was dropped");
  }
  async upsertSubscriber() {}
  async deleteSubscriber() {}
  async getPreferences(): Promise<NotificationPreferences> {
    return { global: { email: true, sms: true, inApp: true }, workflows: [] };
  }
  async updatePreferences() {}
  inboxSession() {
    return null;
  }
}
