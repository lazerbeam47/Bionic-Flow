import type { Fact, Report, Warning } from "../types";

function sentenceIsNegated(text: string): boolean {
  return /\b(no|without|negative for|absent|not seen|free of|denies|ruled out)\b/i.test(text);
}

export function validateNegation(facts: Fact[], report: Report): Warning[] {
  const warnings: Warning[] = [];
  for (const sentence of [...report.findings, ...report.impression]) {
    for (const factId of sentence.factIds) {
      const fact = facts.find((item) => item.id === factId);
      if (!fact) continue;
      const sentenceNegated = sentenceIsNegated(sentence.text);
      if (sentenceNegated !== fact.negated) {
        warnings.push({
          id: `negation-${sentence.id}-${fact.id}`,
          type: "Negation inconsistency",
          dictation: fact.sourceQuote,
          report: sentence.text,
          severity: "high",
          fix: fact.negated
            ? "Restore the documented negation."
            : "Remove the negation so the positive finding is preserved.",
          factIds: [fact.id],
          sentenceId: sentence.id,
          status: "open",
        });
      }
    }
  }
  return warnings;
}
