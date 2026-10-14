"use client";

import { Suspense, use } from "react";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { PageLoader } from "@/components/ui/states";

export default function CalendarPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <Suspense fallback={<PageLoader label="Loading the calendar…" />}>
      <TaskWorkspace orgId={orgId} view="calendar" />
    </Suspense>
  );
}
