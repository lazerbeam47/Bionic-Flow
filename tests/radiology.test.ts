import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFacts } from "../src/lib/radiology/extraction.ts";
import { MockReportGenerator } from "../src/lib/radiology/generation.ts";
import { validateReport } from "../src/lib/radiology/validation.ts";
import { validateLaterality } from "../src/lib/radiology/validators/laterality.ts";
import { validateNegation } from "../src/lib/radiology/validators/negation.ts";
import { validateMeasurement } from "../src/lib/radiology/validators/measurement.ts";
import { validateGrounding } from "../src/lib/radiology/validators/grounding.ts";
import { validateCompleteness } from "../src/lib/radiology/validators/completeness.ts";
import { applyDeterministicFix, canAutoFix } from "../src/lib/radiology/correction.ts";
import { runWorkflow } from "../src/lib/radiology/workflow.ts";
import { EXAMPLE_CASES } from "../src/lib/radiology/examples.ts";
import type { Fact, Report } from "../src/lib/radiology/types.ts";

describe("Fact Extraction", () => {
  it("extracts Case 1 facts accurately", () => {
    const dictation = EXAMPLE_CASES[0].dictation;
    const facts = extractFacts(dictation);

    const haemorrhage = facts.find((f) => f.entity.includes("haemorrhage"));
    assert.ok(haemorrhage, "Should extract haemorrhage");
    assert.equal(haemorrhage?.laterality, "left");
    assert.equal(haemorrhage?.anatomy, "left basal ganglia");
    assert.deepEqual(haemorrhage?.measurement?.values, [12, 8]);
    assert.equal(haemorrhage?.measurement?.unit, "mm");
    assert.equal(haemorrhage?.negated, false);
    assert.equal(haemorrhage?.severity, "critical");

    const oedema = facts.find((f) => f.entity.includes("oedema"));
    assert.ok(oedema, "Should extract surrounding oedema");
    assert.equal(oedema?.negated, false);

    const midline = facts.find((f) => f.entity.includes("midline"));
    assert.ok(midline, "Should extract midline shift");
    assert.equal(midline?.negated, true);

    const ventricles = facts.find((f) => f.entity.includes("ventricles"));
    assert.ok(ventricles, "Should extract ventricles");
    assert.equal(ventricles?.negated, false);
  });

  it("extracts Case 2 facts accurately", () => {
    const dictation = EXAMPLE_CASES[1].dictation;
    const facts = extractFacts(dictation);

    const cholecystectomy = facts.find((f) => f.entity.includes("cholecystectomy"));
    assert.ok(cholecystectomy, "Should extract post-cholecystectomy status");
    assert.equal(cholecystectomy?.negated, false);

    const lesion = facts.find((f) => f.entity.includes("lesion"));
    assert.ok(lesion, "Should extract liver lesion");
    assert.equal(lesion?.anatomy, "liver segment VI");
    assert.deepEqual(lesion?.measurement?.values, [2.4]);
    assert.equal(lesion?.measurement?.unit, "cm");
    assert.equal(lesion?.negated, false);

    const biliary = facts.find((f) => f.entity.includes("biliary"));
    assert.ok(biliary, "Should extract biliary dilatation");
    assert.equal(biliary?.negated, true);

    const kidneys = facts.find((f) => f.entity.includes("kidneys"));
    assert.ok(kidneys, "Should extract kidneys");
    assert.equal(kidneys?.laterality, "bilateral");
  });

  it("extracts Case 3 source facts from findings section", () => {
    const dictation = EXAMPLE_CASES[2].dictation;
    const facts = extractFacts(dictation);

    const lesion = facts.find((f) => f.entity.includes("lesion"));
    assert.ok(lesion, "Should extract left renal lesion");
    assert.equal(lesion?.laterality, "left");
    assert.equal(lesion?.anatomy, "left kidney");
    assert.deepEqual(lesion?.measurement?.values, [14]);
    assert.equal(lesion?.measurement?.unit, "mm");
    assert.equal(lesion?.negated, false);

    const hydro = facts.find((f) => f.entity.includes("hydronephrosis"));
    assert.ok(hydro, "Should extract hydronephrosis");
    assert.equal(hydro?.negated, true);
  });
});

describe("Deterministic Validators", () => {
  const sampleFact: Fact = {
    id: "fact-1",
    entity: "lesion",
    anatomy: "left kidney",
    laterality: "left",
    measurement: { value: 14, values: [14], unit: "mm", raw: "14 mm" },
    negated: false,
    severity: "important",
    sourceQuote: "There is a 14 millimetre lesion in the left kidney.",
  };

  const sampleHydro: Fact = {
    id: "fact-2",
    entity: "hydronephrosis",
    anatomy: "kidneys",
    laterality: "none",
    measurement: null,
    negated: true,
    severity: "routine",
    sourceQuote: "No hydronephrosis.",
  };

  it("validateLaterality flags left vs right discrepancies", () => {
    const report: Report = {
      findings: [{ id: "f-1", text: "Right renal lesion is present.", provenance: "Dictation", factIds: ["fact-1"] }],
      impression: [],
    };
    const warnings = validateLaterality([sampleFact], report);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.type, "Laterality inconsistency");
    assert.equal(warnings[0]?.severity, "high");
  });

  it("validateLaterality passes when laterality matches", () => {
    const report: Report = {
      findings: [{ id: "f-1", text: "Left renal lesion is present.", provenance: "Dictation", factIds: ["fact-1"] }],
      impression: [],
    };
    const warnings = validateLaterality([sampleFact], report);
    assert.equal(warnings.length, 0);
  });

  it("validateMeasurement flags 14 mm vs 14 cm discrepancy", () => {
    const report: Report = {
      findings: [{ id: "f-1", text: "Left renal lesion measuring 14 cm is present.", provenance: "Dictation", factIds: ["fact-1"] }],
      impression: [],
    };
    const warnings = validateMeasurement([sampleFact], report);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.type, "Measurement mismatch");
    assert.equal(warnings[0]?.severity, "high");
  });

  it("validateMeasurement passes when dimension matches", () => {
    const report: Report = {
      findings: [{ id: "f-1", text: "Left renal lesion measuring 14 mm is present.", provenance: "Dictation", factIds: ["fact-1"] }],
      impression: [],
    };
    const warnings = validateMeasurement([sampleFact], report);
    assert.equal(warnings.length, 0);
  });

  it("validateNegation flags 'No hydronephrosis' vs 'Hydronephrosis is present'", () => {
    const report: Report = {
      findings: [{ id: "f-2", text: "Hydronephrosis is present.", provenance: "Dictation", factIds: ["fact-2"] }],
      impression: [],
    };
    const warnings = validateNegation([sampleHydro], report);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.type, "Negation inconsistency");
    assert.equal(warnings[0]?.severity, "high");
  });

  it("validateNegation passes when negative state matches", () => {
    const report: Report = {
      findings: [{ id: "f-2", text: "No hydronephrosis is present.", provenance: "Dictation", factIds: ["fact-2"] }],
      impression: [],
    };
    const warnings = validateNegation([sampleHydro], report);
    assert.equal(warnings.length, 0);
  });

  it("validateGrounding flags unsupported diagnostic terms", () => {
    const report: Report = {
      findings: [{ id: "f-1", text: "Possible glioblastoma is present.", provenance: "System inference", factIds: [] }],
      impression: [],
    };
    const warnings = validateGrounding([sampleFact], report);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.type, "Unsupported content");
  });

  it("validateGrounding enforces post-cholecystectomy rule: NEVER describe gallbladder as normal", () => {
    const choleFact: Fact = {
      id: "fact-chole",
      entity: "post-cholecystectomy status",
      anatomy: "gallbladder",
      laterality: "none",
      measurement: null,
      negated: false,
      severity: "routine",
      sourceQuote: "Post cholecystectomy status.",
    };
    const report: Report = {
      findings: [{ id: "f-gb", text: "Gallbladder is normal without wall thickening.", provenance: "Dictation", factIds: ["fact-chole"] }],
      impression: [],
    };
    const warnings = validateGrounding([choleFact], report);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.type, "Unsupported content");
    assert.ok(warnings[0]?.fix.includes("surgically resected"));
  });

  it("validateCompleteness flags important findings omitted from Impression", () => {
    const report: Report = {
      findings: [{ id: "f-1", text: "Left renal lesion measuring 14 mm is present.", provenance: "Dictation", factIds: ["fact-1"] }],
      impression: [],
    };
    const warnings = validateCompleteness([sampleFact], report);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.type, "Missing important finding");
  });
});

describe("Deterministic Correction Lifecycle", () => {
  it("fixes Case 3 errors step by step and revalidates to zero warnings", async () => {
    const dictation = EXAMPLE_CASES[2].dictation;
    const initialResult = await runWorkflow(dictation, new MockReportGenerator());

    // Case 3 initially has 3 open warnings: Laterality, Measurement, Negation
    assert.equal(initialResult.warnings.length, 3);
    const latWarn = initialResult.warnings.find((w) => w.type === "Laterality inconsistency");
    const measWarn = initialResult.warnings.find((w) => w.type === "Measurement mismatch");
    const negWarn = initialResult.warnings.find((w) => w.type === "Negation inconsistency");

    assert.ok(latWarn, "Should have laterality warning");
    assert.ok(measWarn, "Should have measurement warning");
    assert.ok(negWarn, "Should have negation warning");
    assert.ok(canAutoFix(latWarn));
    assert.ok(canAutoFix(measWarn));
    assert.ok(canAutoFix(negWarn));

    // 1. Fix Laterality: Right -> Left
    const fix1 = applyDeterministicFix(initialResult.facts, initialResult.report, latWarn);
    assert.equal(fix1.changed, true);
    const reval1 = validateReport(initialResult.facts, fix1.report);
    assert.equal(reval1.some((w) => w.type === "Laterality inconsistency"), false);
    assert.equal(reval1.length, 2); // Measurement & Negation remaining

    // 2. Fix Measurement: 14 cm -> 14 mm
    const fix2 = applyDeterministicFix(initialResult.facts, fix1.report, measWarn);
    assert.equal(fix2.changed, true);
    const reval2 = validateReport(initialResult.facts, fix2.report);
    assert.equal(reval2.some((w) => w.type === "Measurement mismatch"), false);
    assert.equal(reval2.length, 1); // Negation remaining

    // 3. Fix Negation: Hydronephrosis is present -> No hydronephrosis is present
    const fix3 = applyDeterministicFix(initialResult.facts, fix2.report, negWarn);
    assert.equal(fix3.changed, true);
    const reval3 = validateReport(initialResult.facts, fix3.report);
    assert.equal(reval3.length, 0, "All warnings should be resolved after deterministic fixes");
  });
});

describe("End-to-End Workflow for All 3 Cases", () => {
  it("Case 1 produces zero warnings and preserves all key facts", async () => {
    const result = await runWorkflow(EXAMPLE_CASES[0].dictation, new MockReportGenerator());
    assert.equal(result.warnings.length, 0);

    const findingsText = result.report.findings.map((f) => f.text).join(" ").toLowerCase();
    assert.ok(findingsText.includes("12 × 8 mm"));
    assert.ok(findingsText.includes("acute haemorrhage"));
    assert.ok(findingsText.includes("left basal ganglia"));
    assert.ok(findingsText.includes("oedema"));
    assert.ok(findingsText.includes("no midline shift"));
    assert.ok(findingsText.includes("ventricles are normal"));
  });

  it("Case 2 produces zero warnings, preserves post-cholecystectomy, and NEVER describes gallbladder as normal", async () => {
    const result = await runWorkflow(EXAMPLE_CASES[1].dictation, new MockReportGenerator());
    assert.equal(result.warnings.length, 0);

    const allText = [...result.report.findings, ...result.report.impression].map((s) => s.text).join(" ");
    assert.ok(allText.includes("Post-cholecystectomy status"));
    assert.ok(allText.includes("2.4 cm"));
    assert.ok(allText.includes("segment VI"));
    assert.ok(/no biliary dilatation/i.test(allText));
    assert.ok(/kidneys are normal/i.test(allText));
    assert.equal(/gallbladder\s+is\s+normal/i.test(allText), false, "Gallbladder must NEVER be described as normal");
  });
});
