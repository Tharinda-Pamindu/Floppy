import { describe, expect, it } from "vitest";
import { emailLayout, esc, safeUrl } from "../src/notifications/email.js";
import { CRITICAL_WORKFLOWS, WORKFLOW_NAMES } from "../src/notifications/catalog.js";
import { buildWorkflows } from "../src/notifications/workflows.js";
import type { Db } from "../src/db/client.js";

describe("Novu workflows", () => {
  it("defines exactly one code-first workflow per workflow id the API triggers", () => {
    const ids = buildWorkflows({} as Db).map((w) => w.id).sort();
    expect(ids).toEqual(Object.keys(WORKFLOW_NAMES).sort());
    for (const id of CRITICAL_WORKFLOWS) expect(ids).toContain(id);
  });
});

describe("email rendering", () => {
  it("escapes everything users can type", () => {
    expect(esc(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    const html = emailLayout({ heading: "<b>hi</b>", paragraphs: [esc("<img src=x onerror=1>")] });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt;");
  });

  it("only links to http(s) URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://floppy.test/x")).toBe("https://floppy.test/x");
    expect(emailLayout({ heading: "h", paragraphs: [], cta: { label: "Go", url: "javascript:alert(1)" } })).not.toContain("javascript:");
  });
});
