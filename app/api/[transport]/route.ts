// MCP endpoint — exposes the same four capabilities as the REST API as MCP
// tools over Streamable HTTP (with SSE fallback). Each tool calls the shared
// service layer, so MCP and REST behavior never drift.
//
// Connect from an MCP client at:  <deployment-url>/api/mcp
// (the [transport] segment resolves "mcp" → Streamable HTTP, "sse" → SSE).

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { runProfile, runSearch, runLetter, runQa } from "@/lib/service";

// Vercel function timeout (seconds). 60 is the Hobby-plan ceiling and is plenty
// for streamable HTTP MCP requests; raise on Pro if you need long SSE sessions.
export const maxDuration = 60;

const profileShape = {
  name: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  experienceYears: z.number().optional(),
  location: z.string().optional(),
  education: z.string().optional(),
  email: z.string().optional(),
};
const profileObject = z.object(profileShape);

const jobShape = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  description: z.string().optional(),
});

function ok(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "profile_upsert",
      {
        title: "Upsert Profile",
        description:
          "Validate and normalize a candidate profile. Stateless: returns the normalized profile to pass back into later calls.",
        inputSchema: profileShape,
      },
      async (input) => ok({ profile: runProfile(input) }),
    );

    server.registerTool(
      "jobs_search",
      {
        title: "Search Jobs",
        description:
          "Rank jobs against a query and profile. Returns jobs with a fit_score (0-100) and match_reasons. Set live=true to also pull keyless live listings.",
        inputSchema: {
          query: z.string().optional(),
          profile: profileObject.optional(),
          limit: z.number().int().min(1).max(50).optional(),
          remoteOnly: z.boolean().optional(),
          location: z.string().optional(),
          live: z.boolean().optional(),
        },
      },
      async (input) => {
        const jobs = await runSearch(input);
        return ok({ jobs, count: jobs.length });
      },
    );

    server.registerTool(
      "letter_generate",
      {
        title: "Generate Cover Letter",
        description:
          "Generate a cover letter for a job in a chosen tone. Uses a template in demo mode, or a real LLM when an API key is configured.",
        inputSchema: {
          profile: profileObject.optional(),
          job: jobShape,
          tone: z
            .enum(["professional", "casual", "enthusiastic", "formal"])
            .optional(),
          highlights: z.array(z.string()).optional(),
        },
      },
      async (input) =>
        ok(await runLetter({ ...input, profile: input.profile ?? {} })),
    );

    server.registerTool(
      "qa_reply",
      {
        title: "Answer Application Question",
        description:
          "Answer an interview or application question in the candidate's voice. Heuristic in demo mode, real LLM when a key is configured.",
        inputSchema: {
          question: z.string(),
          profile: profileObject.optional(),
          context: z.string().optional(),
        },
      },
      async (input) => ok(await runQa(input)),
    );
  },
  {
    serverInfo: { name: "job-search-mcp", version: "1.0.0" },
    capabilities: { tools: {} },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: false,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
