import { describe, expect, it } from "vitest";
import { APP_ROUTES, findTour, runnableTours, TOURS, tourMinutes } from "./catalogue";

describe("tour catalogue", () => {
  const all = TOURS.flatMap((t) => [t, ...(t.subTours ?? [])]);

  it("has unique ids that findTour resolves", () => {
    const ids = all.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(findTour(id)?.id).toBe(id);
    expect(findTour("nope")).toBeUndefined();
  });

  it("covers every module", () => {
    expect(TOURS.map((t) => t.id)).toEqual(["dashboard", "customers", "campaign", "copilot", "amd"]);
    expect(findTour("customers")?.subTours?.map((s) => s.id)).toEqual(["customers-list", "customer-360"]);
  });

  it("gives every runnable tour complete steps, starting on a real route", () => {
    for (const tour of runnableTours()) {
      expect(tour.steps?.length, tour.id).toBeGreaterThan(0);
      expect(tour.steps![0].route, `${tour.id} must say where it starts`).toBeDefined();
      for (const step of tour.steps!) {
        expect(step.title.trim(), tour.id).not.toBe("");
        expect(step.body.trim(), tour.id).not.toBe("");
        if (step.route) expect(APP_ROUTES as readonly string[]).toContain(step.route);
        if (step.advanceOn === "target-click") expect(step.target, `${tour.id}: click step needs a target`).toBeDefined();
      }
    }
  });

  it("estimates each tour's length in whole minutes", () => {
    for (const tour of runnableTours()) {
      const m = tourMinutes(tour);
      expect(Number.isInteger(m) && m >= 1 && m <= 5, `${tour.id}: ${m} min`).toBe(true);
    }
  });

  it("keeps narration short enough to read aloud", () => {
    for (const tour of runnableTours()) {
      for (const step of tour.steps!) expect(step.body.length, step.title).toBeLessThan(260);
    }
  });
});
