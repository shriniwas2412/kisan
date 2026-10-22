// Build step: write the real (hashed) bundle names into the service worker, so the
// first visit caches everything needed for an offline reload. Without this, the
// worker caches index.html but not the JS/CSS it loads, and offline reload is blank.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

const SKIP = [/^sw\.js$/, /\.onnx$/, /^screenshots\//]; // the 6 MB model is cached on first use instead

export function precacheList(files: string[]): string[] {
  return ["./", ...files.filter(f => !SKIP.some(re => re.test(f))).sort()];
}

export function injectPrecache(swSource: string, list: string[]): string {
  if (!swSource.includes("self.__PRECACHE__ = [];")) throw new Error("sw.js has no precache placeholder");
  const version = createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 8);
  return swSource
    .replace("self.__PRECACHE__ = [];", `self.__PRECACHE__ = ${JSON.stringify(list)};`)
    .replace('self.__VERSION__ = "dev";', `self.__VERSION__ = "${version}";`);
}

export function precachePlugin(): Plugin {
  let outDir = "dist";
  const files: string[] = [];
  return {
    name: "kisan-precache",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    generateBundle(_o, bundle) { files.push(...Object.keys(bundle)); },
    writeBundle() {
      const publicFiles = ["index.html", "manifest.webmanifest", "icon.svg", "model/labels.json"];
      const demo = readdirSafe(join(outDir, "demo")).map(f => `demo/${f}`);
      const sw = join(outDir, "sw.js");
      writeFileSync(sw, injectPrecache(readFileSync(sw, "utf8"), precacheList([...new Set([...files, ...publicFiles, ...demo])])));
    },
  };
}

function readdirSafe(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}
