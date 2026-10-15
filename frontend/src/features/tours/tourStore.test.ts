import { describe, expect, it } from "vitest";
import { createTourStore, type StorageLike } from "./tourStore";

function memoryStorage(seed: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...seed };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

const threeSteps = () => 3;

describe("tour store", () => {
  it("starting a tour closes the picker and begins at step 0", () => {
    const s = createTourStore(memoryStorage(), threeSteps);
    s.openPanel();
    s.start("dashboard");
    expect(s.getState()).toMatchObject({ panelOpen: false, activeTourId: "dashboard", stepIndex: 0 });
  });

  it("Back stops at the first step", () => {
    const s = createTourStore(memoryStorage(), threeSteps);
    s.start("dashboard");
    s.back();
    expect(s.getState().stepIndex).toBe(0);
    s.next();
    s.back();
    expect(s.getState().stepIndex).toBe(0);
  });

  it("Next past the last step finishes the tour and marks it completed (persisted)", () => {
    const storage = memoryStorage();
    const s = createTourStore(storage, threeSteps);
    s.start("dashboard");
    s.next(); s.next();
    expect(s.getState().stepIndex).toBe(2);
    s.next();
    expect(s.getState()).toMatchObject({ activeTourId: null, stepIndex: 0, completed: ["dashboard"] });
    expect(createTourStore(storage, threeSteps).getState().completed).toEqual(["dashboard"]);
  });

  it("closing early does not mark the tour completed", () => {
    const s = createTourStore(memoryStorage(), threeSteps);
    s.start("dashboard");
    s.next();
    s.stop();
    expect(s.getState()).toMatchObject({ activeTourId: null, completed: [] });
  });

  it("narration is on by default and the mute choice persists", () => {
    const storage = memoryStorage();
    const s = createTourStore(storage, threeSteps);
    expect(s.getState().muted).toBe(false);
    s.toggleMuted();
    expect(createTourStore(storage, threeSteps).getState().muted).toBe(true);
  });

  it("survives blocked or corrupt storage", () => {
    const broken: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    const s = createTourStore(broken, threeSteps);
    s.toggleMuted();
    expect(s.getState().muted).toBe(true);
    expect(createTourStore(memoryStorage({ "retainiq-tours-completed": "{not json" }), threeSteps).getState().completed).toEqual([]);
  });

  it("notifies subscribers", () => {
    const s = createTourStore(memoryStorage(), threeSteps);
    let calls = 0;
    const unsubscribe = s.subscribe(() => calls++);
    s.openPanel();
    s.closePanel();
    unsubscribe();
    s.openPanel();
    expect(calls).toBe(2);
  });
});
