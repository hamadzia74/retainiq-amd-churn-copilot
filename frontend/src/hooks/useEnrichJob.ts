import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { api } from "../api/client";
import { queryKeys } from "../api/queries";

/** Starts the AMD enrichment job and polls it only while it runs; refreshes all model data once when it ends. */
export function useEnrichJob() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: queryKeys.enrichStatus,
    queryFn: ({ signal }) => api.enrichStatus(signal),
    refetchInterval: (q) => (q.state.data?.state === "running" ? 1000 : false),
  });
  const start = useMutation({
    mutationFn: (force: boolean) => api.startEnrich(force),
    onSuccess: (s) => qc.setQueryData(queryKeys.enrichStatus, s),
  });

  // The model was retrained on the server: everything derived from it is stale now - refresh once.
  const prev = useRef(status.data?.state);
  useEffect(() => {
    const now = status.data?.state;
    if (prev.current === "running" && now === "done") {
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.enrichStatus[0] });
    }
    prev.current = now;
  }, [status.data?.state, qc]);

  return { status: status.data, start };
}
