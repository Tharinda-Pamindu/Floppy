/**
 * Creates (or promotes) a platform staff or super-admin account. This is the
 * ONLY way to get the "superadmin" role, and staff can't be created through
 * sign-up. The role is stored in Clerk public metadata (only the backend can
 * write it) and mirrored to users.platform_role.
 *
 *   npm run staff:create -- --email ops@example.com --first-name Sam --last-name Ops
 *   npm run superadmin:create -- --email root@example.com --first-name Root --last-name Admin
 *
 * Leave out --password and a strong one is generated and printed once.
 */
import { upsertUserMirror } from "../src/services/sync.js";
import { generatePassword } from "../src/services/superadmin.js";
import { arg, bootstrap } from "./_bootstrap.js";

const role = arg("role");
const email = arg("email")?.toLowerCase();
if ((role !== "staff" && role !== "superadmin") || !email) {
  console.error("Usage: --role staff|superadmin --email <email> [--first-name X] [--last-name Y] [--password P]");
  process.exit(1);
}

const { deps, close } = bootstrap();
try {
  let user = await deps.identity.findUserByEmail(email);
  let password: string | null = null;
  if (user) {
    await deps.identity.setPlatformRole(user.id, role);
    user = { ...user, platformRole: role };
    console.log(`✔ Existing account ${email} is now ${role}.`);
  } else {
    password = arg("password") ?? generatePassword();
    user = await deps.identity.createUser({
      email,
      firstName: arg("first-name") ?? (role === "superadmin" ? "Super" : "Staff"),
      lastName: arg("last-name") ?? "Admin",
      password,
      platformRole: role,
    });
    console.log(`✔ Created ${role} account ${email}.`);
  }
  await upsertUserMirror(deps, user);
  if (password && !arg("password")) console.log(`  Password (shown once): ${password}`);
  console.log(role === "superadmin" ? "  Sign in, then open /staff/super." : "  Sign in, then open /staff.");
} catch (err) {
  console.error("✖ Failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await close();
}
