"use client";

import type { ApiFetch } from "./api";

/** Downloads an authenticated API response as a file (the API needs a Bearer header, so a plain link won't do). */
export async function downloadFrom(api: ApiFetch, path: string, fallbackName: string) {
  const res = await api<Response>(path, { raw: true });
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
