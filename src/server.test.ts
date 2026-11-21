import { test } from "node:test";
import assert from "node:assert/strict";
import { connect } from "./harness.js";
import { DoraHacksClient } from "./client.js";
import { extractSections } from "./server.js";

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

const hack = (id: number, uname: string, endIn: number, prize: number, extra: any = {}) => ({
  id,
  uname,
  title: `Hack ${uname}`,
  owner: { id: 1, name: "Org", logo: "" },
  tags: "AI Agents,Web3",
  ecosystem: "Ethereum,MCP",
  timeline_start: NOW - 20 * DAY,
  timeline_pre_register: NOW - 10 * DAY,
  timeline_end: NOW + endIn * DAY,
  timeline_old_end: null,
  is_extended: false,
  venue_form: "Virtual",
  bonus_price: prize,
  bonus_token: "USD",
  buidls_count: 3,
  hackers_count: 10,
  winner_announced: false,
  ...extra,
});

const detail = hack(2246, "agents-onchain", 5, 5000, {
  description:
    "# The Last Mile\nIntro text\n\n## Judging Criteria\n- Technical depth\n- Use of KeeperHub\n\n## Prizes\nSee bounties\n\n## Submission Requirements\nRepo + video\n",
  tracks: [{ id: 4438, name: "Agents that execute", description: "Build agents.\n\n**Eligibility**\nOpen to all" }],
  mandatory_git_repo_link: true,
  mandatory_video_link: true,
  is_enabled_submission_form: true,
  submission_form: [{ id: 2, question: "What did you build?", required: false }],
  is_multi_tracks_allowed: false,
  tracks_limit_for_buidl: 1,
  is_enable_bounty: true,
  is_bounty_required: false,
  bounties_limit_for_buidl: 2,
  is_enabled_registration_form: true,
  registration_form: [{ id: 1, question: "Telegram handle?", required: true }],
  register_form_url: null,
  enable_whitelist: false,
  bounties_count: 1,
  summary: { summary: "AI summary here" },
});

const routes: Record<string, any> = {
  "/api/v1/hub/hackathons/agents-onchain": detail,
  "/api/v1/hub/hackathons/2246": detail,
  "/api/v1/hub/hackathons/2246/bounty-winners": {
    results: [
      {
        id: 1363, visible: true, is_announced: true, name: "KeeperHub Bounty", token: "USDC", bonus: 1000,
        link: "", description: "Use KeeperHub", winner_description: "", distribution_type: "fixed",
        prizes: [{ id: 530, name: "1st", amount: 1000, ordering: 0, buidls: [{ id: 9, name: "WinnerBot" }] }],
      },
      { id: 2, visible: false, name: "hidden", prizes: [] },
    ],
  },
  "/api/v1/hub/hackathons/2246/buidls": {
    count: 2, next: null, previous: null,
    results: [
      { id: 1, status: 4, tracks: [{ id: 4438, name: "Agents that execute" }], bounties: [], submit_time: NOW,
        buidl: { id: 47772, name: "Alpha", owner_info: { username: "alice" }, vision: "pitch", github_url: "https://github.com/a/b", demo_url: null, demo_video_url: "https://youtu.be/x" } },
      { id: 2, status: 4, tracks: [{ id: 1, name: "Other" }], bounties: [], submit_time: NOW,
        buidl: { id: 2, name: "Beta", owner_info: { username: "bob" }, vision: "p2" } },
    ],
  },
  "/api/v1/hub/hackathons/2246/announcements": {
    count: 1, next: null, results: [{ id: 1, send_time: NOW, recipient_type: "all", message_content: "Deadline extended" }],
  },
  "/api/v1/hub/hackathons/2246/teams": {
    count: 1, next: null, results: [{ id: 1, roles: ["Frontend dev"], description: "Need help", buidl: { name: "Gamma", vision: "v" }, hacker: { username: "carol" }, status: 1 }],
  },
};

const requests: string[] = [];
const mockFetch = async (url: string) => {
  const u = new URL(url);
  requests.push(u.pathname + u.search);
  if (u.pathname === "/api/v1/hub/hackathons") {
    const status = u.searchParams.get("status");
    const results =
      status === "ongoing" ? [hack(2, "late", 20, 100), hack(3, "soon", 2, 9000)]
      : status === "upcoming" ? [hack(4, "future", 40, 50000), hack(3, "soon", 2, 9000)]
      : [hack(5, "any", 1, 1)];
    return new Response(JSON.stringify({ count: results.length, next: null, previous: null, results }));
  }
  const body = routes[u.pathname];
  return body ? new Response(JSON.stringify(body)) : new Response("{}", { status: 404 });
};

test("parseRef handles slugs, ids and URLs", () => {
  assert.equal(DoraHacksClient.parseRef("https://dorahacks.io/hackathon/agents-onchain/detail"), "agents-onchain");
  assert.equal(DoraHacksClient.parseRef("2246"), "2246");
  assert.equal(DoraHacksClient.parseRef(" agents-onchain/ "), "agents-onchain");
});

test("list_open_hackathons merges, dedupes and sorts by deadline", async () => {
  const { call } = await connect(mockFetch);
  const r = await call("list_open_hackathons", {});
  assert.equal(r.data.count, 3);
  assert.deepEqual(r.data.hackathons.map((h: any) => h.slug), ["soon", "late", "future"]);
  const byPrize = await call("list_open_hackathons", { sort: "prize", min_prize: 1000 });
  assert.deepEqual(byPrize.data.hackathons.map((h: any) => h.slug), ["future", "soon"]);
});

test("search_hackathons passes query and status", async () => {
  const { call } = await connect(mockFetch);
  requests.length = 0;
  const r = await call("search_hackathons", { query: "agent", status: "ongoing", page_size: 5 });
  assert.equal(r.data.hackathons.length, 2);
  assert.match(requests[0], /search=agent/);
  assert.match(requests[0], /status=ongoing/);
  assert.match(requests[0], /page_size=5/);
});

test("overview, dates and requirements read the detail", async () => {
  const { call } = await connect(mockFetch);
  const o = await call("get_hackathon_overview", { hackathon: "https://dorahacks.io/hackathon/agents-onchain/detail" });
  assert.equal(o.data.title, "Hack agents-onchain");
  assert.equal(o.data.prize_pool, "5,000 USD");
  assert.equal(o.data.phase, "submissions_open");
  assert.equal(o.data.tracks[0].name, "Agents that execute");
  const d = await call("get_key_dates", { hackathon: "agents-onchain" });
  assert.equal(d.data.submission_deadline, new Date((NOW + 5 * DAY) * 1000).toISOString());
  assert.ok(d.data.days_left > 4.9 && d.data.days_left < 5.1);
  const s = await call("get_submission_requirements", { hackathon: "agents-onchain" });
  assert.equal(s.data.github_repo_required, true);
  assert.equal(s.data.registration_questions[0].required, true);
  assert.equal(s.data.max_bounties_per_buidl, 2);
});

test("sub-endpoints resolve slug to numeric id", async () => {
  const { call } = await connect(mockFetch);
  requests.length = 0;
  const r = await call("list_buidls", { hackathon: "agents-onchain", track: "execute" });
  assert.equal(r.data.buidls.length, 1);
  assert.equal(r.data.buidls[0].name, "Alpha");
  assert.ok(requests.some((p) => p.startsWith("/api/v1/hub/hackathons/2246/buidls")));
});

test("prizes include tracks, visible bounties and winners", async () => {
  const { call } = await connect(mockFetch);
  const r = await call("get_prizes", { hackathon: "agents-onchain" });
  assert.equal(r.data.bounties.length, 1);
  assert.equal(r.data.bounties[0].total, "1,000 USDC");
  assert.deepEqual(r.data.bounties[0].prizes[0].winners, ["WinnerBot"]);
});

test("rules extraction finds judging, submission and eligibility sections", async () => {
  const { call } = await connect(mockFetch);
  const r = await call("get_hackathon_rules", { hackathon: "agents-onchain" });
  const joined = r.data.sections.join("\n---\n");
  assert.match(joined, /Judging Criteria/);
  assert.match(joined, /Submission Requirements/);
  assert.match(joined, /Eligibility/);
  assert.doesNotMatch(joined, /See bounties/);
});

test("announcements and team requests", async () => {
  const { call } = await connect(mockFetch);
  const a = await call("get_announcements", { hackathon: "2246" });
  assert.equal(a.data.announcements[0].message, "Deadline extended");
  const t = await call("list_team_requests", { hackathon: "2246" });
  assert.deepEqual(t.data.teams[0].roles_wanted, ["Frontend dev"]);
});

test("unknown hackathon returns a readable tool error", async () => {
  const { call } = await connect(mockFetch);
  const r = await call("get_key_dates", { hackathon: "nope" });
  assert.equal(r.isError, true);
  assert.match(r.text, /Not found/);
});

test("extractSections stops at a same-level heading", () => {
  const s = extractSections("## Rules\na\n### Sub\nb\n## Other\nc", /rule/i);
  assert.equal(s.length, 1);
  assert.match(s[0], /Sub/);
  assert.doesNotMatch(s[0], /Other/);
});
