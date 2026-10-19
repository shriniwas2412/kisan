// Crop calendar and scheme cards: static data, shown only with a source and a date.
import calendar from "./data/crop_calendar.json" with { type: "json" };
import schemes from "./data/schemes.json" with { type: "json" };

export type Text = { en: string; hi: string };
export type CalendarEntry = {
  crop: string; en: string; hi: string; season: string; region: Text; states: string[];
  windows: { kind: string; label: Text }[]; source?: string; source_name?: string; last_verified?: string;
};
export type Scheme = { id: string; name: Text; what: Text; url: string; last_verified: string; helpline?: string };

const OFFICIAL = /^https:\/\/([a-z0-9-]+\.)*(gov\.in|nic\.in|icar\.gov\.in|icar\.org\.in)\//;

/** An entry is shown only if it has an https source URL and a verification date. */
export function isSourced(e: Partial<CalendarEntry>): boolean {
  return typeof e.source === "string" && /^https:\/\//.test(e.source) && /^\d{4}-\d{2}-\d{2}$/.test(e.last_verified ?? "");
}

export function calendarFor(opts: { crops?: string[]; state?: string } = {}, entries: CalendarEntry[] = calendar.entries): CalendarEntry[] {
  return entries.filter(isSourced)
    .filter(e => !opts.crops?.length || opts.crops.includes(e.crop))
    .filter(e => !opts.state || !e.states.length || e.states.includes(opts.state));
}

export function isOfficial(url: string): boolean {
  return OFFICIAL.test(url);
}

export const SCHEMES: Scheme[] = schemes.schemes.filter(s => isOfficial(s.url) && /^\d{4}-\d{2}-\d{2}$/.test(s.last_verified));
export const CALENDAR: CalendarEntry[] = calendar.entries;
