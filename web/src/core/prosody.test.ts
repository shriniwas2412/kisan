import { test } from "node:test";
import assert from "node:assert/strict";
import { phrases, normalizeForSpeech, PAUSE } from "./prosody.ts";
import { pickHindiVoice, priceSpeech } from "./speech.ts";

test("read-aloud: price text becomes Hindi words in short phrases", () => {
  const text = priceSpeech({ cropHi: "गेहूं", modal: 2450, market: "Bhopal", dateHi: "20 अक्टूबर", snapshot: true });
  const p = phrases(text, "hi-IN");
  assert.ok(p.length >= 3);
  assert.match(normalizeForSpeech(text, "hi-IN"), /दो हज़ार चार सौ पचास रुपये/);
  assert.equal(p[0].pauseMs, PAUSE.comma);
});

test("the most natural Hindi voice is picked: neural, then Google, then others", () => {
  const v = (name: string, lang: string) => ({ name, lang });
  assert.equal(pickHindiVoice([v("Lekha", "hi-IN"), v("Google हिन्दी", "hi-IN"), v("Samantha", "en-US")])!.name, "Google हिन्दी");
  assert.equal(pickHindiVoice([v("Google हिन्दी", "hi-IN"), v("Microsoft Madhur Online (Natural) - Hindi (India)", "hi-IN")])!.name, "Microsoft Madhur Online (Natural) - Hindi (India)");
  assert.equal(pickHindiVoice([v("Samantha", "en-US")]), null);
});
