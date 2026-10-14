"use client";

import type { IssueType } from "@floppy/shared";
import { ISSUE_TYPES, LIMITS, STORY_POINT_SCALE } from "@floppy/shared";
import { Field, Input, Select } from "@/components/ui/field";
import { TYPE_LABEL } from "./task-bits";

/** "Front end, billing" → ["Front end", "billing"]; the API normalises the rest. */
export function parseLabels(text: string) {
  return text
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Type, story points and labels: the Jira-style fields of the assign and edit dialogs. */
export function IssueFields({
  idPrefix,
  type,
  onType,
  points,
  onPoints,
  labels,
  onLabels,
}: {
  idPrefix: string;
  type: IssueType;
  onType: (t: IssueType) => void;
  points: number | null;
  onPoints: (p: number | null) => void;
  labels: string;
  onLabels: (text: string) => void;
}) {
  // Keep an unusual stored value (say 4) selectable alongside the suggested scale.
  const scale = points !== null && !(STORY_POINT_SCALE as readonly number[]).includes(points) ? [...STORY_POINT_SCALE, points].sort((a, b) => a - b) : STORY_POINT_SCALE;
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor={`${idPrefix}-type`}>
          <Select id={`${idPrefix}-type`} value={type} onChange={(e) => onType(e.target.value as IssueType)}>
            {ISSUE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Story points" htmlFor={`${idPrefix}-points`} hint="How big it is, not how long it takes">
          <Select id={`${idPrefix}-points`} value={points ?? ""} onChange={(e) => onPoints(e.target.value ? Number(e.target.value) : null)}>
            <option value="">None</option>
            {scale.map((p) => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Labels (optional)" htmlFor={`${idPrefix}-labels`} hint={`Comma-separated, up to ${LIMITS.maxLabels}. For example: frontend, billing`}>
        <Input id={`${idPrefix}-labels`} value={labels} onChange={(e) => onLabels(e.target.value)} placeholder="frontend, billing" />
      </Field>
    </>
  );
}
