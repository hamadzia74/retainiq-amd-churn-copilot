import { ThemeToggle } from "../../theme/ThemeToggle";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

/** Desktop sidebar: logo, navigation and the theme toggle - nothing else. */
export function Sidebar() {
  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-line bg-panel md:flex">
      <div className="p-4"><Logo /></div>
      <div className="px-2"><NavLinks layoutId="nav-active-desktop" /></div>
      <div className="mt-auto p-3"><ThemeToggle /></div>
    </aside>
  );
}
