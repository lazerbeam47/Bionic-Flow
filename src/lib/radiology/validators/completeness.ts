import type { Fact, Report, Warning } from "../types";

export function validateCompleteness(facts: Fact[], report: Report): Warning[] {
  return facts
    .filter((fact) => !fact.negated && fact.severity !== "routine")
    .filter((fact) => !report.impression.some((sentence) => sentence.factIds.includes(fact.id)))
    .map((fact) => ({
      id: `completeness-${fact.id}`,
      type: "Missing important finding" as const,
      dictation: fact.sourceQuote,
      report: "No corresponding impression sentence.",
      severity: fact.severity === "critical" ? ("high" as const) : ("medium" as const),
      fix: `Add “${fact.entity}” to the impression.`,
      factIds: [fact.id],
      sentenceId: null,
      status: "open" as const,
    }));
}
