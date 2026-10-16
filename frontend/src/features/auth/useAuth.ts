import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { api } from "../../api/client";
import { queryKeys } from "../../api/queries";
import type { Me } from "../../api/types";
import { useMe } from "../../hooks/queries";
import { tourStore } from "../tours/tourStore";

/** Forget everything cached for the previous account (the user query itself is handled separately). */
const forgetAccountData = (qc: QueryClient) =>
  qc.removeQueries({ predicate: (q) => q.queryKey[0] !== queryKeys.me[0] && q.queryKey[0] !== queryKeys.authConfig[0] });

/**
 * For the sign-in page: start a session as `user`. Deliberately doesn't watch the user query -
 * mounting a new watcher on a failed query re-runs it, which would bounce the page in a loop.
 */
export function useSignedIn() {
  const qc = useQueryClient();
  return useCallback((user: Me) => {
    forgetAccountData(qc);
    qc.setQueryData(queryKeys.me, user);
  }, [qc]);
}

/** The signed-in user (always present inside <AuthGate>) and the actions that change who that is. */
export function useAuth() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const signedIn = useSignedIn();

  const signOut = useCallback(async () => {
    tourStore.stop();
    await api.logout().catch(() => {});
    forgetAccountData(qc);
    await qc.resetQueries({ queryKey: queryKeys.me });              // -> 401 -> the sign-in page
  }, [qc]);

  /** Re-read today's usage (after AI work). */
  const refreshUsage = useCallback(() => qc.invalidateQueries({ queryKey: queryKeys.me }), [qc]);

  return { me: me as Me, isAdmin: me?.role === "admin", signedIn, signOut, refreshUsage };
}
