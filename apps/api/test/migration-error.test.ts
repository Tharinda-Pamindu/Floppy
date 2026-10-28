import { expect, it } from "vitest";
import { migrationFailureDetails } from "../src/db/migration-error.js";

it("finds PostgreSQL authentication and permission codes inside Drizzle's cause", () => {
  for (const code of ["28P01", "42501"]) {
    const error = new Error("Failed query: private SQL and parameters", { cause: { code, message: "private database information" } });
    const output = migrationFailureDetails(error).join("\n");
    expect(output).toContain(`[${code}]`);
    expect(output).not.toContain("private");
  }
});
it("finds network errors inside aggregate connection failures", () => {
  const cause = new AggregateError([{ code: "ENETUNREACH" }, { code: "ECONNREFUSED" }]);
  const output = migrationFailureDetails(new Error("Failed query", { cause })).join("\n");
  expect(output).toContain("[ENETUNREACH]");
  expect(output).toContain("[ECONNREFUSED]");
});
it("reports pooler and TLS causes without exposing URLs, passwords or raw details", () => {
  const output = migrationFailureDetails({ code: "XX000", message: "Tenant or user not found postgresql://private:secret@host/db", cause: { code: "SELF_SIGNED_CERT_IN_CHAIN", detail: "secret" } }).join("\n");
  expect(output).toContain("Session pooler username");
  expect(output).toContain("TLS certificate chain");
  expect(output).not.toMatch(/secret|postgresql:\/\/|private/);
});
it("handles cycles and unknown errors without dumping sensitive content", () => {
  const error: { cause?: unknown; message: string } = { message: "secret plan text" };
  error.cause = error;
  expect(migrationFailureDetails(error).join()).toContain("No recognized database error code");
  expect(migrationFailureDetails(error).join()).not.toContain("secret plan text");
});
