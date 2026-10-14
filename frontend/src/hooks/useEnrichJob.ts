import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../api/client";

/** Starts the AMD enrichment job and polls it; refreshes every view when it finishes. */
export function useEnrichJob() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["enrich-status"],
    queryFn: api.enrichStatus,
    refetchInterval: (q) => (q.state.data?.state === "running" ? 500 : false),
  });
  const start = useMutation({
    mutationFn: (force: boolean) => api.startEnrich(force),
    onSuccess: (s) => qc.setQueryData(["enrich-status"], s),
  });

  // Model + scores changed on the server: everything else is stale now.
  const prev = useRef(status.data?.state);
  useEffect(() => {
    const now = status.data?.state;
    if (prev.current === "running" && now === "done") {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "enrich-status" });
    }
    prev.current = now;
  }, [status.data?.state, qc]);

  return { status: status.data, start };
}
