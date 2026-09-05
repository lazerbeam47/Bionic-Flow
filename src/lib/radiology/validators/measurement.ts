import type { Fact, Report, Warning } from "../types";

const MEASUREMENT_PATTERN = /((?:\d+(?:\.\d+)?\s*(?:x|×|by)\s*)*\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|mm|centimetres?|centimeters?|cm|m[Ll]|%|percent)\b/i;

function normalizeUnit(rawUnit: string): string {
  const lower = rawUnit.toLowerCase();
  if (lower.startsWith("milli") || lower === "mm") return "mm";
  if (lower.startsWith("centi") || lower === "cm") return "cm";
  if (lower.startsWith("ml")) return "mL";
  if (lower.includes("%") || lower.includes("percent")) return "%";
  return lower;
}

export function validateMeasurement(facts: Fact[], report: Report): Warning[] {
  const warnings: Warning[] = [];
  for (const sentence of [...report.findings, ...report.impression]) {
    for (const factId of sentence.factIds) {
      const fact = facts.find((item) => item.id === factId);
      if (!fact?.measurement) continue;
      const match = sentence.text.match(MEASUREMENT_PATTERN);
      if (!match) {
        warnings.push({
          id: `measurement-missing-${sentence.id}-${fact.id}`,
          type: "Measurement mismatch",
          dictation: fact.sourceQuote,
          report: sentence.text,
          severity: "medium",
          fix: `Preserve the documented measurement: ${fact.measurement.raw}.`,
          factIds: [fact.id],
          sentenceId: sentence.id,
          status: "open",
        });
        continue;
      }
      const rawValues = match[1] ?? "";
      const rawUnit = match[2] ?? "";
      const values = rawValues.split(/\s*(?:x|×|by)\s*/i).map(Number).filter((n) => !Number.isNaN(n));
      const expectedValues = fact.measurement.values;
      const sameValue = values.length === expectedValues.length && values.every((value, index) => value === expectedValues[index]);
      const sameUnit = normalizeUnit(rawUnit) === normalizeUnit(fact.measurement.unit);
      if (!sameValue || !sameUnit) {
        warnings.push({
          id: `measurement-mismatch-${sentence.id}-${fact.id}`,
          type: "Measurement mismatch",
          dictation: fact.sourceQuote,
          report: sentence.text,
          severity: "high",
          fix: `Use the documented measurement: ${fact.measurement.raw}.`,
          factIds: [fact.id],
          sentenceId: sentence.id,
          status: "open",
        });
      }
    }
  }
  return warnings;
}
