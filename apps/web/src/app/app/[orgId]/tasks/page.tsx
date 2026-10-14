"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { PageLoader } from "@/components/ui/states";

function Tasks({ orgId }: { orgId: string }) {
  const view = useSearchParams().get("view") === "board" ? "board" : "list";
  return <TaskWorkspace orgId={orgId} view={view} />;
}

export default function TasksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <Tasks orgId={orgId} />
    </Suspense>
  );
}
