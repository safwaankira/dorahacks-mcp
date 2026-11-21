import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DoraHacksClient, DoraHacksError } from "./client.js";
import { card, daysLeft, hackathonUrl, json, phase, prizePool, toIso, truncate } from "./format.js";

const hackathonArg = z
  .string()
  .min(1)
  .describe('Hackathon slug (e.g. "agents-onchain"), numeric id (e.g. "2246"), or its dorahacks.io URL');

/** Pull markdown sections whose heading matches `re` out of a hackathon description. */
export function extractSections(md: string, re: RegExp): string[] {
  const lines = md.split("\n");
  const out: string[] = [];
  let cur: string[] | null = null;
  let level = 0;
  for (const line of lines) {
    const m = line.match(/^(#{1,6})\s+(.*)$/) ?? line.match(/^(\*\*)(.+?)\*\*\s*:?\s*$/);
    if (m) {
      const lvl = m[1] === "**" ? 7 : m[1].length;
      if (cur && lvl <= level) {
        out.push(cur.join("\n").trim());
        cur = null;
      }
      if (!cur && re.test(m[2])) {
        cur = [line];
        level = lvl;
        continue;
      }
    }
    if (cur) cur.push(line);
  }
  if (cur) out.push(cur.join("\n").trim());
  return out;
}

const RULES_RE = /rule|eligib|requirement|judg|criteria|scor|evaluat|submi|deliverable|how to (enter|participate|win)|faq/i;

async function safe<T>(fn: () => Promise<T>) {
  try {
    return json(await fn());
  } catch (e: any) {
    const msg = e instanceof DoraHacksError ? e.message : `Unexpected error: ${e?.message ?? e}`;
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}

async function collectPages(client: DoraHacksClient, opts: { status?: string; search?: string }, maxPages = 6) {
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = await client.listHackathons({ ...opts, page, pageSize: 50 });
    all.push(...(r.results ?? []));
    if (!r.next) break;
  }
  return all;
}

export function createServer(client = new DoraHacksClient()) {
  const server = new McpServer({ name: "dorahacks", version: "0.1.0" });

  server.registerTool(
    "search_hackathons",
    {
      title: "Search DoraHacks hackathons",
      description:
        "Search or browse all DoraHacks hackathons (past and present). Use list_open_hackathons to see only ones you can still enter.",
      inputSchema: {
        query: z.string().optional().describe("Text search over hackathon titles/descriptions"),
        status: z.enum(["all", "ongoing", "upcoming"]).default("all"),
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, status, page, page_size }) =>
      safe(async () => {
        const r = await client.listHackathons({
          search: query,
          status: status === "all" ? undefined : status,
          page,
          pageSize: page_size,
        });
        return { total: r.count ?? null, page, has_more: Boolean(r.next), hackathons: (r.results ?? []).map(card) };
      }),
  );

  server.registerTool(
    "list_open_hackathons",
    {
      title: "List open DoraHacks hackathons",
      description:
        "List hackathons that are ongoing or upcoming on DoraHacks, closest deadline first. Optional text filter.",
      inputSchema: {
        query: z.string().optional().describe("Optional text filter, e.g. 'AI agents' or 'Solana'"),
        sort: z.enum(["deadline", "prize"]).default("deadline"),
        min_prize: z.number().optional().describe("Only include prize pools >= this amount (in the listed token)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ query, sort, min_prize }) =>
      safe(async () => {
        const [ongoing, upcoming] = await Promise.all([
          collectPages(client, { status: "ongoing", search: query }),
          collectPages(client, { status: "upcoming", search: query }),
        ]);
        const seen = new Set<number>();
        let list = [...ongoing, ...upcoming].filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)));
        if (min_prize !== undefined) list = list.filter((h) => Number(h.bonus_price ?? 0) >= min_prize);
        const cards = list.map(card);
        cards.sort((a, b) =>
          sort === "prize"
            ? Number(list.find((h) => h.id === b.id)?.bonus_price ?? 0) -
              Number(list.find((h) => h.id === a.id)?.bonus_price ?? 0)
            : (a.deadline ? Date.parse(a.deadline) : Infinity) - (b.deadline ? Date.parse(b.deadline) : Infinity),
        );
        return { count: cards.length, hackathons: cards };
      }),
  );

  server.registerTool(
    "get_hackathon_overview",
    {
      title: "Get hackathon overview",
      description: "Full overview of one hackathon: description, organizer, tracks, prize pool, dates and stats.",
      inputSchema: {
        hackathon: hackathonArg,
        max_chars: z.number().int().min(500).max(100000).default(8000).describe("Max characters of description"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon, max_chars }) =>
      safe(async () => {
        const h = await client.getHackathon(hackathon);
        return {
          ...card(h),
          ai_summary: h.summary?.summary ?? null,
          tracks: (h.tracks ?? []).map((t: any) => ({ id: t.id, name: t.name })),
          bounties_count: h.bounties_count ?? null,
          description: truncate(h.description, max_chars),
          tabs: {
            buidls: hackathonUrl(h, "buidl"),
            tracks: hackathonUrl(h, "tracks"),
            prizes: hackathonUrl(h, "bounties-details"),
          },
        };
      }),
  );

  server.registerTool(
    "get_key_dates",
    {
      title: "Get hackathon key dates",
      description: "Registration, submission and deadline timestamps (UTC ISO) plus current phase and days left.",
      inputSchema: { hackathon: hackathonArg },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon }) =>
      safe(async () => {
        const h = await client.getHackathon(hackathon);
        return {
          title: h.title,
          phase: phase(h),
          days_left: daysLeft(h),
          registration_opens: toIso(h.timeline_start),
          submission_opens: toIso(h.timeline_pre_register),
          submission_deadline: toIso(h.timeline_end),
          extended: Boolean(h.is_extended),
          original_deadline: h.is_extended ? toIso(h.timeline_old_end) : null,
          winners_announced: Boolean(h.winner_announced),
          url: hackathonUrl(h),
        };
      }),
  );

  server.registerTool(
    "get_prizes",
    {
      title: "Get tracks, bounties and prizes",
      description:
        "Total prize pool, each track with its description, and each sponsor bounty with prize tiers (and winners once announced).",
      inputSchema: {
        hackathon: hackathonArg,
        max_chars_per_item: z.number().int().min(200).max(20000).default(2500),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon, max_chars_per_item }) =>
      safe(async () => {
        const h = await client.getHackathon(hackathon);
        const bw = await client.sub(String(h.id), "bounty-winners");
        const bounties = (bw.results ?? [])
          .filter((b: any) => b.visible !== false)
          .map((b: any) => ({
            name: b.name,
            total: `${Number(b.bonus ?? 0).toLocaleString("en-US")} ${b.token ?? ""}`.trim(),
            distribution: b.distribution_type ?? null,
            description: truncate(b.description, max_chars_per_item),
            prizes: (b.prizes ?? []).map((p: any) => ({
              place: p.name,
              amount: p.amount,
              winners: b.is_announced
                ? (p.buidls ?? []).map((w: any) => w?.name ?? w?.buidl?.name ?? w?.id ?? w)
                : undefined,
            })),
            winners_announced: Boolean(b.is_announced),
            winner_notes: b.winner_description || undefined,
            link: b.link || undefined,
          }));
        return {
          title: h.title,
          prize_pool: prizePool(h),
          tracks: (h.tracks ?? []).map((t: any) => ({
            id: t.id,
            name: t.name,
            description: truncate(t.description, max_chars_per_item),
          })),
          bounties,
          url: hackathonUrl(h, "bounties-details"),
        };
      }),
  );

  server.registerTool(
    "get_submission_requirements",
    {
      title: "Get submission requirements",
      description:
        "What a BUIDL submission must include: required repo/video, extra submission-form questions, track/bounty limits, registration form.",
      inputSchema: { hackathon: hackathonArg },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon }) =>
      safe(async () => {
        const h = await client.getHackathon(hackathon);
        return {
          title: h.title,
          deadline: toIso(h.timeline_end),
          github_repo_required: Boolean(h.mandatory_git_repo_link),
          demo_video_required: Boolean(h.mandatory_video_link),
          submission_form_enabled: Boolean(h.is_enabled_submission_form),
          submission_questions: (h.submission_form ?? []).map((q: any) => ({
            question: q.question,
            required: Boolean(q.required),
          })),
          tracks: (h.tracks ?? []).map((t: any) => t.name),
          multiple_tracks_allowed: Boolean(h.is_multi_tracks_allowed),
          max_tracks_per_buidl: h.tracks_limit_for_buidl ?? null,
          bounties_enabled: Boolean(h.is_enable_bounty),
          bounty_required: Boolean(h.is_bounty_required),
          max_bounties_per_buidl: h.bounties_limit_for_buidl ?? null,
          registration_form_enabled: Boolean(h.is_enabled_registration_form),
          registration_questions: (h.registration_form ?? []).map((q: any) => ({
            question: q.question,
            required: Boolean(q.required),
          })),
          external_registration_url: h.register_form_url ?? null,
          whitelist_only: Boolean(h.enable_whitelist),
          submit_url: hackathonUrl(h, "buidl"),
        };
      }),
  );

  server.registerTool(
    "get_hackathon_rules",
    {
      title: "Get rules and judging criteria",
      description:
        "Sections of the hackathon description about rules, eligibility, judging criteria and deliverables. DoraHacks has no structured judging field, so this extracts them from the organizer's text.",
      inputSchema: { hackathon: hackathonArg },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon }) =>
      safe(async () => {
        const h = await client.getHackathon(hackathon);
        const texts = [h.description ?? "", ...(h.tracks ?? []).map((t: any) => t.description ?? "")];
        const sections = texts.flatMap((t) => extractSections(t, RULES_RE));
        return {
          title: h.title,
          sections,
          note: sections.length
            ? undefined
            : "No rules/judging headings found. Read the full description with get_hackathon_overview.",
          url: hackathonUrl(h),
        };
      }),
  );

  server.registerTool(
    "get_announcements",
    {
      title: "Get hackathon announcements",
      description: "Organizer announcements for a hackathon, newest first.",
      inputSchema: {
        hackathon: hackathonArg,
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon, page, page_size }) =>
      safe(async () => {
        const r = await client.sub(hackathon, "announcements", { page, page_size });
        return {
          total: r.count ?? null,
          has_more: Boolean(r.next),
          announcements: (r.results ?? []).map((a: any) => ({
            sent: toIso(a.send_time),
            to: a.recipient_type ?? null,
            message: a.message_content,
          })),
        };
      }),
  );

  server.registerTool(
    "list_buidls",
    {
      title: "List submitted BUIDLs",
      description:
        "Projects (BUIDLs) submitted to a hackathon: name, pitch, repo, demo, tracks and bounties. Useful for scouting competition or past winners to build on.",
      inputSchema: {
        hackathon: hackathonArg,
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(50).default(20),
        track: z.string().optional().describe("Only BUIDLs in a track whose name contains this text"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon, page, page_size, track }) =>
      safe(async () => {
        const r = await client.sub(hackathon, "buidls", { page, page_size });
        let items = (r.results ?? []).map((x: any) => ({
          id: x.buidl?.id,
          name: x.buidl?.name,
          by: x.buidl?.owner_info?.username ?? null,
          pitch: x.buidl?.vision ?? null,
          github: x.buidl?.github_url ?? null,
          demo: x.buidl?.demo_url ?? null,
          video: x.buidl?.demo_video_url ?? null,
          tracks: (x.tracks ?? []).map((t: any) => t.name),
          bounties: (x.bounties ?? []).map((b: any) => b.name ?? b),
          submitted: toIso(x.submit_time),
          url: x.buidl?.id ? `https://dorahacks.io/buidl/${x.buidl.id}` : null,
        }));
        if (track) items = items.filter((b: any) => b.tracks.some((t: string) => t.toLowerCase().includes(track.toLowerCase())));
        return { total: r.count ?? null, page, has_more: Boolean(r.next), buidls: items };
      }),
  );

  server.registerTool(
    "list_team_requests",
    {
      title: "List teams looking for members",
      description: "Team-up posts for a hackathon: which roles a team is looking for and what they're building.",
      inputSchema: {
        hackathon: hackathonArg,
        page: z.number().int().min(1).default(1),
        page_size: z.number().int().min(1).max(50).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ hackathon, page, page_size }) =>
      safe(async () => {
        const r = await client.sub(hackathon, "teams", { page, page_size });
        return {
          total: r.count ?? null,
          has_more: Boolean(r.next),
          teams: (r.results ?? []).map((t: any) => ({
            roles_wanted: t.roles ?? [],
            description: truncate(t.description, 1500),
            project: t.buidl?.name ?? null,
            project_pitch: t.buidl?.vision ?? null,
            contact: t.hacker?.username ?? t.hacker?.nick_name ?? null,
            status: t.status ?? null,
          })),
        };
      }),
  );

  return server;
}
