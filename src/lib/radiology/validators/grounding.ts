import type { Fact, Report, Warning } from "../types";

const DIAGNOSTIC_WORDS = /\b(carcinoma|metastasis|pneumonia|fracture|malignancy|stroke|abscess|mass|neoplasm|glioblastoma|infarction)\b/gi;

export function validateGrounding(facts: Fact[], report: Report): Warning[] {
  const knownTerms = facts.flatMap((fact) => [
    fact.entity.toLowerCase(),
    fact.anatomy.toLowerCase(),
    fact.sourceQuote.toLowerCase(),
  ]);
  const warnings: Warning[] = [];

  // Critical safety check: NEVER describe gallbladder as normal when post-cholecystectomy is documented
  const hasCholecystectomy = facts.some(
    (fact) =>
      fact.entity.toLowerCase().includes("cholecystectomy") ||
      fact.sourceQuote.toLowerCase().includes("cholecystectomy"),
  );

  for (const sentence of [...report.findings, ...report.impression]) {
    // 1. Check for normal gallbladder in post-cholecystectomy
    if (
      hasCholecystectomy &&
      /\bgallbladder\b.*?\b(?:normal|unremarkable|intact|present|visible|clear|within normal limits)\b/i.test(sentence.text)
    ) {
      warnings.push({
        id: `grounding-cholecystectomy-${sentence.id}`,
        type: "Unsupported content",
        dictation: "Post cholecystectomy status.",
        report: sentence.text,
        severity: "high",
        fix: "Remove description of gallbladder as normal; the gallbladder has been surgically resected.",
        factIds: sentence.factIds,
        sentenceId: sentence.id,
        status: "open",
      });
      continue;
    }

    // 2. Check for unsupported diagnostic claims
    const unsupported = [...sentence.text.matchAll(DIAGNOSTIC_WORDS)]
      .map((match) => match[1])
      .filter((term): term is string => Boolean(term));
    if (unsupported.length === 0) continue;

    const supportedByFact = unsupported.every((term) =>
      knownTerms.some((known) => known.includes(term.toLowerCase())),
    );

    if (!supportedByFact) {
      warnings.push({
        id: `grounding-${sentence.id}`,
        type: "Unsupported content",
        dictation: facts.map((fact) => fact.sourceQuote).join(" ") || "No matching source fact.",
        report: sentence.text,
        severity: "high",
        fix: `Remove unsupported diagnostic language: ${unsupported.join(", ")}.`,
        factIds: sentence.factIds,
        sentenceId: sentence.id,
        status: "open",
      });
    }
  }

  return warnings;
}
