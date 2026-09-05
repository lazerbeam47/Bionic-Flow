import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { runWorkflow } from "../../lib/radiology/workflow";
import { ReportSchema, type Fact, type Report, type ReportGenerator } from "../../lib/radiology/types";

const RequestSchema = z.object({ dictation: z.string().trim().min(1).max(20000) });

function parseModelJson(content: string) {
  const unfenced = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return ReportSchema.parse(JSON.parse(unfenced));
}

class GroqReportGenerator implements ReportGenerator {
  readonly mode = "groq" as const;

  constructor(private readonly apiKey: string) {}

  async generate(facts: Fact[], dictation: string): Promise<Report> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You transform radiology dictation into a report. Use only the structured facts provided. Never add diagnoses, findings, measurements, laterality, or clinical recommendations not explicitly represented by a fact. Every sentence must include factIds and provenance: Dictation, Template, or System inference. Return JSON with findings and impression arrays; each item has id, text, provenance, factIds.",
            },
            {
              role: "user",
              content: JSON.stringify({ dictation, structuredFacts: facts }),
            },
          ],
        }),
      });
      if (!response.ok) throw new Error(`Groq request failed (${response.status}).`);
      const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("Groq returned an empty report.");
      return parseModelJson(content);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("Report generation timed out. Try again or use mock mode.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const Route = createFileRoute("/api/report")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const input = RequestSchema.parse(await request.json());
          const apiKey = process.env["GROQ_API_KEY"];
          const generator = apiKey ? new GroqReportGenerator(apiKey) : undefined;
          const result = await runWorkflow(input.dictation, generator);
          return Response.json(result);
        } catch (error) {
          const message = error instanceof z.ZodError ? "The report data was malformed and could not be validated." : error instanceof Error ? error.message : "Report generation failed.";
          const status = error instanceof z.ZodError ? 400 : 502;
          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
