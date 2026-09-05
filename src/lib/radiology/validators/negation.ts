// import type { Fact, Report, Warning } from "../types";

// function sentenceIsNegated(text: string): boolean {
//   return /\b(no|without|negative for|absent|not seen|free of|denies|ruled out)\b/i.test(text);
// }

// export function validateNegation(facts: Fact[], report: Report): Warning[] {
//   const warnings: Warning[] = [];
//   for (const sentence of [...report.findings, ...report.impression]) {
//     for (const factId of sentence.factIds) {
//       const fact = facts.find((item) => item.id === factId);
//       if (!fact) continue;
//       const sentenceNegated = sentenceIsNegated(sentence.text);
//       if (sentenceNegated !== fact.negated) {
//         warnings.push({
//           id: `negation-${sentence.id}-${fact.id}`,
//           type: "Negation inconsistency",
//           dictation: fact.sourceQuote,
//           report: sentence.text,
//           severity: "high",
//           fix: fact.negated
//             ? "Restore the documented negation."
//             : "Remove the negation so the positive finding is preserved.",
//           factIds: [fact.id],
//           sentenceId: sentence.id,
//           status: "open",
//         });
//       }
//     }
//   }
//   return warnings;
// }
import type { Fact, Report, Warning } from "../types";

function factIsNegatedInReport(sentence: string, fact: Fact): boolean {
  const text = sentence.toLowerCase();

  // Facts that are explicitly positive should not become negated
  // merely because another fact in the same sentence is negated.
  if (!fact.negated) {
    const entity = fact.entity.toLowerCase();

    // Look for negation immediately associated with this fact/entity.
    const negationPatterns = [
      new RegExp(
        `\\b(no|without|negative for|absent|not seen|free of|denies|ruled out)\\s+(?:\\w+\\s+){0,3}${escapeRegex(entity)}`,
        "i",
      ),
      new RegExp(
        `\\b(no|without|negative for|absent|not seen|free of|denies|ruled out)\\s+(?:\\w+\\s+){0,3}${escapeRegex(fact.anatomy)}`,
        "i",
      ),
    ];

    return negationPatterns.some((pattern) => pattern.test(sentence));
  }

  // For facts that should be negated, look for an explicit
  // negation associated with the fact.
  const entity = fact.entity.toLowerCase();

  const negationPatterns = [
    new RegExp(
      `\\b(no|without|negative for|absent|not seen|free of|denies|ruled out)\\s+(?:\\w+\\s+){0,3}${escapeRegex(entity)}`,
      "i",
    ),
    new RegExp(
      `\\b(no|without|negative for|absent|not seen|free of|denies|ruled out)\\s+(?:\\w+\\s+){0,3}${escapeRegex(fact.anatomy)}`,
      "i",
    ),
  ];

  return negationPatterns.some((pattern) => pattern.test(sentence));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateNegation(facts: Fact[], report: Report): Warning[] {
  const warnings: Warning[] = [];

  for (const sentence of [...report.findings, ...report.impression]) {
    for (const factId of sentence.factIds) {
      const fact = facts.find((item) => item.id === factId);
      if (!fact) continue;

      const reportNegated = factIsNegatedInReport(sentence.text, fact);

      if (reportNegated !== fact.negated) {
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
