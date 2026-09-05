import type { Fact, Report, ReportSentence, Warning } from "./types";

const MEASUREMENT_PATTERN = /((?:\d+(?:\.\d+)?\s*(?:x|×|by)\s*)*\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|mm|centimetres?|centimeters?|cm|m[Ll]|%|percent)\b/i;
const lateralityPattern = /\b(left|right|bilateral)\b/gi;

export type CorrectionResult = {
  report: Report;
  changed: boolean;
  description: string;
};

export function canAutoFix(warning: Warning) {
  if (["Laterality inconsistency", "Measurement mismatch", "Negation inconsistency"].includes(warning.type)) {
    return warning.factIds.length === 1;
  }
  return warning.type === "Unsupported content" && warning.sentenceId !== null;
}

function updateReportSentence(
  report: Report,
  warning: Warning,
  transform: (sentence: ReportSentence) => ReportSentence | null,
): { report: Report; changed: boolean } {
  let changed = false;
  const update = (sentence: ReportSentence) => {
    const isTarget = warning.sentenceId === sentence.id || (warning.sentenceId === null && warning.report === sentence.text);
    if (!isTarget) return sentence;
    const next = transform(sentence);
    if (next === null) {
      changed = true;
      return null;
    }
    if (next.text !== sentence.text) changed = true;
    return next;
  };

  return {
    report: {
      findings: report.findings.map(update).filter((sentence): sentence is ReportSentence => sentence !== null),
      impression: report.impression.map(update).filter((sentence): sentence is ReportSentence => sentence !== null),
    },
    changed,
  };
}

function targetFact(facts: Fact[], warning: Warning) {
  return warning.factIds.length === 1 ? facts.find((fact) => fact.id === warning.factIds[0]) : undefined;
}

function correctNegation(text: string, fact: Fact) {
  if (fact.negated) {
    if (/\bwith\s+hydronephrosis\b/i.test(text)) {
      return text.replace(/\bwith\s+hydronephrosis\b/i, "without hydronephrosis");
    }
    const cleaned = text.replace(/^\s*(?:no|without|negative for|absent)\s*/i, "").trim();
    return `No ${cleaned.charAt(0).toLowerCase()}${cleaned.slice(1)}`;
  }

  return text
    .replace(/\b(no|without|negative for|absent)\b\s*/i, "")
    .replace(/\bis not present\b|\bis absent\b/i, "is present")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function applyDeterministicFix(facts: Fact[], report: Report, warning: Warning): CorrectionResult {
  if (!canAutoFix(warning)) return { report, changed: false, description: "This warning requires manual review." };

  const fact = targetFact(facts, warning);
  if (warning.type === "Laterality inconsistency" && fact && fact.laterality !== "none" && fact.laterality !== "midline") {
    const targetLaterality = fact.laterality;
    const result = updateReportSentence(report, warning, (sentence) => ({
      ...sentence,
      text: sentence.text.replace(lateralityPattern, (match) => {
        const isUpper = match[0] === match[0]?.toUpperCase();
        return isUpper
          ? targetLaterality.charAt(0).toUpperCase() + targetLaterality.slice(1)
          : targetLaterality.toLowerCase();
      }),
    }));
    return { ...result, description: `Replaced the report laterality with “${fact.laterality}”.` };
  }

  if (warning.type === "Measurement mismatch" && fact?.measurement) {
    const rawMeasurement = fact.measurement.raw;
    const result = updateReportSentence(report, warning, (sentence) => ({
      ...sentence,
      text: MEASUREMENT_PATTERN.test(sentence.text)
        ? sentence.text.replace(MEASUREMENT_PATTERN, rawMeasurement)
        : sentence.text.replace(/\b(is present|are present|is seen|are seen)\.?$/i, `measuring ${rawMeasurement} $1`),
    }));
    return { ...result, description: `Restored the documented measurement “${rawMeasurement}”.` };
  }

  if (warning.type === "Negation inconsistency" && fact) {
    const result = updateReportSentence(report, warning, (sentence) => ({
      ...sentence,
      text: correctNegation(sentence.text, fact),
    }));
    return { ...result, description: fact.negated ? "Restored the documented negation." : "Removed the unsupported negation." };
  }

  if (warning.type === "Unsupported content") {
    const result = updateReportSentence(report, warning, () => null);
    return { ...result, description: "Removed the unsupported report sentence." };
  }

  return { report, changed: false, description: "This warning requires manual review." };
}