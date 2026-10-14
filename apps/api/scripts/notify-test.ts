/**
 * Sends the `test-notification` workflow to one user on every channel:
 * in-app (watch the bell), email (Resend) and SMS (Twilio, if they saved a
 * phone number in Settings → Notifications).
 *
 *   npm run notify:test -- --user you@example.com
 */
import { eq, sql } from "drizzle-orm";
import { users } from "../src/db/schema.js";
import { sendTestNotification } from "../src/services/me.js";
import { arg, bootstrap } from "./_bootstrap.js";

const email = arg("user")?.toLowerCase();
if (!email) {
  console.error("Usage: npm run notify:test -- --user <email>");
  process.exit(1);
}
const { deps, close } = bootstrap();
try {
  if (!deps.notifier.enabled) throw new Error("NOVU_SECRET_KEY is empty in apps/api/.env.");
  const [user] = await deps.db.select().from(users).where(eq(sql`lower(${users.email})`, email));
  if (!user) throw new Error(`No user with email ${email}. Sign in once in the web app first.`);
  const { channels } = await sendTestNotification(deps, user);
  console.log(`✔ Triggered test-notification for ${email}: in-app ✓, email ✓, SMS ${channels.sms ? "✓" : "– (no phone saved)"}`);
  console.log("  Check the Novu dashboard → Activity feed for delivery status per channel.");
} catch (err) {
  console.error("✖", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await close();
}
