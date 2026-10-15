// Tour state in a tiny external store (React's useSyncExternalStore, no library).
// Completed tours and the narration mute choice persist in localStorage.
import { useSyncExternalStore } from "react";
import { findTour } from "./catalogue";

export interface TourState {
  panelOpen: boolean;
  activeTourId: string | null;
  stepIndex: number;
  completed: string[];
  muted: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const COMPLETED_KEY = "retainiq-tours-completed";
const MUTED_KEY = "retainiq-tours-muted";

function read<T>(storage: StorageLike | null, key: string, fallback: T): T {
  try {
    const raw = storage?.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(storage: StorageLike | null, key: string, value: unknown) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: the choice still applies for this visit */
  }
}

export function createTourStore(storage: StorageLike | null, stepCount: (tourId: string) => number) {
  let state: TourState = {
    panelOpen: false,
    activeTourId: null,
    stepIndex: 0,
    completed: read<string[]>(storage, COMPLETED_KEY, []),
    muted: read<boolean>(storage, MUTED_KEY, false),      // narration is on by default
  };
  const listeners = new Set<() => void>();

  const set = (patch: Partial<TourState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  const finish = () => {
    const id = state.activeTourId;
    const completed = id && !state.completed.includes(id) ? [...state.completed, id] : state.completed;
    write(storage, COMPLETED_KEY, completed);
    set({ activeTourId: null, stepIndex: 0, completed });
  };

  return {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openPanel: () => set({ panelOpen: true }),
    closePanel: () => set({ panelOpen: false }),
    togglePanel: () => set({ panelOpen: !state.panelOpen }),
    /** Starting a tour closes the picker and begins at the first step. */
    start: (tourId: string) => set({ activeTourId: tourId, stepIndex: 0, panelOpen: false }),
    /** Close without completing. */
    stop: () => set({ activeTourId: null, stepIndex: 0 }),
    /** Next step; past the last step the tour finishes and is marked completed. */
    next: () => {
      if (!state.activeTourId) return;
      if (state.stepIndex >= stepCount(state.activeTourId) - 1) finish();
      else set({ stepIndex: state.stepIndex + 1 });
    },
    back: () => set({ stepIndex: Math.max(0, state.stepIndex - 1) }),
    toggleMuted: () => {
      write(storage, MUTED_KEY, !state.muted);
      set({ muted: !state.muted });
    },
  };
}

export type TourStore = ReturnType<typeof createTourStore>;

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const tourStore = createTourStore(browserStorage(), (id) => findTour(id)?.steps?.length ?? 0);

/** Subscribe to one slice of tour state. Selectors must return primitives or stable references. */
export function useTourState<T>(selector: (s: TourState) => T): T {
  return useSyncExternalStore(tourStore.subscribe, () => selector(tourStore.getState()), () => selector(tourStore.getState()));
}
