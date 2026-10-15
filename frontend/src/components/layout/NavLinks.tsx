import { motion } from "motion/react";
import { NavLink } from "react-router-dom";
import { SPRING } from "../../motion/variants";

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/customers", label: "At-risk customers", icon: "◉" },
  { to: "/campaign", label: "Campaign planner", icon: "◎" },
  { to: "/copilot", label: "Copilot", icon: "✦" },
  { to: "/amd", label: "Powered by AMD", icon: "▲" },
] as const;

/** Vertical navigation. The active highlight slides between items (`layoutId` must be unique per list). */
export function NavLinks({ layoutId, onNavigate }: { layoutId: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon }) => (
        <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
          className={({ isActive }) => `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors max-md:min-h-11 ${
            isActive ? "font-medium text-strong" : "text-muted hover:bg-hover hover:text-fg"}`}>
          {({ isActive }) => (
            <>
              {isActive && <motion.span layoutId={layoutId} transition={SPRING} className="absolute inset-0 rounded-lg bg-amd/15" />}
              <span className="relative w-4 text-center text-xs">{icon}</span>
              <span className="relative">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
