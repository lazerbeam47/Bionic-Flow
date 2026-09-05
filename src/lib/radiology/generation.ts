import type { Fact, Report, ReportGenerator, ReportSentence } from "./types";

export type { ReportGenerator };

function factPhrase(fact: Fact): string {
  if (fact.entity === "post-cholecystectomy status") {
    return "post-cholecystectomy status";
  }
  if (fact.entity === "ventricles") {
    return "the ventricles are normal";
  }
  if (fact.entity === "kidneys") {
    return "both kidneys are normal";
  }
  if (fact.entity === "midline shift") {
    return "midline shift";
  }
  if (fact.entity === "biliary dilatation") {
    return "biliary dilatation";
  }
  if (fact.entity.includes("oedema")) {
    return "mild surrounding oedema";
  }
  if (fact.entity === "acute haemorrhage") {
    const measurement = fact.measurement ? ` measuring ${fact.measurement.raw}` : "";
    return `acute haemorrhage${measurement} in the ${fact.anatomy}`;
  }
  if (fact.entity === "lesion") {
    const measurement = fact.measurement ? ` measuring ${fact.measurement.raw}` : "";
    return `hypodense lesion${measurement} in ${fact.anatomy}`;
  }

  const laterality =
    fact.laterality !== "none" && !fact.anatomy.toLowerCase().includes(fact.laterality)
      ? `${fact.laterality} `
      : "";
  const measurement = fact.measurement ? ` measuring ${fact.measurement.raw}` : "";
  return `${laterality}${fact.anatomy} ${fact.entity}${measurement}`.replace(/\s+/g, " ").trim();
}

function isValidationStressCase(dictation: string): boolean {
  return /(?:14\s*(?:mm|millimetres?)|right\s+renal\s+lesion|impression:\s*right)/i.test(dictation);
}

function sentence(
  id: string,
  text: string,
  provenance: ReportSentence["provenance"],
  factIds: string[],
): ReportSentence {
  return { id, text, provenance, factIds };
}

export class MockReportGenerator implements ReportGenerator {
  readonly mode = "mock" as const;

  async generate(facts: Fact[], dictation: string): Promise<Report> {
    const isCase3 = isValidationStressCase(dictation);

    if (isCase3) {
      // Case 3 — Deliberate inconsistency test:
      // Dictation: "There is a 14 millimetre lesion in the left kidney. No hydronephrosis. Impression: Right renal lesion measuring 14 centimetres with hydronephrosis."
      // Facts: Left kidney lesion (14 mm), No hydronephrosis (negated).
      // Report Impression deliberately generates:
      // 1. "Right renal lesion measuring 14 cm is present." -> Laterality + Measurement mismatch
      // 2. "Hydronephrosis is present." -> Negation inconsistency
      const lesionFact = facts.find((f) => f.entity.includes("lesion")) ?? facts[0];
      const hydroFact = facts.find((f) => f.entity.includes("hydronephrosis")) ?? facts[1];

      const findings: ReportSentence[] = [];
      if (lesionFact) {
        findings.push(sentence("finding-1", "There is a 14 mm lesion in the left kidney.", "Dictation", [lesionFact.id]));
      }
      if (hydroFact) {
        findings.push(sentence("finding-2", "No hydronephrosis is present.", "Dictation", [hydroFact.id]));
      }

      const impression: ReportSentence[] = [];
      if (lesionFact) {
        impression.push(sentence("impression-1", "Right renal lesion measuring 14 cm is present.", "Dictation", [lesionFact.id]));
      }
      if (hydroFact) {
        impression.push(sentence("impression-2", "Hydronephrosis is present.", "Dictation", [hydroFact.id]));
      }
      impression.push(
        sentence("impression-3", "Final interpretation requires human review against the source dictation.", "Template", []),
      );

      return { findings, impression };
    }

    // Normal generation for Case 1, Case 2, and arbitrary inputs
    const findings = facts.map((fact, index) => {
      let text: string;
      if (fact.entity === "post-cholecystectomy status") {
        text = "Post-cholecystectomy status.";
      } else if (fact.entity === "ventricles") {
        text = "The ventricles are normal.";
      } else if (fact.entity === "kidneys") {
        text = "Both kidneys are normal.";
      } else if (fact.negated) {
        const phrase = factPhrase(fact);
        text = phrase.toLowerCase().startsWith("no ")
          ? `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`
          : `No ${phrase}.`;
      } else {
        const phrase = factPhrase(fact);
        text = `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)} is present.`;
      }
      return sentence(`finding-${index + 1}`, text, "Dictation", [fact.id]);
    });

    const positiveFacts = facts.filter((fact) => !fact.negated);
    const impression: ReportSentence[] = positiveFacts.map((fact, index) => {
      let text: string;
      if (fact.entity === "post-cholecystectomy status") {
        text = "Post-cholecystectomy status.";
      } else if (fact.entity === "ventricles") {
        text = "Normal ventricles.";
      } else if (fact.entity === "kidneys") {
        text = "Unremarkable kidneys bilaterally.";
      } else {
        const phrase = factPhrase(fact);
        text = `${phrase.charAt(0).toUpperCase()}${phrase.slice(1)}.`;
      }
      return sentence(`impression-${index + 1}`, text, "Dictation", [fact.id]);
    });

    if (impression.length === 0) {
      impression.push(
        sentence("impression-summary", "No positive findings are described in the provided dictation.", "System inference", []),
      );
    }
    impression.push(
      sentence("impression-review", "Final interpretation requires human review against the source dictation.", "Template", []),
    );

    return { findings, impression };
  }
}
