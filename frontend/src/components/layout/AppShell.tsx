import { motion } from "motion/react";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TourLauncher, TourPanel, TourRunner } from "../../features/tours";
import { useHealth } from "../../hooks/queries";
import { pageVariants } from "../../motion/variants";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";

// Pages that manage their own scrolling and fill the screen height.
const FULL_HEIGHT = ["/copilot"];

export function AppShell() {
  const { pathname } = useLocation();
  const { data: health } = useHealth();
  const fullHeight = FULL_HEIGHT.some((p) => pathname.startsWith(p));

  useEffect(() => {
    document.getElementById("main")?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      <Sidebar />
      <MobileNav />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Desktop header: Guided Tours. (On phones the button lives in MobileNav's top bar.) */}
        <header className="hidden h-12 shrink-0 items-center justify-end border-b border-line bg-panel px-8 md:flex">
          <TourLauncher />
        </header>

        <main id="main" className={`flex min-h-0 min-w-0 flex-1 flex-col ${fullHeight ? "overflow-hidden" : "overflow-y-auto"}`}>
          {health && !health.llm_available && (
            <div className="shrink-0 border-b border-notice-line bg-notice-bg px-4 py-2 text-xs text-notice-fg sm:px-8">
              LLM unavailable on {health.llm_provider_name}{health.llm_problem ? ` (${health.llm_problem})` : ""}:
              text signals use the keyword fallback, and the Copilot and enrichment are disabled.
            </div>
          )}
          <motion.div key={pathname} variants={pageVariants} initial="hidden" animate="show"
            className={`mx-auto w-full max-w-7xl px-4 sm:px-8 ${fullHeight ? "flex min-h-0 flex-1 flex-col pt-6" : "py-6"}`}>
            <Outlet />
          </motion.div>
        </main>
      </div>

      <TourPanel />
      <TourRunner />
    </div>
  );
}
