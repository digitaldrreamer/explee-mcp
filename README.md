# explee-mcp

MCP server wrapping the [Explee](https://explee.com) B2B data API. Gives AI agents tools to search companies and people, enrich emails and phones, run AI agents, and manage deduplication lists.

## Tools

| Tool | Description |
|---|---|
| `search_companies` | Search companies by industry, geography, size, revenue, tech stack, funding, traffic |
| `search_companies_by_domains` | Bulk-enrich company profiles by domain |
| `search_people` | Search professionals by job title and company filters |
| `search_people_by_domains` | Find contacts at companies by domain |
| `nl_to_filters` | Convert natural-language ICP description to structured filters |
| `enrich_email` | Find verified professional email by name + domain |
| `enrich_phone` | Find work phone via LinkedIn URL |
| `create_batch_email_enrichment` | Async bulk email enrichment — returns a `task_id` |
| `get_batch_enrichment` | Poll results of a batch enrichment job |
| `create_find_and_enrich` | Combined search + email enrichment in one async job |
| `get_find_and_enrich` | Poll results of a find-and-enrich job |
| `list_tasks` | List all async jobs on your account |
| `list_agents` | Browse available pre-built Explee AI agents |
| `start_agent_run_by_id` | Run a pre-built agent by ID |
| `start_custom_agent_run` | Run a custom agent with your own system prompt and schema |
| `get_agent_run_status` | Poll status and results of an agent run |
| `web_search` | Web search within agent workflows |
| `get_billing_balance` | Check your Explee credit balance |
| `topup_credits` | Purchase additional credits |
| `list_people_dedup_lists` | List people deduplication lists |
| `create_people_dedup_list` | Create an exclusion list of LinkedIn URLs |
| `get_people_dedup_list` | Retrieve contents of a people dedup list |
| `delete_people_dedup_list` | Delete a people dedup list |
| `list_company_dedup_lists` | List company deduplication lists |
| `create_company_dedup_list` | Create an exclusion list of company domains |
| `get_company_dedup_list` | Retrieve contents of a company dedup list |
| `delete_company_dedup_list` | Delete a company dedup list |

## Prerequisites

- An [Explee API key](https://explee.com/api-keys)

---

## Option A — Use the hosted server (recommended)

No local setup needed. Pass your Explee API key as a Bearer token when registering the server.

### Claude Code

```bash
claude mcp add --transport http explee https://your-deployed-url.com/mcp \
  --header "Authorization: Bearer YOUR_EXPLEE_API_KEY"
```

Or add manually to `.mcp.json` at your project root:

```json
{
  "mcpServers": {
    "explee": {
      "type": "http",
      "url": "https://your-deployed-url.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_EXPLEE_API_KEY"
      }
    }
  }
}
```

### Codex CLI

Codex reads the token from an environment variable rather than embedding it in the command:

```bash
export EXPLEE_API_KEY=your_api_key_here
codex mcp add explee --url https://your-deployed-url.com/mcp \
  --bearer-token-env-var EXPLEE_API_KEY
```

Or add manually to `~/.codex/config.toml` (global) or `.codex/config.toml` (project):

```toml
[mcp_servers.explee]
url = "https://your-deployed-url.com/mcp"
bearer_token_env_var = "EXPLEE_API_KEY"
```

---

## Option B — Run locally

### Setup

```bash
git clone https://github.com/digitaldrreamer/explee-mcp
cd explee-mcp
npm install
cp .env.example .env
```

Edit `.env`:

```env
EXPLEE_API_KEY=your_api_key_here
PORT=3000
```

Build and start:

```bash
npm run build
npm start
```

For development with auto-reload:

```bash
npm run dev
```

The server listens at `http://localhost:3000/mcp`.

### Claude Code

```bash
claude mcp add --transport http explee http://localhost:3000/mcp
```

No `--header` needed — the server reads `EXPLEE_API_KEY` from its own `.env`.

Or manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "explee": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### Codex CLI

```bash
codex mcp add explee --url http://localhost:3000/mcp
```

Or manually in `.codex/config.toml`:

```toml
[mcp_servers.explee]
url = "http://localhost:3000/mcp"
```

---

## Health check

```bash
curl http://localhost:3000/health
# {"ok":true,"server":"explee-mcp","version":"1.0.0"}
```
