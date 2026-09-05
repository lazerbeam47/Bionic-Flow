import type { Fact, Report, Warning } from "./types";
import { validateCompleteness } from "./validators/completeness";
import { validateGrounding } from "./validators/grounding";
import { validateLaterality } from "./validators/laterality";
import { validateMeasurement } from "./validators/measurement";
import { validateNegation } from "./validators/negation";

export function validateReport(facts: Fact[], report: Report) {
  return [
    ...validateLaterality(facts, report),
    ...validateNegation(facts, report),
    ...validateMeasurement(facts, report),
    ...validateGrounding(facts, report),
    ...validateCompleteness(facts, report),
  ];
}
