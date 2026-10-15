import { Check, Play, RotateCcw, X } from "lucide-react";
import { motion } from "motion/react";
import { Modal } from "../../components/ui";
import { rowVariants } from "../../motion/variants";
import { TOURS, tourMinutes } from "./catalogue";
import { tourStore, useTourState } from "./tourStore";
import type { Tour } from "./types";

const meta = (t: Tour) => `${t.steps?.length ?? 0} steps · about ${tourMinutes(t)} min`;

/** Start (or replay, once watched) one tour. */
function StartButton({ tour, done }: { tour: Tour; done: boolean }) {
  return (
    <button type="button" onClick={() => tourStore.start(tour.id)} aria-label={`${done ? "Replay" : "Start"} ${tour.label} tour`}
      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
        done ? "border border-line text-soft hover:bg-hover hover:text-strong" : "bg-amd text-white hover:bg-amd-dark"}`}>
      {done ? <RotateCcw size={12} /> : <Play size={12} fill="currentColor" />}
      {done ? "Replay" : "Start"}
    </button>
  );
}

function Watched() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-positive">
      <Check size={12} strokeWidth={3} /> Watched
    </span>
  );
}

/** One module tile. Groups (Customers) list their sub-tours inside the tile. */
function TourTile({ tour, completed, index }: { tour: Tour; completed: string[]; index: number }) {
  const Icon = tour.icon;
  const done = completed.includes(tour.id);
  return (
    <motion.li variants={rowVariants} custom={index} initial="hidden" animate="show"
      className={`flex flex-col rounded-xl border border-line bg-sunken p-4 ${tour.subTours ? "sm:col-span-2" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-panel text-amd-fg ring-1 ring-line">
          <Icon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-strong">{tour.label}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted">{tour.description}</p>
        </div>
      </div>

      {tour.subTours ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {tour.subTours.map((sub) => {
            const subDone = completed.includes(sub.id);
            return (
              <li key={sub.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-strong">{sub.label}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">
                    {meta(sub)} {subDone && <Watched />}
                  </p>
                </div>
                <StartButton tour={sub} done={subDone} />
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-subtle">{meta(tour)} {done && <Watched />}</p>
          <StartButton tour={tour} done={done} />
        </div>
      )}
    </motion.li>
  );
}

/** The tour picker: a grid of module tiles in a centred dialog (bottom sheet on phones). */
export function TourPanel() {
  const open = useTourState((s) => s.panelOpen);
  const completed = useTourState((s) => s.completed);

  return (
    <Modal open={open} onClose={tourStore.closePanel} label="Guided Tours" className="sm:max-w-2xl">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-strong">Guided Tours</h2>
          <p className="mt-0.5 text-sm text-muted">Narrated walkthroughs of each part of RetainIQ</p>
        </div>
        <button type="button" onClick={tourStore.closePanel} aria-label="Close"
          className="-mr-2 -mt-1 grid h-10 w-10 place-items-center rounded-full text-muted hover:bg-hover hover:text-strong">
          <X size={18} />
        </button>
      </div>
      <ul className="grid flex-1 gap-3 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:grid-cols-2 sm:px-6">
        {TOURS.map((tour, i) => <TourTile key={tour.id} tour={tour} completed={completed} index={i} />)}
      </ul>
    </Modal>
  );
}
