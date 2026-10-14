import { NavLink, Outlet } from "react-router-dom";
import { useHealth } from "../hooks/queries";

const NAV = [
  ["/", "Dashboard", "▦"],
  ["/customers", "At-risk customers", "◉"],
  ["/campaign", "Campaign planner", "◎"],
  ["/copilot", "Copilot", "✦"],
  ["/amd", "Powered by AMD", "▲"],
] as const;

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-amd text-sm font-bold text-white">R</div>
      <div className="leading-tight">
        <p className="font-semibold text-white">RetainIQ</p>
        <p className="text-[11px] text-slate-400">Northwind Outfitters</p>
      </div>
    </div>
  );
}

export function AmdBadge() {
  const { data } = useHealth();
  if (!data) return null;
  return (
    <div className="rounded-lg border border-line bg-black/20 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${data.llm_available ? "bg-emerald-500" : "bg-slate-500"}`} />
        <span className="font-medium text-slate-200">{data.llm_available ? "LLM online" : "LLM offline"}</span>
      </div>
      <p className="mt-1 text-slate-400">{data.llm_model}</p>
      <p className="font-medium text-amd">{data.llm_provider_name}</p>
      {data.quota?.daily_cost_remaining_usd != null && (
        <p className="mt-1 text-slate-500">
          Quota left ${data.quota.daily_cost_remaining_usd.toFixed(2)} / ${data.quota.daily_cost_limit_usd?.toFixed(2)} today
        </p>
      )}
    </div>
  );
}

export function Layout() {
  const { data: health } = useHealth();
  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <aside className="border-b border-line bg-panel md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between p-4"><Logo /></div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map(([to, text, icon]) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                isActive ? "bg-amd/15 font-medium text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}>
              <span className="w-4 text-center text-xs">{icon}</span>{text}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden p-3 md:block"><AmdBadge /></div>
      </aside>

      <main className="min-w-0 flex-1">
        {health && !health.llm_available && (
          <div className="border-b border-amber-900 bg-amber-950/40 px-4 py-2 text-xs text-amber-200 sm:px-8">
            LLM unavailable on {health.llm_provider_name}{health.llm_problem ? ` (${health.llm_problem})` : ""}:
            text signals use the keyword fallback, and the Copilot and enrichment are disabled.
          </div>
        )}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
