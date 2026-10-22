// Read aloud in Hindi with the phone's own speechSynthesis. Used only if the phone has a
// Hindi voice; otherwise the button is hidden. Spoken text repeats what is on screen.
export type VoiceLike = { lang: string; name: string };

export function pickHindiVoice<V extends VoiceLike>(voices: V[]): V | null {
  return voices.find(v => /^hi([-_]|$)/i.test(v.lang)) ?? null;
}

export function priceSpeech(p: { cropHi: string; modal: number; market: string; dateHi: string; snapshot: boolean }): string {
  const when = p.snapshot ? `${p.dateHi} का भाव, यह आज का भाव नहीं है` : `${p.dateHi} का भाव`;
  return `${p.cropHi}, ${p.market} मंडी में ${Math.round(p.modal)} रुपये प्रति क्विंटल। ${when}। स्रोत: एगमार्कनेट।`;
}

export function adviceSpeech(line: string, days: number | null): string {
  return days != null ? `${line}। लगभग ${days} दिन बाद अगली सिंचाई। पहले हाथ से मिट्टी की नमी देखें।` : `${line}। पहले हाथ से मिट्टी की नमी देखें।`;
}

export function leafSpeech(r: { confident: boolean; topHi: string[] }): string {
  const head = r.confident ? `सबसे संभावित: ${r.topHi[0]}।` : `मॉडल पक्का नहीं है। संभावनाएं: ${r.topHi.join(", ")}।`;
  return `${head} यह निदान नहीं है। पत्ती KVK या कृषि अधिकारी को दिखाएं।`;
}
