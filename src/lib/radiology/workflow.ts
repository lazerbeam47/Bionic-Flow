import { extractFacts } from "./extraction";
import { MockReportGenerator, type ReportGenerator } from "./generation";
import { validateReport } from "./validation";
import { WorkflowResultSchema, type WorkflowResult } from "./types";

export async function runWorkflow(dictation: string, generator: ReportGenerator = new MockReportGenerator()): Promise<WorkflowResult> {
  const startedAt = performance.now();
  const facts = extractFacts(dictation);
  const report = await generator.generate(facts, dictation);
  const result = {
    facts,
    report,
    warnings: validateReport(facts, report),
    generationMs: Math.max(1, Math.round(performance.now() - startedAt)),
    mode: generator.mode,
  } satisfies WorkflowResult;
  return WorkflowResultSchema.parse(result);
}
