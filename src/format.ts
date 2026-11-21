import { BASE_URL } from "./client.js";

/** DoraHacks timestamps are Unix seconds (some fields are ms). */
export function toIso(t: unknown): string | null {
  if (t === null || t === undefined || t === "") return null;
  const n = typeof t === "number" ? t : Number(t);
  if (!Number.isFinite(n)) return typeof t === "string" ? t : null;
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

export function phase(h: any, now = Date.now()): string {
  const s = toMs(h.timeline_start);
  const sub = toMs(h.timeline_pre_register);
  const e = toMs(h.timeline_end);
  if (h.winner_announced) return "winners_announced";
  if (s && now < s) return "upcoming";
  if (sub && now < sub) return "pre_registration";
  if (e && now < e) return "submissions_open";
  if (e && now >= e) return "judging_or_ended";
  return "unknown";
}

function toMs(t: unknown): number | null {
  const iso = toIso(t);
  return iso ? Date.parse(iso) : null;
}

export function daysLeft(h: any, now = Date.now()): number | null {
  const e = toMs(h.timeline_end);
  if (!e || e < now) return null;
  return Math.round(((e - now) / 86400000) * 10) / 10;
}

export function hackathonUrl(h: any, tab = "detail"): string {
  return `${BASE_URL}/hackathon/${h.uname ?? h.id}/${tab}`;
}

export function prizePool(h: any): string | null {
  if (h.bonus_price === null || h.bonus_price === undefined) return null;
  return `${Number(h.bonus_price).toLocaleString("en-US")} ${h.bonus_token ?? ""}`.trim();
}

const splitList = (v: unknown) =>
  typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : Array.isArray(v) ? v : [];

/** Compact card used in list results. */
export function card(h: any) {
  return {
    id: h.id,
    slug: h.uname,
    title: h.title,
    organizer: h.owner?.name ?? null,
    phase: phase(h),
    days_left: daysLeft(h),
    prize_pool: prizePool(h),
    submission_opens: toIso(h.timeline_pre_register),
    deadline: toIso(h.timeline_end),
    venue: h.venue_form === "virtual" || h.venue_form === "Virtual" ? "virtual" : h.venue_name ?? h.venue_form ?? null,
    tags: splitList(h.tags),
    ecosystem: splitList(h.ecosystem),
    buidls: h.buidls_count ?? null,
    hackers: h.hackers_count ?? null,
    url: hackathonUrl(h),
  };
}

export function truncate(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  return s.length > max ? `${s.slice(0, max)}\n…[truncated ${s.length - max} chars — raise max_chars to read more]` : s;
}

export function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
