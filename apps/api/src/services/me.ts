import type { DeadlineLead, MeResponse, PlatformRole } from "@floppy/shared";
import { eq } from "drizzle-orm";
import type { Deps } from "../context.js";
import { userSettings, users } from "../db/schema.js";
import { AppError } from "../errors.js";
import { personRef } from "./people.js";
import type { UserRow } from "./sync.js";

async function settingsFor(deps: Deps, userId: string) {
  const [row] = await deps.db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (row) return row;
  const [created] = await deps.db.insert(userSettings).values({ userId }).onConflictDoNothing().returning();
  return created ?? (await deps.db.select().from(userSettings).where(eq(userSettings.userId, userId)))[0]!;
}

export async function getMe(deps: Deps, user: UserRow): Promise<MeResponse> {
  const s = await settingsFor(deps, user.id);
  return {
    ...personRef(user),
    platformRole: user.platformRole as PlatformRole,
    settings: { timezone: s.timezone, phone: s.phone, deadlineLead: s.deadlineLead as DeadlineLead },
  };
}

export async function updateSettings(
  deps: Deps,
  user: UserRow,
  input: { timezone?: string; phone?: string | null; deadlineLead?: DeadlineLead },
) {
  await settingsFor(deps, user.id);
  const changes: Partial<typeof userSettings.$inferInsert> = { updatedAt: deps.now() };
  if (input.timezone !== undefined) changes.timezone = input.timezone;
  if (input.phone !== undefined) changes.phone = input.phone;
  if (input.deadlineLead !== undefined) changes.deadlineLead = input.deadlineLead;
  const [s] = await deps.db.update(userSettings).set(changes).where(eq(userSettings.userId, user.id)).returning();
  // Novu needs the phone number (SMS) and timezone on the subscriber.
  await deps.notifier.upsertSubscriber({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: s!.phone,
    timezone: s!.timezone,
  });
  return getMe(deps, (await deps.db.select().from(users).where(eq(users.id, user.id)))[0]!);
}

export function requireNotifications(deps: Deps) {
  if (!deps.notifier.enabled) {
    throw new AppError(503, "NOTIFICATIONS_UNAVAILABLE", "Notifications aren't set up on this server yet (NOVU_SECRET_KEY is empty).");
  }
}

/** Sends the `test-notification` workflow to yourself on every channel you have enabled. */
export async function sendTestNotification(deps: Deps, user: UserRow) {
  requireNotifications(deps);
  const s = await settingsFor(deps, user.id);
  await deps.notifier.upsertSubscriber({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: s.phone,
    timezone: s.timezone,
  });
  await deps.notifier.trigger("test-notification", user.id, {
    firstName: user.firstName || "there",
    sentAt: deps.now().toISOString(),
    hasPhone: !!s.phone,
  });
  return { channels: { inApp: true, email: true, sms: !!s.phone } };
}
