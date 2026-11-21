# dorahacks-mcp

An MCP server for [DoraHacks](https://dorahacks.io). Your AI agent (Claude, Cursor, any MCP client) can find open hackathons and read their tracks, prizes, rules, deadlines, submitted BUIDLs and team-up posts. It's like a Devpost MCP, but for DoraHacks.

It's read-only and needs no login or API key.

## Tools

| Tool | What it returns |
|---|---|
| `list_open_hackathons` | Ongoing and upcoming hackathons, closest deadline first. Filter by text or `min_prize`, or sort by prize |
| `search_hackathons` | Search all hackathons, past and present, with paging and a status filter |
| `get_hackathon_overview` | Description, organizer, tracks, prize pool, stats and AI summary |
| `get_key_dates` | When registration and submissions open, the deadline, any extension, the current phase and days left |
| `get_prizes` | Tracks, sponsor bounties with prize tiers, and winners once announced |
| `get_submission_requirements` | Whether a repo or video is required, extra form questions, track and bounty limits, registration form |
| `get_hackathon_rules` | Rules, eligibility, judging criteria and deliverables, taken from the organizer's text |
| `get_announcements` | Organizer announcements |
| `list_buidls` | Submitted projects with pitch, repo, demo, video and tracks. Useful for scouting, or for finding winners to build on |
| `list_team_requests` | Teams looking for members, and the roles they want |

Every tool that takes a `hackathon` accepts a slug (`agents-onchain`), a numeric id (`2246`) or a full dorahacks.io URL.

## Install

```bash
git clone https://github.com/swarmdeepsea/dorahacks-mcp
cd dorahacks-mcp && npm install && npm run build
```

**Claude Code**

```bash
claude mcp add dorahacks -- node /absolute/path/to/dorahacks-mcp/dist/index.js
```

**Claude Desktop / Cursor** (`claude_desktop_config.json` / `.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "dorahacks": {
      "command": "node",
      "args": ["/absolute/path/to/dorahacks-mcp/dist/index.js"]
    }
  }
}
```

## Check it works

```bash
npm test                         # unit tests against a mocked API
npm run smoke                    # live check of every tool against dorahacks.io
npm run smoke -- your-hackathon  # live check against a specific hackathon
```

## Notes

- This uses DoraHacks' public web API (`/api/v1/hub/…`), the same one dorahacks.io itself calls. It isn't documented and could change. If a tool breaks, open an issue.
- Dates are UTC ISO strings. DoraHacks returns Unix seconds.
- Submitting a BUIDL isn't supported yet. You submit on dorahacks.io yourself.
- Set `DORAHACKS_BASE_URL` to point it at a mirror or a test server.

## License

MIT
