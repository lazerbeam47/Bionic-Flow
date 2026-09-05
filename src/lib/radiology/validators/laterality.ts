import type { Fact, Report, Warning } from "../types";

const lateralityPattern = /\b(left|right|bilateral)\b/gi;

export function validateLaterality(facts: Fact[], report: Report): Warning[] {
  const warnings: Warning[] = [];
  for (const sentence of [...report.findings, ...report.impression]) {
    for (const factId of sentence.factIds) {
      const fact = facts.find((item) => item.id === factId);
      if (!fact || fact.laterality === "none" || fact.laterality === "midline") continue;
      const mentions = [...sentence.text.matchAll(lateralityPattern)]
        .map((match) => match[1]?.toLowerCase())
        .filter((val): val is string => Boolean(val));
      if (mentions.length > 0 && !mentions.includes(fact.laterality)) {
        warnings.push({
          id: `laterality-${sentence.id}-${fact.id}`,
          type: "Laterality inconsistency",
          dictation: fact.sourceQuote,
          report: sentence.text,
          severity: "high",
          fix: `Use “${fact.laterality}” everywhere this fact is referenced.`,
          factIds: [fact.id],
          sentenceId: sentence.id,
          status: "open",
        });
      }
    }
  }
  return warnings;
}
