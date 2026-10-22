import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { precacheList, injectPrecache } from "./precache.ts";

test("precache includes the hashed JS/CSS bundles, the shell and the demo snapshot, not the big model", () => {
  const list = precacheList(["assets/index-AB12.js", "assets/index-CD34.css", "index.html", "sw.js", "model/leaf_classifier.onnx",
    "model/labels.json", "demo/mandi-snapshot-2026-10-20.json", "icon.svg", "manifest.webmanifest"]);
  assert.deepEqual(list, ["./", "assets/index-AB12.js", "assets/index-CD34.css", "demo/mandi-snapshot-2026-10-20.json", "icon.svg",
    "index.html", "manifest.webmanifest", "model/labels.json"]);
});

test("the service worker source has the placeholder and gets the list and a versioned cache name", () => {
  const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(src, /self\.__PRECACHE__ = \[\];/);
  const out = injectPrecache(src, ["./", "assets/index-AB12.js"]);
  assert.match(out, /self\.__PRECACHE__ = \["\.\/","assets\/index-AB12\.js"\];/);
  assert.match(out, /self\.__VERSION__ = "[0-9a-f]{8}";/);
  assert.notEqual(injectPrecache(src, ["./", "assets/index-ZZ.js"]).match(/__VERSION__ = "(\w+)"/)![1], out.match(/__VERSION__ = "(\w+)"/)![1]);
  assert.throws(() => injectPrecache("no placeholder here", []));
});
