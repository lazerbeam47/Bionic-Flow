import { z } from "zod";

export const ProvenanceSchema = z.enum(["Dictation", "Template", "System inference"]);
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const LateralitySchema = z.enum(["left", "right", "bilateral", "midline", "none"]);
export type Laterality = z.infer<typeof LateralitySchema>;

export const MeasurementSchema = z.object({
  value: z.number(),
  values: z.array(z.number()).min(1),
  unit: z.string(),
  raw: z.string(),
});

export const FactSchema = z.object({
  id: z.string(),
  entity: z.string(),
  anatomy: z.string(),
  laterality: LateralitySchema,
  measurement: MeasurementSchema.nullable(),
  negated: z.boolean(),
  severity: z.enum(["routine", "important", "critical"]),
  sourceQuote: z.string(),
});
export type Fact = z.infer<typeof FactSchema>;

export const ReportSentenceSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  provenance: ProvenanceSchema,
  factIds: z.array(z.string()),
});
export type ReportSentence = z.infer<typeof ReportSentenceSchema>;

export const ReportSchema = z.object({
  findings: z.array(ReportSentenceSchema),
  impression: z.array(ReportSentenceSchema),
});
export type Report = z.infer<typeof ReportSchema>;

export const WarningSchema = z.object({
  id: z.string(),
  type: z.enum([
    "Laterality inconsistency",
    "Negation inconsistency",
    "Measurement mismatch",
    "Unsupported content",
    "Missing important finding",
  ]),
  dictation: z.string(),
  report: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  fix: z.string(),
  factIds: z.array(z.string()),
  sentenceId: z.string().nullable(),
  status: z.enum(["open", "fixed", "dismissed"]),
});
export type Warning = z.infer<typeof WarningSchema>;

export const WorkflowResultSchema = z.object({
  facts: z.array(FactSchema),
  report: ReportSchema,
  warnings: z.array(WarningSchema),
  generationMs: z.number().nonnegative(),
  mode: z.enum(["mock", "groq"]),
});
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

export interface ReportGenerator {
  readonly mode: "mock" | "groq";
  generate(facts: Fact[], dictation: string): Promise<Report>;
}

