import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
import { shouldRetry } from "../api/queries";
import { ThemeProvider } from "../theme/ThemeProvider";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: shouldRetry, refetchOnWindowFocus: false } },
});

/** Everything the app needs around it: theme, data cache, routing, motion settings. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/* reducedMotion="user": every animation is skipped when the OS asks for reduced motion. */}
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
