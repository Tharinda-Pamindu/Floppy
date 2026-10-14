import { describe, expect, it } from "vitest";
import { issueKey, issueKeyPrefix } from "./constants.js";

describe("issue keys", () => {
  it("uses the initials of a multi-word organization name", () => {
    expect(issueKeyPrefix("Harbor Health")).toBe("HH");
    expect(issueKeyPrefix("Acme Rocket Parts Supply Co")).toBe("ARPS");
  });
  it("uses the first four letters of a one-word name", () => {
    expect(issueKeyPrefix("Northwind")).toBe("NORT");
    expect(issueKey("Floppy", 42)).toBe("FLOP-42");
  });
  it("falls back when the name has no letters or digits", () => {
    expect(issueKeyPrefix("—")).toBe("TASK");
  });
});
