import type { TaskEvent, TaskEventField } from "@floppy/shared";
import { asc, eq } from "drizzle-orm";
import type { Db, Tx } from "../db/client.js";
import { taskEvents } from "../db/schema.js";
import { displayName, iso, loadPeople } from "./people.js";

export type TaskChange = { field: TaskEventField; from?: string | null; to?: string | null };

/**
 * Appends to a task's history. Assignee values are user ids (shown as names on
 * read), deadlines are ISO strings and labels are joined by ", ". Description
 * changes are recorded without their text. Times come from the database, so
 * one update's entries share a timestamp (ties sort by field).
 */
export async function recordTaskEvents(
  db: Db | Tx,
  ids: { organizationId: string; taskId: string; actorId: string | null },
  changes: TaskChange[],
) {
  if (!changes.length) return;
  await db.insert(taskEvents).values(
    changes.map((c) => ({
      organizationId: ids.organizationId,
      taskId: ids.taskId,
      actorId: ids.actorId,
      field: c.field,
      fromValue: c.from ?? null,
      toValue: c.to ?? null,
    })),
  );
}

/** The history of one task, oldest first. The caller has already checked the task is visible. */
export async function listTaskEvents(db: Db, taskId: string): Promise<TaskEvent[]> {
  const rows = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(asc(taskEvents.createdAt), asc(taskEvents.field));
  const personIds = rows.flatMap((r) => [
    ...(r.actorId ? [r.actorId] : []),
    ...(r.field === "assignee" ? [r.fromValue, r.toValue].filter((v): v is string => !!v) : []),
  ]);
  const people = await loadPeople(db, personIds);
  const name = (id: string | null) => {
    if (!id) return null;
    const p = people.get(id);
    return p ? displayName(p) : "A former member";
  };
  return rows.map((r) => ({
    id: r.id,
    field: r.field as TaskEventField,
    from: r.field === "assignee" ? name(r.fromValue) : r.fromValue,
    to: r.field === "assignee" ? name(r.toValue) : r.toValue,
    actor: r.actorId ? (people.get(r.actorId) ?? null) : null,
    createdAt: iso(r.createdAt)!,
  }));
}
