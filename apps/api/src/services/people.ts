import type { PersonRef } from "@floppy/shared";
import { inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { users } from "../db/schema.js";

type UserLike = Pick<typeof users.$inferSelect, "id" | "firstName" | "lastName" | "email" | "imageUrl">;

export function personRef(u: UserLike): PersonRef {
  return { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, imageUrl: u.imageUrl };
}

export function displayName(u: Pick<UserLike, "firstName" | "lastName" | "email">): string {
  return `${u.firstName} ${u.lastName}`.trim() || u.email;
}

/** Load people by id in one query; missing ids map to undefined. */
export async function loadPeople(db: Db, ids: (string | null | undefined)[]): Promise<Map<string, PersonRef>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const rows = await db.select().from(users).where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, personRef(r)]));
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
