// "About this project & limits": what the app is for, what it cannot do, what leaves the
// phone, and where each number comes from. Numbers are read from the same constants the
// app uses (checked by about.test.ts).
import { LEAF_LIMITS as L } from "./leafCrops.ts";
import { SNAPSHOT_FILE } from "./demo.ts";

type Text = { hi: string; en: string };
export type AboutSection = { title: Text; body: Text[]; links?: { href: string; label: string }[] };
const snap = SNAPSHOT_FILE.replace("demo/", "");

export const ABOUT: AboutSection[] = [
  {
    title: { hi: "यह ऐप किसलिए है", en: "What this app is for" },
    body: [
      { hi: "किसान और फील्ड कार्यकर्ता के लिए: मंडी भाव, मौसम, सिंचाई सलाह, पत्ती जांच, योजनाएं और किसान रिकॉर्ड। बिना इंटरनेट भी चलता है।",
        en: "For farmers and field workers: mandi prices, weather, irrigation advice, a leaf check, schemes and farmer records. It works without internet too." },
      { hi: "यह सलाह का औज़ार है, निदान नहीं। दवा और मात्रा के लिए KVK या कृषि अधिकारी से पूछें।",
        en: "It is an advice tool, not a diagnosis. Ask the KVK or agri officer for any spray and dose." },
    ],
    links: [{ href: "https://github.com/shriniwas2412/kisan", label: "Code and README (GitHub)" }],
  },
  {
    title: { hi: "पत्ती जांच की सीमा", en: "Leaf check limits" },
    body: [
      { hi: `PlantDoc की ${L.testImages} टेस्ट फ़ोटो पर: पहला अनुमान ${L.top1Pct}% सही, सही उत्तर पहले 3 में ${L.top3Pct}%। ${L.threshold * 100}% से ज़्यादा भरोसे पर ही रोग बताता है: ऐसा ${L.coveragePct}% फ़ोटो में होता है और उनमें ${L.accuracyWhenConfidentPct}% सही।`,
        en: `On ${L.testImages} PlantDoc test photos: first guess right ${L.top1Pct}%, right answer in the top 3 ${L.top3Pct}%. It names a disease only above ${L.threshold * 100}% confidence: that happens for ${L.coveragePct}% of photos, and ${L.accuracyWhenConfidentPct}% of those are right.` },
      { hi: "गेहूं, धान, कपास, चना और सोयाबीन के रोग इसमें नहीं हैं। भारत के खेतों में जांचा नहीं गया। हिंदी रोग-नाम अभी किसी KVK ने नहीं जांचे।",
        en: "There are no wheat, rice, cotton, gram or soybean disease classes. It has not been tested in Indian fields. The Hindi disease names have not yet been checked by a KVK." },
    ],
  },
  {
    title: { hi: "मंडी भाव", en: "Mandi prices" },
    body: [
      { hi: "भाव Agmarknet (data.gov.in) से हैं, ₹ प्रति क्विंटल। हर भाव के साथ उसकी तारीख दिखती है। कोई भाव बनाया या अंदाज़े से नहीं भरा जाता।",
        en: "Prices come from Agmarknet (data.gov.in), in ₹ per quintal, always with their date. No price is made up or filled in." },
      { hi: `डेमो में सर्वर नहीं है, इसलिए एक बार सेव किए असली भाव (${snap}) "नमूना स्नैपशॉट" लिखकर दिखते हैं।`,
        en: `The demo has no server, so it shows real prices saved once (${snap}), labelled "demo snapshot".` },
    ],
    links: [{ href: "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi", label: "data.gov.in · Agmarknet" }],
  },
  {
    title: { hi: "सिंचाई और मौसम", en: "Irrigation and weather" },
    body: [
      { hi: "मौसम और ET₀ Open-Meteo से। सलाह FAO-56 जल संतुलन पर: फसल गुणांक (Table 12), जड़ गहराई और p (Table 22), मिट्टी का पानी (Table 19)। बारिश को 'उपयोगी' मानने का नियम ऐप का अपना है, FAO-56 का नहीं। बारिश के शब्द IMD की श्रेणियों से।",
        en: "Weather and ET₀ from Open-Meteo. Advice is an FAO-56 water balance: crop coefficients (Table 12), root depth and p (Table 22), soil water (Table 19). The 'useful rain' rule is the app's own, not FAO-56. Rain words follow IMD's categories." },
      { hi: "यह अंदाज़ा है। पहले हाथ से मिट्टी की नमी देखें।", en: "It is an estimate. Check soil moisture by hand first." },
    ],
    links: [{ href: "https://www.fao.org/3/x0490e/x0490e00.htm", label: "FAO-56" }, { href: "https://open-meteo.com", label: "Open-Meteo" }],
  },
  {
    title: { hi: "कौन-सा डेटा फ़ोन से बाहर जाता है", en: "What leaves this phone" },
    body: [
      { hi: "मौसम के लिए जगह के निर्देशांक Open-Meteo को; मंडी भाव के लिए राज्य और ज़िला सर्वर को। पत्ती की फ़ोटो फ़ोन में ही जांची जाती है, कहीं नहीं भेजी जाती।",
        en: "The place's coordinates go to Open-Meteo for weather; the state and district go to the server for mandi prices. Leaf photos are checked on the phone and never sent anywhere." },
      { hi: "किसान का रिकॉर्ड टीम के सर्वर पर तभी जाता है जब किसान ने सिंक की सहमति दी हो। सहमति वापस लेने पर नाम, फ़ोन, गांव और मुलाकातें फ़ोन और सर्वर दोनों से मिटती हैं।",
        en: "A farmer's record goes to the team server only if the farmer gave consent to sync. Withdrawing consent erases their name, phone, village and visits from the phone and the server." },
    ],
  },
];
