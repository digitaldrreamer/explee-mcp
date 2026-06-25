import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";

const BASE_URL = "https://api.explee.com/public/api/v1";
const PORT = Number(process.env.PORT ?? 3000);

// ─── API Client ──────────────────────────────────────────────────────────────

async function explee<T = unknown>(apiKey: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(`Explee ${res.status}: ${(err as { detail?: string }).detail ?? res.statusText}`);
  }

  return res.json() as Promise<T>;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

function makeCall(apiKey: string) {
  return async (method: string, path: string, body?: unknown): Promise<ToolResult> => {
    try {
      return ok(await explee(apiKey, method, path, body));
    } catch (err) {
      return fail(err);
    }
  };
}

// ─── Server Factory ──────────────────────────────────────────────────────────

function createServer(apiKey: string): McpServer {
  const server = new McpServer({ name: "explee", version: "1.0.0" });
  const call = makeCall(apiKey);

  // ── Search ─────────────────────────────────────────────────────────────────

  server.tool(
    "search_companies",
    "Search for companies using rich filters: industry description, geography, employee size, revenue, tech stack, funding stage, web traffic, and optional AI scoring criteria. Returns enriched company profiles. First 100 results are free; additional results cost 0.5 credits each.",
    {
      definition: z.string().describe("Natural language description of the target company (required). E.g. 'B2B SaaS companies selling to HR teams'"),
      definition_exclude: z.string().optional().describe("Exclude companies matching this description"),
      min_relevance: z.number().optional().describe("Minimum relevance score (0–1)"),
      geo_include: z.array(z.string()).optional().describe("Country codes to include (ISO 3166-1 alpha-2, e.g. ['US', 'GB'])"),
      geo_exclude: z.array(z.string()).optional().describe("Country codes to exclude"),
      geo_subdivision: z.array(z.string()).optional().describe("State/province subdivisions to include"),
      geo_city: z.array(z.string()).optional().describe("Cities to include"),
      geo_subdivision_exclude: z.array(z.string()).optional().describe("Subdivisions to exclude"),
      geo_city_exclude: z.array(z.string()).optional().describe("Cities to exclude"),
      geo_founders: z.array(z.string()).optional().describe("Filter by founder nationality/country"),
      location_hq: z.boolean().optional().describe("Filter by HQ location"),
      location_customer: z.boolean().optional().describe("Filter by customer location"),
      founded: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional().describe("Company founding year range"),
      size: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional().describe("Employee count range"),
      size_on_linkedin: z.boolean().optional().describe("Use LinkedIn employee count for size filter"),
      revenue_annual: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional().describe("Annual revenue range in USD"),
      is_b2b: z.boolean().optional().describe("Filter to B2B companies"),
      is_saas: z.boolean().optional().describe("Filter to SaaS companies"),
      is_startup: z.boolean().optional().describe("Filter to startups"),
      is_tech: z.boolean().optional().describe("Filter to tech companies"),
      is_ai: z.boolean().optional().describe("Filter to AI companies"),
      is_merchant: z.boolean().optional().describe("Filter to merchants/e-commerce"),
      is_digital: z.boolean().optional().describe("Filter to digital companies"),
      is_alive: z.boolean().optional().describe("Filter to active/alive companies"),
      employees_growth: z.array(z.enum(["high", "growing", "stable", "declining"])).optional().describe("Employee headcount growth trend"),
      hiring_is: z.boolean().optional().describe("Currently hiring on LinkedIn"),
      funding_last_round_stage: z.array(z.enum(["no_funding", "pre_seed_seed", "series_a", "series_b_plus"])).optional().describe("Funding stage filter"),
      funding_last_round_date: z.enum(["6_months", "1_year", "any"]).optional().describe("Recency of last funding round"),
      technologies: z.array(z.string()).optional().describe("Tech stack keywords (e.g. ['Shopify', 'Stripe', 'AWS'])"),
      traffic: z.array(z.enum(["<1K", "1K-10K", "10K-100K", "100K-1M", "1M+", "unknown"])).optional().describe("Monthly website traffic buckets"),
      traffic_min: z.number().int().optional().describe("Minimum monthly traffic (exact)"),
      traffic_max: z.number().int().optional().describe("Maximum monthly traffic (exact)"),
      traffic_growth: z.array(z.enum(["high", "growing", "stable", "declining", "unknown"])).optional().describe("Website traffic growth trend"),
      has_public_emails: z.boolean().optional().describe("Has publicly listed email addresses"),
      has_company_phone: z.boolean().optional().describe("Has a listed phone number"),
      has_linkedin_page: z.boolean().optional().describe("Has a LinkedIn company page"),
      has_employees_on_linkedin: z.boolean().optional().describe("Has employees listed on LinkedIn"),
      criteria: z.array(z.string()).optional().describe("AI scoring criteria — each string is a criterion the model scores 0–5 with reasoning. Adds 0.1 credits per criterion per result. E.g. ['Has a self-serve pricing page', 'Mentions enterprise in product marketing']"),
      limit: z.number().int().optional().describe("Max results to return (default varies)"),
      offset: z.number().int().optional().describe("Pagination offset"),
      exclude_lists: z.array(z.string()).optional().describe("Company dedup list IDs to exclude already-seen companies"),
      sort_by: z.string().optional().describe("Sort field"),
    },
    async (args) => {
      const { limit, offset, exclude_lists, ...filterFields } = args;
      const filters = Object.fromEntries(
        Object.entries(filterFields).filter(([, v]) => v !== undefined)
      );
      const body: Record<string, unknown> = { filters };
      if (exclude_lists !== undefined) body.exclude_lists = exclude_lists;
      if (limit !== undefined) body.page_size = limit;
      if (offset !== undefined && limit) body.page = Math.floor((offset as number) / (limit as number)) + 1;
      return call("POST", "/search/companies", body);
    }
  );

  server.tool(
    "search_companies_by_domains",
    "Bulk-look up enriched company profiles by domain name. Ideal for enriching a CRM export or domain list. Costs 0.5 credits per company.",
    {
      domains: z.array(z.string()).describe("List of company domains (e.g. ['stripe.com', 'notion.so'])"),
      exclude_lists: z.array(z.string()).optional().describe("Company dedup list IDs to skip"),
    },
    async (args) => call("POST", "/search/companies-by-domains", args)
  );

  server.tool(
    "search_people",
    "Search for professionals (leads) by job title and company filters. Returns LinkedIn profiles with title, location, experience, education, and skills. First 100 results are free; additional results cost 1 credit each.",
    {
      people_filters: z.object({
        job_titles: z.array(z.string()).optional().describe("Job titles to target (e.g. ['CTO', 'VP Engineering', 'Head of Product'])"),
        min_relevance: z.number().optional().describe("Minimum title relevance score"),
        job_titles_exclude: z.string().optional().describe("Job titles to exclude"),
        geo: z.array(z.string()).optional().describe("Country codes for person location"),
        followers: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional().describe("LinkedIn follower count range"),
        people_per_company_limit: z.number().int().optional().describe("Max people returned per company"),
        criteria: z.array(z.string()).optional().describe("AI scoring criteria for person profiles"),
      }).optional().describe("Filters applied to individual people"),
      company_filters: z.object({
        definition: z.string().optional().describe("Description of target companies these people work at"),
        geo_include: z.array(z.string()).optional().describe("Company HQ country codes"),
        size: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional().describe("Employee count range for employer"),
        is_b2b: z.boolean().optional(),
      }).optional().describe("Filters applied to the company the person works at"),
      company_linkedin_ids: z.array(z.number().int()).optional().describe("Search only within these specific company LinkedIn IDs"),
      limit: z.number().int().optional(),
      offset: z.number().int().optional(),
      exclude_lists: z.array(z.string()).optional().describe("People dedup list IDs to exclude already-contacted leads"),
    },
    async (args) => call("POST", "/search/people", args)
  );

  server.tool(
    "search_people_by_domains",
    "Find professionals working at companies identified by domain. Optionally filter by job title. Useful when you have a company list and want contacts there.",
    {
      domains: z.array(z.string()).describe("Company domains to find people at (e.g. ['stripe.com'])"),
      job_titles: z.array(z.string()).optional().describe("Job title filters (e.g. ['Head of Sales', 'Account Executive'])"),
      people_per_company: z.number().int().optional().describe("Max contacts per company"),
      exclude_lists: z.array(z.string()).optional().describe("People dedup list IDs to skip"),
    },
    async (args) => call("POST", "/search/people-by-domains", args)
  );

  server.tool(
    "nl_to_filters",
    "Convert a natural language prospect description into structured filter objects for search_companies or search_people. Use this as a first step when the user describes their ICP in plain English.",
    {
      query: z.string().min(1).describe("Natural language ICP description. E.g. 'Series A B2B SaaS startups in the US with 20–100 employees hiring engineers'"),
    },
    async (args) => call("POST", "/search/nl-to-filters", args)
  );

  // ── Contact Enrichment ─────────────────────────────────────────────────────

  server.tool(
    "enrich_email",
    "Find a verified professional email for one person given first name, last name, and company domain. Returns the email and its validity status (valid, catch_all, catch_all_valid).",
    {
      first_name: z.string().min(1).describe("Person's first name"),
      last_name: z.string().min(1).describe("Person's last name"),
      company_domain: z.string().min(1).describe("Company domain (e.g. 'stripe.com', not 'https://stripe.com')"),
      preset: z.enum(["basic", "premium"]).optional().describe("'basic' = standard lookup (default). 'premium' = higher deliverability, more credits."),
    },
    async (args) => call("POST", "/enrich/email", args)
  );

  server.tool(
    "enrich_phone",
    "Find a professional work phone number for a person given their LinkedIn URL.",
    {
      linkedin_url: z.string().min(1).describe("Full LinkedIn profile URL (e.g. 'https://linkedin.com/in/john-doe')"),
      email: z.string().nullable().optional().describe("Person's email address — improves match accuracy if known"),
      preset: z.enum(["basic_new", "premium"]).optional().describe("Phone lookup tier (default: basic_new)"),
    },
    async (args) => call("POST", "/enrich/phone", args)
  );

  server.tool(
    "create_batch_email_enrichment",
    "Submit a list of contacts for async email enrichment. Returns a task_id immediately; use get_batch_enrichment to poll for results. Preferred over looping enrich_email for lists with more than a few contacts.",
    {
      contacts: z.array(z.object({
        first_name: z.string().min(1).max(100),
        last_name: z.string().min(1).max(100),
        company_domain: z.string().min(1).max(255),
      })).describe("Contacts to enrich"),
      preset: z.enum(["basic", "premium"]).optional().describe("Email lookup tier (default: basic)"),
    },
    async (args) => call("POST", "/enrich/email/batch", args)
  );

  server.tool(
    "get_batch_enrichment",
    "Retrieve the status and results of a batch email enrichment job. Poll until status is 'completed' or 'failed'. Results include email and email_status per contact.",
    {
      task_id: z.string().describe("Task ID returned by create_batch_email_enrichment"),
    },
    async ({ task_id }) => call("GET", `/enrich/email/batch/${task_id}`)
  );

  // ── Find and Enrich ────────────────────────────────────────────────────────

  server.tool(
    "create_find_and_enrich",
    "Combined async job: search for people matching filters AND enrich their emails in one step. Returns a task_id to poll with get_find_and_enrich. More efficient than searching then enriching separately.",
    {
      people_filters: z.object({
        job_titles: z.array(z.string()).optional().describe("Target job titles"),
        geo: z.array(z.string()).optional().describe("Country codes for person location"),
        followers: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional(),
        criteria: z.array(z.string()).optional().describe("AI scoring criteria"),
      }).optional(),
      company_filters: z.object({
        definition: z.string().optional().describe("Target company description"),
        geo_include: z.array(z.string()).optional(),
        size: z.object({ min: z.number().int().optional(), max: z.number().int().optional() }).optional(),
      }).optional(),
      company_linkedin_ids: z.array(z.number().int()).nullable().optional().describe("Restrict to specific company LinkedIn IDs"),
      max_contacts: z.number().int().min(1).max(500).describe("Target number of enriched contacts (1–500)"),
      preset: z.enum(["basic", "premium"]).optional().describe("Email enrichment tier (default: basic)"),
      exclude_lists: z.array(z.string()).nullable().optional().describe("People dedup list IDs to skip"),
      cursor: z.string().nullable().optional().describe("Pagination cursor from a previous run's next_cursor for continuing a large job"),
    },
    async (args) => call("POST", "/find-and-enrich", args)
  );

  server.tool(
    "get_find_and_enrich",
    "Get status and results of a find-and-enrich job. Poll until status is 'completed'. Results include names, LinkedIn URLs, company, email, and email_status. Check next_cursor and has_more for pagination.",
    {
      task_id: z.string().describe("Task ID returned by create_find_and_enrich"),
    },
    async ({ task_id }) => call("GET", `/find-and-enrich/${task_id}`)
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────

  server.tool(
    "list_tasks",
    "List all async batch jobs on your account (batch enrichments, find-and-enrich runs). Returns task IDs, statuses, creation times, and result URLs.",
    {},
    async () => call("GET", "/tasks")
  );

  // ── Agents ─────────────────────────────────────────────────────────────────

  server.tool(
    "list_agents",
    "Browse available pre-built Explee AI agents. Returns agent IDs, names, descriptions, categories, and their input/output JSON schemas. Call this before start_agent_run_by_id to discover what's available.",
    {},
    async () => call("GET", "/agents")
  );

  server.tool(
    "start_agent_run_by_id",
    "Execute a pre-built Explee AI agent by its ID. Returns a run_id immediately; poll status with get_agent_run_status. Use list_agents first to find the agent ID and understand its input schema.",
    {
      agent_id: z.string().describe("Agent ID from list_agents"),
      input: z.record(z.unknown()).describe("Input object conforming to the agent's input_schema"),
    },
    async ({ agent_id, input }) => call("POST", `/agents/${agent_id}/runs`, { input })
  );

  server.tool(
    "start_custom_agent_run",
    "Execute a custom AI agent defined by your own system prompt and JSON schemas. The agent runs on Explee's infrastructure with access to their data. Returns a run_id; poll with get_agent_run_status.",
    {
      system_prompt: z.string().describe("Instructions defining what the custom agent does and how it should behave"),
      input_schema: z.record(z.unknown()).describe("JSON Schema object defining the shape of the input parameter"),
      output_schema: z.record(z.unknown()).describe("JSON Schema object defining the expected output structure"),
      input: z.record(z.unknown()).describe("Input data conforming to input_schema"),
    },
    async (args) => call("POST", "/agents/runs", args)
  );

  server.tool(
    "get_agent_run_status",
    "Check the status and retrieve results of an agent run. Poll until status is no longer 'pending'. Returns the result object, progress percent, duration, and any trajectory URL for debugging.",
    {
      run_id: z.string().describe("Run ID returned by start_agent_run_by_id or start_custom_agent_run"),
    },
    async ({ run_id }) => call("GET", `/agents/runs/${run_id}`)
  );

  // ── Web Search ─────────────────────────────────────────────────────────────

  server.tool(
    "web_search",
    "Perform a web search and get structured results (title, snippet, URL). Costs 0.005 credits per request. Useful for research within agent workflows.",
    {
      query: z.string().describe("Search query"),
    },
    async (args) => call("POST", "/web/search", args)
  );

  // ── Billing ────────────────────────────────────────────────────────────────

  server.tool(
    "get_billing_balance",
    "Check the current credit balance on your Explee account.",
    {},
    async () => call("GET", "/billing/balance")
  );

  server.tool(
    "topup_credits",
    "Purchase additional Explee credits. Minimum 500, maximum 100,000 credits per transaction.",
    {
      credits: z.number().int().min(500).max(100000).describe("Number of credits to purchase"),
      idempotency_key: z.string().optional().describe("Optional key to prevent duplicate charges on retries"),
    },
    async (args) => call("POST", "/billing/topup", args)
  );

  // ── Deduplication — People ─────────────────────────────────────────────────

  server.tool(
    "list_people_dedup_lists",
    "List all people deduplication lists on your account. Pass list IDs via exclude_lists in search tools to skip already-contacted leads.",
    {},
    async () => call("GET", "/dedup/people")
  );

  server.tool(
    "create_people_dedup_list",
    "Create an immutable exclusion list of LinkedIn profile URLs. Pass the returned list ID as exclude_lists in search_people or create_find_and_enrich to avoid re-contacting people.",
    {
      linkedin_urls: z.array(z.string()).describe("LinkedIn profile URLs to add (e.g. ['https://linkedin.com/in/john-doe'])"),
      name: z.string().nullable().optional().describe("Human-readable name for this list"),
    },
    async (args) => call("POST", "/dedup/people", args)
  );

  server.tool(
    "get_people_dedup_list",
    "Retrieve the contents of a people deduplication list (all LinkedIn URLs in the list).",
    {
      list_id: z.string().describe("Dedup list ID"),
    },
    async ({ list_id }) => call("GET", `/dedup/people/${list_id}`)
  );

  server.tool(
    "delete_people_dedup_list",
    "Permanently delete a people deduplication list.",
    {
      list_id: z.string().describe("Dedup list ID to delete"),
    },
    async ({ list_id }) => call("DELETE", `/dedup/people/${list_id}`)
  );

  // ── Deduplication — Companies ──────────────────────────────────────────────

  server.tool(
    "list_company_dedup_lists",
    "List all company deduplication lists on your account.",
    {},
    async () => call("GET", "/dedup/companies")
  );

  server.tool(
    "create_company_dedup_list",
    "Create an immutable exclusion list of company domains. Pass the returned list ID as exclude_lists in search_companies to skip already-contacted companies.",
    {
      domains: z.array(z.string()).describe("Company domains to add to the exclusion list (e.g. ['stripe.com', 'notion.so'])"),
      name: z.string().nullable().optional().describe("Human-readable name for this list"),
    },
    async (args) => call("POST", "/dedup/companies", args)
  );

  server.tool(
    "get_company_dedup_list",
    "Retrieve the contents of a company deduplication list (all domains in the list).",
    {
      list_id: z.string().describe("Dedup list ID"),
    },
    async ({ list_id }) => call("GET", `/dedup/companies/${list_id}`)
  );

  server.tool(
    "delete_company_dedup_list",
    "Permanently delete a company deduplication list.",
    {
      list_id: z.string().describe("Dedup list ID to delete"),
    },
    async ({ list_id }) => call("DELETE", `/dedup/companies/${list_id}`)
  );

  return server;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, server: "explee-mcp", version: "1.0.0" });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization ?? "";
  const apiKey = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : process.env.EXPLEE_API_KEY ?? "";

  if (!apiKey) {
    res.status(401).json({ error: "Missing API key. Set Authorization: Bearer <your-explee-api-key> or EXPLEE_API_KEY env var." });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session pinning
  });

  const server = createServer(apiKey);

  res.on("close", () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// SSE and DELETE handlers — required for full MCP spec compliance
app.get("/mcp", async (req: Request, res: Response) => {
  res.status(405).json({ error: "SSE connections not supported in stateless mode. Use POST /mcp." });
});

app.delete("/mcp", async (req: Request, res: Response) => {
  res.status(405).json({ error: "Session management not supported in stateless mode." });
});

app.listen(PORT, () => {
  console.log(`Explee MCP server listening on http://localhost:${PORT}/mcp`);
  if (!process.env.EXPLEE_API_KEY) {
    console.log("No EXPLEE_API_KEY env var set — clients must supply Authorization: Bearer <key>");
  }
});
