import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MockReportGenerator } from "../../lib/radiology/generation";
import { runWorkflow } from "../../lib/radiology/workflow";
import {
  ReportSchema,
  type Fact,
  type Report,
  type ReportGenerator,
} from "../../lib/radiology/types";

const RequestSchema = z.object({
  dictation: z.string().trim().min(1).max(20000),
  mode: z.enum(["groq", "mock"]).default("groq"),
});

function parseModelJson(content: string): Report {
  const unfenced = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

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
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `
You transform radiology dictation into a structured report.

Use only the structured facts provided.

Never add:
- diagnoses
- findings
- measurements
- laterality
- clinical recommendations

unless they are explicitly represented by a structured fact.

Preserve every documented fact accurately.

MEASUREMENTS:
- Preserve every documented measurement exactly.
- Do not omit, round, convert, or alter measurements.
- Preserve the exact documented unit.
- When a measurable finding is included in the Impression, include its exact documented measurement.

LATERALITY:
- Preserve laterality exactly.
- Never change right to left or left to right.
- Never invent laterality when it is not present in the structured facts.

NEGATION:
- Preserve negation exactly.
- A positive finding must not become negated.
- A negated finding must not become positive.
- Do not infer negation from unrelated findings in the same sentence.

GROUNDING:
- Every generated sentence must be supported by one or more structured facts.
- Do not invent diagnoses or interpretations that are not explicitly represented by the facts.
- Do not introduce new clinical information.

PROVENANCE:
Every sentence must include:
- id
- text
- provenance
- factIds

IMPRESSION:
- The Impression must not be empty when there are positive findings.
- Summarize the clinically important positive findings from the structured facts.
- Include the most important positive findings in the Impression.
- Preserve their laterality and exact measurements.
- Do not introduce diagnoses or interpretations that are not represented by the structured facts.
- Do not add unrelated normal or negative findings unless they are important to the overall summary.

Use provenance as follows:
- Dictation: information directly supported by the structured facts/dictation.
- Template: literal template content.
- System inference: deterministic formatting or system-generated content.

Prefer "Dictation" whenever the sentence is directly supported by the provided facts.
Do not label a fact-derived sentence as "Template".

Return valid JSON only.

The JSON must have this exact top-level structure:
{
  "findings": [
    {
      "id": "string",
      "text": "string",
      "provenance": "Dictation | Template | System inference",
      "factIds": ["string"]
    }
  ],
  "impression": [
    {
      "id": "string",
      "text": "string",
      "provenance": "Dictation | Template | System inference",
      "factIds": ["string"]
    }
  ]
}
                `.trim(),
            },
            {
              role: "user",
              content: JSON.stringify({
                dictation,
                structuredFacts: facts,
              }),
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();

        throw new Error(`Groq request failed (${response.status}): ${errorBody}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
      };

      const content = body.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Groq returned an empty report.");
      }

      return parseModelJson(content);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("Report generation timed out. Try again or use mock mode.");
      }

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

          if (input.mode === "groq" && !apiKey) {
            return Response.json(
              {
                error: "GROQ_API_KEY is not configured. Switch to Mock mode or configure Groq.",
              },
              { status: 500 },
            );
          }

          const generator: ReportGenerator =
            input.mode === "mock"
              ? new MockReportGenerator()
              : new GroqReportGenerator(apiKey as string);

          const result = await runWorkflow(input.dictation, generator);

          return Response.json(result);
        } catch (error) {
          const message =
            error instanceof z.ZodError
              ? "The report data was malformed and could not be validated."
              : error instanceof Error
                ? error.message
                : "Report generation failed.";

          const status = error instanceof z.ZodError ? 400 : 502;

          return Response.json({ error: message }, { status });
        }
      },
    },
  },
});
