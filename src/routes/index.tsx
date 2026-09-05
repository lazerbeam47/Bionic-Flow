import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Check, ChevronDown, CircleHelp, FileText, Info, LoaderCircle, LockKeyhole, Play, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { applyDeterministicFix, canAutoFix } from "../lib/radiology/correction";
import { EXAMPLE_CASES } from "../lib/radiology/examples";
import { validateReport } from "../lib/radiology/validation";
import type { Fact, Provenance, ReportSentence, Warning, WorkflowResult } from "../lib/radiology/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bionic Flow | Radiology Reporting Workspace" },
      { name: "description", content: "Turn radiology dictation into structured, provenance-aware reports with deterministic safety checks." },
      { property: "og:title", content: "Bionic Flow | Radiology Reporting Workspace" },
      { property: "og:description", content: "Review-first radiology reporting with structured facts and deterministic validation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const initialDictation = EXAMPLE_CASES[0]?.dictation ?? "";

function ProvenanceBadge({ provenance }: { provenance: Provenance }) {
  const styles: Record<Provenance, string> = {
    Dictation: "border-brand/35 bg-accent text-accent-foreground",
    Template: "border-border bg-surface-muted text-muted-foreground",
    "System inference": "border-warning/40 bg-warning-soft text-warning-foreground",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${styles[provenance]}`}><span className="size-1.5 rounded-full bg-current" />{provenance}</span>;
}

function FactChip({ fact }: { fact: Fact }) {
  return <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border/70 py-3 last:border-0">
    <span className={`size-2 shrink-0 rounded-full ${fact.negated ? "bg-muted-foreground" : fact.severity === "critical" ? "bg-destructive" : fact.severity === "important" ? "bg-warning" : "bg-success"}`} />
    <span className="font-semibold text-foreground">{fact.entity}</span>
    <span className="text-muted-foreground">{fact.anatomy}</span>
    {fact.laterality !== "none" && <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">{fact.laterality}</span>}
    {fact.measurement && <span className="font-mono text-xs text-primary">{fact.measurement.raw}</span>}
    {fact.negated && <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">negated</span>}
  </div>;
}

function ReportSentenceRow({ sentence }: { sentence: ReportSentence }) {
  return <div className="group border-b border-border/70 py-4 last:border-0">
    <div className="flex items-start gap-3">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand" />
      <p className="flex-1 text-[15px] leading-7 text-foreground">{sentence.text}</p>
    </div>
    <div className="mt-2 pl-4"><ProvenanceBadge provenance={sentence.provenance} /></div>
  </div>;
}

function WarningRow({ warning, onDismiss, onFix }: { warning: Warning; onDismiss: () => void; onFix: () => void }) {
  const severityStyle = warning.severity === "high" ? "bg-destructive" : "bg-warning";
  return <div className="border-b border-border/70 px-5 py-5 last:border-0">
    <div className="flex items-start gap-3">
      <span className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-primary-foreground ${severityStyle}`}><AlertTriangle size={14} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-foreground">{warning.type}</h3>
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{warning.severity}</span>
        </div>
        <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Dictation says</p><p className="leading-6 text-foreground">“{warning.dictation}”</p></div>
          <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Report says</p><p className="leading-6 text-foreground">“{warning.report}”</p></div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Info size={14} className="mt-0.5 shrink-0 text-primary" />{warning.fix}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {canAutoFix(warning) && <Button size="sm" variant="secondary" onClick={onFix}><Check size={14} />Apply fix</Button>}
          <Button size="sm" variant="ghost" onClick={onDismiss}><X size={14} />Dismiss</Button>
        </div>
      </div>
    </div>
  </div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex min-h-[230px] flex-col items-center justify-center px-6 text-center"><div className="mb-4 flex size-12 items-center justify-center rounded-full bg-secondary text-primary"><FileText size={21} /></div><p className="font-semibold text-foreground">{title}</p><p className="mt-1 max-w-xs text-sm leading-6 text-muted-foreground">{detail}</p></div>;
}

function Index() {
  const [dictation, setDictation] = useState(initialDictation);
  const [selectedCase, setSelectedCase] = useState(EXAMPLE_CASES[0]?.id ?? "");
  const [result, setResult] = useState<WorkflowResult | null>(null);
  const [auditWarnings, setAuditWarnings] = useState<Warning[]>([]);
  const [correctionNotice, setCorrectionNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");

  const visibleWarnings = useMemo(() => result?.warnings.filter((warning) => warning.status === "open") ?? [], [result]);

  function loadExample(id: string) {
    const example = EXAMPLE_CASES.find((item) => item.id === id);
    if (!example) return;
    setSelectedCase(id);
    setDictation(example.dictation);
    setResult(null);
    setError("");
    setAuditWarnings([]);
    setCorrectionNotice("");
  }

  async function generateReport() {
    if (!dictation.trim()) {
      setError("Paste a dictation before generating a report.");
      return;
    }
    setIsGenerating(true);
    setError("");
    setAuditWarnings([]);
    setCorrectionNotice("");
    try {
      const response = await fetch("/api/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dictation }) });
      const body = (await response.json()) as WorkflowResult | { error?: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : "Report generation failed.");
      setResult(body as WorkflowResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Report generation failed. Try again.");
    } finally {
      setIsGenerating(false);
    }
  }

  function dismissWarning(warning: Warning) {
    const dismissed = { ...warning, status: "dismissed" as const };
    setAuditWarnings((current) => [...current.filter((item) => item.id !== warning.id), dismissed]);
    setResult((current) => current ? { ...current, warnings: current.warnings.map((item) => item.id === warning.id ? dismissed : item) } : current);
    setCorrectionNotice("Warning dismissed for human review.");
  }

  function applyFix(warning: Warning) {
    if (!result) return;
    const correction = applyDeterministicFix(result.facts, result.report, warning);
    if (!correction.changed) {
      setCorrectionNotice(correction.description);
      return;
    }

    const revalidatedWarnings = validateReport(result.facts, correction.report);
    const unresolved = revalidatedWarnings.some((item) => item.id === warning.id);
    if (unresolved) {
      setResult({ ...result, report: correction.report, warnings: revalidatedWarnings });
      setCorrectionNotice(`${correction.description} The warning remains open after revalidation.`);
      return;
    }

    const fixed = { ...warning, status: "fixed" as const };
    setAuditWarnings((current) => [...current.filter((item) => item.id !== warning.id), fixed]);
    setResult({ ...result, report: correction.report, warnings: [...revalidatedWarnings, fixed] });
    setCorrectionNotice(`${correction.description} Corrected and revalidated.`);
  }

  return <div className="min-h-screen bg-background">
    <header className="border-b border-border bg-surface/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between px-5 py-4 lg:px-9">
        <div className="flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Sparkles size={17} /></div><div><p className="font-display text-lg font-bold tracking-tight text-foreground">Bionic Flow</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Radiology workspace</p></div></div>
        <div className="hidden items-center gap-5 text-xs font-semibold text-muted-foreground sm:flex"><span className="flex items-center gap-1.5"><ShieldCheck size={15} className="text-success" />Review-first reporting</span><span className="flex items-center gap-1.5"><LockKeyhole size={14} />Local demo mode</span></div>
        <Button variant="ghost" size="icon" aria-label="Open help"><CircleHelp size={19} /></Button>
      </div>
    </header>

    <main className="mx-auto max-w-[1480px] px-5 py-8 lg:px-9 lg:py-10">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">Structured reporting</p><h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">Dictation to report, with the trail intact.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Transform clinical language into a reviewable report while keeping every sentence tied to its source.</p></div><div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-success" />System ready</div></div>

      <section className="mb-7 border border-border bg-surface shadow-[0_10px_32px_-22px_var(--foreground)]">
        <div className="flex flex-col justify-between gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded bg-secondary text-primary"><span className="text-xs font-bold">01</span></span><h2 className="font-display text-lg font-bold">Source dictation</h2></div><p className="mt-1 pl-8 text-xs text-muted-foreground">Paste the radiologist’s dictation to begin.</p></div><div className="relative"><select aria-label="Load a test case" value={selectedCase} onChange={(event) => loadExample(event.target.value)} className="h-10 appearance-none rounded-md border border-border bg-background py-2 pl-3 pr-9 text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-ring"><option value="" disabled>Load test case</option>{EXAMPLE_CASES.map((example) => <option key={example.id} value={example.id}>{example.label}</option>)}</select><ChevronDown size={15} className="pointer-events-none absolute right-3 top-3 text-muted-foreground" /></div></div>
        <div className="p-5"><textarea aria-label="Radiology dictation" value={dictation} onChange={(event) => { setDictation(event.target.value); setResult(null); }} placeholder="Paste radiology dictation here..." className="min-h-[154px] w-full resize-y rounded-md border border-border bg-background p-4 text-[15px] leading-7 text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-ring" /><div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div className="flex flex-wrap gap-2">{EXAMPLE_CASES.map((example) => <Button key={example.id} variant={selectedCase === example.id ? "secondary" : "ghost"} size="sm" onClick={() => loadExample(example.id)}><Play size={12} fill="currentColor" />{example.label}</Button>)}</div><Button onClick={generateReport} disabled={isGenerating} className="sm:min-w-[168px]">{isGenerating ? <><LoaderCircle size={16} className="animate-spin" />Generating...</> : <>Generate report <ArrowRight size={16} /></>}</Button></div>{error && <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}</div>
      </section>

      <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded bg-secondary text-primary"><span className="text-xs font-bold">02</span></span><h2 className="font-display text-lg font-bold">Structured facts</h2></div><p className="mt-1 pl-8 text-xs text-muted-foreground">The source of truth for safety checks.</p></div>{result && <span className="rounded-full bg-success-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-success">{result.facts.length} extracted</span>}</div>
          {result ? <div className="px-5 py-2">{result.facts.map((fact) => <FactChip key={fact.id} fact={fact} />)}</div> : <EmptyState title="Facts will appear here" detail="Generate a report to extract anatomy, laterality, measurements, negation, and severity." />}
        </section>

        <section className="border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded bg-secondary text-primary"><span className="text-xs font-bold">03</span></span><h2 className="font-display text-lg font-bold">Generated report</h2></div><p className="mt-1 pl-8 text-xs text-muted-foreground">Every sentence includes its provenance.</p></div>{result && <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />{result.mode} · {result.generationMs} ms</span>}</div>
          {result ? <div className="grid gap-5 p-5"><div><div className="mb-1 flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Findings</h3><span className="text-[11px] text-muted-foreground">{result.report.findings.length} sentences</span></div>{result.report.findings.map((sentence) => <ReportSentenceRow key={sentence.id} sentence={sentence} />)}</div><div className="border-t border-border pt-5"><h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">Impression</h3>{result.report.impression.map((sentence) => <ReportSentenceRow key={sentence.id} sentence={sentence} />)}</div></div> : <EmptyState title="Your report will appear here" detail="Findings and impression will be generated from the structured facts." />}
        </section>
      </div>

      <section className="mt-7 border border-border bg-surface">
        <div className="flex flex-col justify-between gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded bg-warning-soft text-warning-foreground"><span className="text-xs font-bold">04</span></span><h2 className="font-display text-lg font-bold">Safety review</h2></div><p className="mt-1 pl-8 text-xs text-muted-foreground">Deterministic checks run against the structured facts.</p></div>{result && <div className={`flex items-center gap-2 text-xs font-bold ${visibleWarnings.length ? "text-warning-foreground" : "text-success"}`}><span className={`flex size-6 items-center justify-center rounded-full ${visibleWarnings.length ? "bg-warning" : "bg-success"} text-primary-foreground`}>{visibleWarnings.length ? <AlertTriangle size={13} /> : <Check size={13} />}</span>{visibleWarnings.length ? `${visibleWarnings.length} review ${visibleWarnings.length === 1 ? "item" : "items"}` : "No consistency issues found"}</div>}</div>
         {correctionNotice && <p role="status" className="border-b border-border bg-success-soft px-5 py-3 text-sm font-semibold text-success">{correctionNotice}</p>}
         {result && visibleWarnings.length > 0 ? <div>{visibleWarnings.map((warning) => <WarningRow key={warning.id} warning={warning} onDismiss={() => dismissWarning(warning)} onFix={() => applyFix(warning)} />)}</div> : result ? <div className="flex flex-col items-center justify-center px-6 py-12 text-center"><div className="mb-3 flex size-11 items-center justify-center rounded-full bg-success-soft text-success"><ShieldCheck size={21} /></div><p className="font-semibold text-foreground">Report is ready for human review</p><p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">All checked content is consistent with the extracted facts. Confirm the report against the original dictation before sign-off.</p><Button variant="secondary" size="sm" className="mt-5" onClick={() => { setResult(null); setAuditWarnings([]); setCorrectionNotice(""); }}><RotateCcw size={14} />Start another report</Button></div> : <EmptyState title="Validation waits for a report" detail="Laterality, negation, measurements, grounding, and completeness will be checked here." />}
         {auditWarnings.length > 0 && <div className="border-t border-border px-5 py-4"><h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Review history</h3><div className="grid gap-2 sm:grid-cols-2">{auditWarnings.map((warning) => <div key={`${warning.id}-${warning.status}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs"><span className="min-w-0 truncate text-foreground">{warning.type}</span><span className={`shrink-0 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider ${warning.status === "fixed" ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground"}`}>{warning.status}</span></div>)}</div></div>}
      </section>
      <footer className="mt-6 flex items-start gap-2 px-1 text-xs leading-5 text-muted-foreground"><Info size={14} className="mt-0.5 shrink-0" />Bionic Flow reduces hallucination risk through constrained generation and deterministic validation. It does not replace clinical judgment or the final human sign-off.</footer>
    </main>
  </div>;
}
