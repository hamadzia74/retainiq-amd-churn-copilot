import { BookMarked } from "lucide-react";
import { Button } from "../../components/ui";
import { tourStore, useTourState } from "./tourStore";

/** Header button that opens the Guided Tours picker. Hidden while a tour is running. */
export function TourLauncher({ compact = false }: { compact?: boolean }) {
  const running = useTourState((s) => s.activeTourId !== null);
  const open = useTourState((s) => s.panelOpen);
  if (running) return null;
  return compact ? (
    <Button variant="icon" aria-label="Guided Tours" title="Guided Tours" aria-expanded={open} onClick={tourStore.togglePanel}>
      <BookMarked size={19} strokeWidth={2} />
    </Button>
  ) : (
    <Button variant="ghost" aria-expanded={open} onClick={tourStore.togglePanel} className="py-1.5">
      <BookMarked size={15} strokeWidth={2} /> Guided Tours
    </Button>
  );
}
