// Preset places: district headquarters (coordinates for weather). `state` and
// `district` are sent to the mandi API as filters; if Agmarknet writes a district
// differently the API returns no rows and the app says "not available".
export type Place = { id: string; en: string; hi: string; state: string; district: string; lat: number; lon: number };

export const PLACES: Place[] = [
  { id: "bhopal", en: "Bhopal, MP", hi: "भोपाल, म.प्र.", state: "Madhya Pradesh", district: "Bhopal", lat: 23.2599, lon: 77.4126 },
  { id: "sehore", en: "Sehore, MP", hi: "सीहोर, म.प्र.", state: "Madhya Pradesh", district: "Sehore", lat: 23.2032, lon: 77.0844 },
  { id: "vidisha", en: "Vidisha, MP", hi: "विदिशा, म.प्र.", state: "Madhya Pradesh", district: "Vidisha", lat: 23.5251, lon: 77.8081 },
  { id: "indore", en: "Indore, MP", hi: "इंदौर, म.प्र.", state: "Madhya Pradesh", district: "Indore", lat: 22.7196, lon: 75.8577 },
  { id: "raipur", en: "Raipur, CG", hi: "रायपुर, छ.ग.", state: "Chhattisgarh", district: "Raipur", lat: 21.2514, lon: 81.6296 },
  { id: "paratwada", en: "Paratwada (Amravati), MH", hi: "परतवाड़ा (अमरावती), महा.", state: "Maharashtra", district: "Amravati", lat: 21.2569, lon: 77.5092 },
  { id: "bareilly", en: "Bareilly, UP", hi: "बरेली, उ.प्र.", state: "Uttar Pradesh", district: "Bareilly", lat: 28.367, lon: 79.4304 },
  { id: "ahmedabad", en: "Ahmedabad, GJ", hi: "अहमदाबाद, गुज.", state: "Gujarat", district: "Ahmedabad", lat: 23.0225, lon: 72.5714 },
  { id: "rajkot", en: "Rajkot, GJ", hi: "राजकोट, गुज.", state: "Gujarat", district: "Rajkot", lat: 22.3039, lon: 70.8022 },
];

export const STATES = [...new Set(PLACES.map(p => p.state))];

export function placeById(id: string | undefined): Place | undefined {
  return PLACES.find(p => p.id === id);
}

const STATE_HI: Record<string, string> = {
  "Madhya Pradesh": "मध्य प्रदेश", Chhattisgarh: "छत्तीसगढ़", Maharashtra: "महाराष्ट्र", "Uttar Pradesh": "उत्तर प्रदेश", Gujarat: "गुजरात",
};

/** State name for display; the stored value stays the API's English string. */
export function stateName(state: string, lang: "hi" | "en"): string {
  return lang === "hi" ? STATE_HI[state] ?? state : state;
}
