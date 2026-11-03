// ETD/ETA hints shared by the shipments table and detail page: "in 3d" when a
// date is close, "2d late" when it has passed but the shipment hasn't reached
// the milestone yet. Once a shipment is past the milestone (or cancelled) the
// date is history, so it gets no hint.

export type ScheduleTone = "late" | "soon";
export type ScheduleHint = { label: string; tone: ScheduleTone } | null;

const DEPARTED = new Set(["in_transit", "arrived", "customs", "delivered", "cancelled"]);
const ARRIVED = new Set(["arrived", "customs", "delivered", "cancelled"]);
const SOON_DAYS = 7;

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysFromToday(iso: string, today: Date = new Date()): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parseLocalDate(iso).getTime() - start.getTime()) / 86_400_000);
}

export function scheduleHint(
  kind: "etd" | "eta",
  iso: string | null,
  status: string,
  today: Date = new Date()
): ScheduleHint {
  if (!iso) return null;
  if ((kind === "etd" ? DEPARTED : ARRIVED).has(status)) return null;
  const days = daysFromToday(iso, today);
  if (days < 0) return { label: `${-days}d late`, tone: "late" };
  if (days === 0) return { label: "today", tone: "soon" };
  if (days <= SOON_DAYS) return { label: `in ${days}d`, tone: "soon" };
  return null;
}
