import { useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { ApiError, setSignedOutHandler } from "../../api/client";
import { queryKeys } from "../../api/queries";
import { Button, ErrorState, Spinner } from "../../components/ui";
import { useMe } from "../../hooks/queries";
import { LoginPage } from "./LoginPage";

/**
 * Shows the app only to a signed-in user; otherwise the sign-in page (at whatever URL was opened,
 * so signing in lands you where you meant to go). If any request later finds the session gone,
 * the user is sent back here.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useMe();

  useEffect(() => {
    // Drop the stale user and ask again: the server answers 401, and the sign-in page appears.
    setSignedOutHandler(() => void qc.resetQueries({ queryKey: queryKeys.me }));
    return () => setSignedOutHandler(() => {});
  }, [qc]);

  if (me.data) return <>{children}</>;
  if (me.error instanceof ApiError && me.error.status === 401) return <LoginPage />;
  if (me.error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink p-4">
        <div className="w-full max-w-sm space-y-3">
          <ErrorState error={new Error(`Couldn't reach RetainIQ: ${me.error.message}`)} />
          <Button onClick={() => me.refetch()} className="w-full">Try again</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-ink" role="status" aria-label="Loading">
      <Spinner className="h-6 w-6" />
    </div>
  );
}
