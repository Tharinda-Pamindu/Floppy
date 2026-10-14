/** Tiny, dependency-free email layout. Every interpolated value is HTML-escaped. */

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links make it into an email. */
export function safeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function emailLayout(input: { heading: string; paragraphs: string[]; cta?: { label: string; url: unknown }; footnote?: string }) {
  const url = input.cta ? safeUrl(input.cta.url) : null;
  const paragraphs = input.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p}</p>`).join("");
  const button = url
    ? `<p style="margin:22px 0"><a href="${esc(url)}" style="background:#0f766e;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:999px;font-weight:600;display:inline-block">${esc(input.cta!.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:2px solid #1c1917;border-radius:14px" cellpadding="0" cellspacing="0">
<tr><td style="padding:18px 24px;border-bottom:2px solid #1c1917;font-weight:800;letter-spacing:.02em">Floppy <span style="font-weight:400;color:#57534e">· Less strain. More brain.</span></td></tr>
<tr><td style="padding:24px">
<h1 style="font-size:20px;margin:0 0 16px">${esc(input.heading)}</h1>
${paragraphs}${button}
${input.footnote ? `<p style="margin:18px 0 0;font-size:12px;color:#78716c">${input.footnote}</p>` : ""}
</td></tr></table>
<p style="font-size:12px;color:#78716c;margin:14px 0 0">You can change which emails you get under Settings → Notifications.</p>
</td></tr></table></body></html>`;
}

export function formatDeadline(isoString: unknown, timeZone?: unknown): string {
  const d = new Date(String(isoString));
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  };
  try {
    return d.toLocaleString("en-US", { ...opts, timeZone: typeof timeZone === "string" && timeZone ? timeZone : "UTC" });
  } catch {
    return d.toLocaleString("en-US", { ...opts, timeZone: "UTC" });
  }
}
