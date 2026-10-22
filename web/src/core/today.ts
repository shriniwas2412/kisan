// A field worker's "today" list, from rows on the phone only (nothing is estimated):
// follow-ups that are due or overdue, farmers onboarded in the last 7 days, and which
// farmers have changes not yet synced.
type Farmer = { id: string; name: string; onboarded_at?: string | null };
type Visit = { id: string; farmer_id: string; visited_on: string; follow_up_on?: string | null };

const days = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

export function todayList<F extends Farmer>(farmers: F[], visits: Visit[], outboxKeys: string[], todayIso: string) {
  const latest = new Map<string, Visit>();
  for (const v of visits) {
    const cur = latest.get(v.farmer_id);
    if (!cur || v.visited_on > cur.visited_on) latest.set(v.farmer_id, v);
  }
  const due = farmers.flatMap(f => {
    const v = latest.get(f.id);
    if (!v?.follow_up_on || v.follow_up_on > todayIso) return [];
    return [{ farmer: f, followUpOn: v.follow_up_on, overdueDays: days(todayIso, v.follow_up_on) }];
  }).sort((a, b) => b.overdueDays - a.overdueDays || a.farmer.name.localeCompare(b.farmer.name));
  const recent = farmers.filter(f => f.onboarded_at && days(todayIso, f.onboarded_at) <= 7 && days(todayIso, f.onboarded_at) >= 0)
    .sort((a, b) => String(b.onboarded_at).localeCompare(String(a.onboarded_at)));
  const visitFarmer = new Map(visits.map(v => [v.id, v.farmer_id]));
  const pending = new Set<string>();
  for (const k of outboxKeys) {
    const [t, id] = k.split(":");
    if (t === "farmer") pending.add(id);
    else if ((t === "visit") && visitFarmer.has(id)) pending.add(visitFarmer.get(id)!);
  }
  return { due, recent, pending };
}
