import { Menu, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { TourLauncher } from "../../features/tours";
import { useIsMobile } from "../../hooks/useMediaQuery";
import { ThemeToggle } from "../../theme/ThemeToggle";
import { Button, Drawer } from "../ui";
import { Logo } from "./Logo";
import { NavLinks } from "./NavLinks";

/** Phones and small tablets: a top bar with a menu button that opens the navigation drawer. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const { pathname } = useLocation();
  const isMobile = useIsMobile();

  useEffect(close, [pathname, close]);                 // navigating closes the drawer
  useEffect(() => { if (!isMobile) close(); }, [isMobile, close]);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-panel px-3 md:hidden">
        <Logo />
        <div className="flex items-center gap-1">
          <TourLauncher compact />
          <Button variant="icon" aria-label="Open menu" aria-expanded={open} onClick={() => setOpen(true)}>
            <Menu size={20} strokeWidth={2} />
          </Button>
        </div>
      </header>

      <Drawer open={open} onClose={close} label="Navigation">
        <div className="flex h-14 items-center justify-between border-b border-line px-3">
          <Logo />
          <Button variant="icon" aria-label="Close menu" onClick={close}><X size={20} strokeWidth={2} /></Button>
        </div>
        <div className="p-2"><NavLinks layoutId="nav-active-mobile" onNavigate={close} /></div>
        <div className="mt-auto border-t border-line p-3">
          <p className="mb-2 text-xs text-muted">Theme</p>
          <ThemeToggle />
        </div>
      </Drawer>
    </>
  );
}
