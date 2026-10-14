"use client";

import type { AssignedTask } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys } from "@/lib/queries";

type Patch = Partial<Pick<AssignedTask, "status" | "deadline">>;

/**
 * Moves a task on the board or calendar. The card moves at once; if the API
 * refuses (no permission, cancelled task…), it jumps back and a toast says why.
 */
export function useUpdateTask(orgId: string) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const listKey = [...keys.tasks(orgId), "list"];
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) =>
      api<AssignedTask | undefined>(`/organizations/${orgId}/tasks/${id}`, { method: "PATCH", json: patch }),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const snapshot = queryClient.getQueriesData<AssignedTask[]>({ queryKey: listKey });
      queryClient.setQueriesData<AssignedTask[]>({ queryKey: listKey }, (old) => old?.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      return { snapshot };
    },
    onError: (error, _vars, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toast.error(errorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: keys.tasks(orgId) });
      void queryClient.invalidateQueries({ queryKey: keys.plans(orgId) });
    },
  });
}
