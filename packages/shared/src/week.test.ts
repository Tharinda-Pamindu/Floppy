import { describe, expect, it } from "vitest";
import {
  addWeeks,
  canPlanWeek,
  isMonday,
  mondayOf,
  weekLabel,
  weekRange,
  zonedParts,
} from "./week.js";

describe("week helpers", () => {
  const wednesday = new Date("2026-10-14T10:00:00Z");

  it("finds the Monday of the week", () => {
    expect(mondayOf(wednesday)).toBe("2026-10-12");
    expect(mondayOf(new Date("2026-10-18T23:00:00Z"))).toBe("2026-10-12"); // Sunday
    expect(mondayOf(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-12");
  });

  it("recognises Mondays and rejects junk", () => {
    expect(isMonday("2026-10-12")).toBe(true);
    expect(isMonday("2026-10-13")).toBe(false);
    expect(isMonday("2026-02-30")).toBe(false);
    expect(isMonday("12/10/2026")).toBe(false);
  });

  it("only allows last, this and next week", () => {
    expect(canPlanWeek("2026-10-05", wednesday)).toBe(true);
    expect(canPlanWeek("2026-10-12", wednesday)).toBe(true);
    expect(canPlanWeek("2026-10-19", wednesday)).toBe(true);
    expect(canPlanWeek("2026-09-28", wednesday)).toBe(false);
    expect(canPlanWeek("2026-10-26", wednesday)).toBe(false);
  });

  it("labels weeks", () => {
    expect(weekLabel("2026-10-12", wednesday)).toBe("This week");
    expect(weekLabel(addWeeks("2026-10-12", -1), wednesday)).toBe("Last week");
    expect(weekLabel("2026-09-28", wednesday)).toBe("Week of Sep 28");
    expect(weekRange("2026-10-12")).toBe("Oct 12 – Oct 16");
  });

  it("reads wall-clock time in a time zone", () => {
    // 03:30 UTC Monday is 09:00 Monday in Colombo (UTC+5:30).
    const parts = zonedParts(new Date("2026-10-12T03:30:00Z"), "Asia/Colombo");
    expect(parts).toMatchObject({ weekday: 1, hour: 9, minute: 0, monday: "2026-10-12" });
    // The same instant is still Sunday evening in Los Angeles.
    expect(zonedParts(new Date("2026-10-12T03:30:00Z"), "America/Los_Angeles").weekday).toBe(0);
  });
});
