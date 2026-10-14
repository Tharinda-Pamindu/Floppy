import { createPageSchema, LIMITS, movePageSchema, savePageVersionSchema } from "@floppy/shared";
import express, { Router } from "express";
import { z } from "zod";
import type { Deps } from "../context.js";
import { invalid } from "../errors.js";
import {
  archivePage,
  createPage,
  exportMarkdown,
  getPage,
  importMarkdown,
  listPages,
  listVersions,
  movePage,
  saveVersion,
} from "../services/pages.js";
import { ctx, param, parse } from "./util.js";

const versionParam = z.coerce.number().int().min(1);
const importQuery = z.object({
  baseVersion: z.coerce.number().int().min(1),
  fileName: z.string().max(200).optional(),
});

export function pageRoutes(deps: Deps) {
  const r = Router({ mergeParams: true });

  r.get("/", async (req, res) => {
    res.json(await listPages(deps, ctx(req).org));
  });

  r.post("/", async (req, res) => {
    const { org, user } = ctx(req);
    const page = await createPage(deps, org, user, parse(createPageSchema, req.body));
    res.status(201).json(await getPage(deps, org, page.id));
  });

  r.get("/:pageId", async (req, res) => {
    res.json(await getPage(deps, ctx(req).org, param(req, "pageId")));
  });

  r.put("/:pageId", async (req, res) => {
    const { org, user } = ctx(req);
    await saveVersion(deps, org, user, param(req, "pageId"), parse(savePageVersionSchema, req.body));
    res.json(await getPage(deps, org, param(req, "pageId")));
  });

  r.patch("/:pageId", async (req, res) => {
    const { org } = ctx(req);
    await movePage(deps, org, param(req, "pageId"), parse(movePageSchema, req.body));
    res.json(await getPage(deps, org, param(req, "pageId")));
  });

  r.delete("/:pageId", async (req, res) => {
    await archivePage(deps, ctx(req).org, param(req, "pageId"));
    res.status(204).end();
  });

  r.get("/:pageId/versions", async (req, res) => {
    res.json(await listVersions(deps, ctx(req).org, param(req, "pageId")));
  });

  r.get("/:pageId/versions/:version", async (req, res) => {
    const version = parse(versionParam, param(req, "version"));
    res.json(await getPage(deps, ctx(req).org, param(req, "pageId"), version));
  });

  /** Download a version as a .md file. */
  r.get("/:pageId/export", async (req, res) => {
    const version = req.query.version ? parse(versionParam, req.query.version) : undefined;
    const file = await exportMarkdown(deps, ctx(req).org, param(req, "pageId"), version);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.fileName}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(file.body);
  });

  /** Upload a .md file (raw body) as a new version. */
  r.post(
    "/:pageId/import",
    express.raw({ type: () => true, limit: LIMITS.pageBodyMaxBytes + 1024 }),
    async (req, res) => {
      const { org, user } = ctx(req);
      const type = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      if (!["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream", ""].includes(type)) {
        throw invalid("Upload a .md (markdown) file.", "file");
      }
      const q = parse(importQuery, req.query);
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!raw.length) throw invalid("The file is empty.", "file");
      await importMarkdown(deps, org, user, param(req, "pageId"), { raw, baseVersion: q.baseVersion, fileName: q.fileName });
      res.json(await getPage(deps, org, param(req, "pageId")));
    },
  );

  return r;
}
