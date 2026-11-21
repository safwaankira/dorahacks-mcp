// Live check against dorahacks.io: `npm run build && npm run smoke [slug]`
import { connect } from "./harness.js";

const slug = process.argv[2] ?? "agents-onchain";
const { call } = await connect();
let failed = 0;
const check = async (name: string, args: Record<string, unknown>, ok: (d: any) => boolean) => {
  const r = await call(name, args);
  const pass = !r.isError && ok(r.data);
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : `\n      ${r.text.slice(0, 300)}`}`);
};

await check("search_hackathons", { query: "agent", page_size: 3 }, (d) => d.hackathons.length > 0);
await check("list_open_hackathons", {}, (d) => Array.isArray(d.hackathons));
await check("get_hackathon_overview", { hackathon: slug, max_chars: 600 }, (d) => Boolean(d.title));
await check("get_key_dates", { hackathon: slug }, (d) => Boolean(d.submission_deadline));
await check("get_prizes", { hackathon: slug }, (d) => Array.isArray(d.bounties));
await check("get_submission_requirements", { hackathon: slug }, (d) => typeof d.github_repo_required === "boolean");
await check("get_hackathon_rules", { hackathon: slug }, (d) => Array.isArray(d.sections));
await check("get_announcements", { hackathon: slug, page_size: 3 }, (d) => Array.isArray(d.announcements));
await check("list_buidls", { hackathon: slug, page_size: 3 }, (d) => d.buidls.length > 0);
await check("list_team_requests", { hackathon: slug, page_size: 3 }, (d) => Array.isArray(d.teams));

const open = await call("list_open_hackathons", {});
if (!open.isError) {
  console.log(`\nOpen right now (${open.data.count}):`);
  for (const h of open.data.hackathons.slice(0, 8))
    console.log(`  ${h.deadline?.slice(0, 10) ?? "?"}  ${h.prize_pool ?? "-"}  ${h.title}`);
}
process.exit(failed ? 1 : 0);
