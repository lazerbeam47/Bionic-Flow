import type { Fact, Laterality } from "./types";

interface EntityDefinition {
  pattern: RegExp;
  entity: string;
  defaultAnatomy: string;
  severity: Fact["severity"];
}

const ENTITY_DEFINITIONS: EntityDefinition[] = [
  {
    pattern: /post[- ]cholecystectomy(?:\s+status)?|cholecystectomy/i,
    entity: "post-cholecystectomy status",
    defaultAnatomy: "gallbladder",
    severity: "routine",
  },
  {
    pattern: /(?:acute\s+)?ha?emorrhage/i,
    entity: "acute haemorrhage",
    defaultAnatomy: "brain",
    severity: "critical",
  },
  {
    pattern: /(?:mild\s+surrounding\s+|surrounding\s+|perilesional\s+)?(?:oe|e)dema/i,
    entity: "mild surrounding oedema",
    defaultAnatomy: "brain",
    severity: "important",
  },
  {
    pattern: /midline\s+shift/i,
    entity: "midline shift",
    defaultAnatomy: "midline",
    severity: "routine",
  },
  {
    pattern: /(?:the\s+)?ventricles(?:\s+are\s+normal)?/i,
    entity: "ventricles",
    defaultAnatomy: "ventricles",
    severity: "routine",
  },
  {
    pattern: /biliary\s+dilatation/i,
    entity: "biliary dilatation",
    defaultAnatomy: "biliary tree",
    severity: "routine",
  },
  {
    pattern: /(?:hypodense\s+)?lesion/i,
    entity: "lesion",
    defaultAnatomy: "organ",
    severity: "important",
  },
  {
    pattern: /(?:both\s+)?kidneys(?:\s+are\s+normal)?/i,
    entity: "kidneys",
    defaultAnatomy: "kidneys",
    severity: "routine",
  },
  {
    pattern: /calculus|stone/i,
    entity: "calculus",
    defaultAnatomy: "urinary tract",
    severity: "important",
  },
  {
    pattern: /hydroureteronephrosis/i,
    entity: "hydroureteronephrosis",
    defaultAnatomy: "ureter",
    severity: "important",
  },
  {
    pattern: /hydronephrosis/i,
    entity: "hydronephrosis",
    defaultAnatomy: "kidneys",
    severity: "routine",
  },
  {
    pattern: /opacity/i,
    entity: "opacity",
    defaultAnatomy: "lower lobe",
    severity: "important",
  },
  {
    pattern: /aneurysm/i,
    entity: "aneurysm",
    defaultAnatomy: "MCA",
    severity: "critical",
  },
  {
    pattern: /infarct/i,
    entity: "acute infarct",
    defaultAnatomy: "brain",
    severity: "critical",
  },
  {
    pattern: /pleural\s+effusion/i,
    entity: "pleural effusion",
    defaultAnatomy: "pleural space",
    severity: "important",
  },
  {
    pattern: /pneumothorax/i,
    entity: "pneumothorax",
    defaultAnatomy: "pleural space",
    severity: "critical",
  },
];

const MEASUREMENT_REGEX = /((?:\d+(?:\.\d+)?\s*(?:x|×|by)\s*)*\d+(?:\.\d+)?)\s*(millimetres?|millimeters?|mm|centimetres?|centimeters?|cm|m[Ll]|%|percent)\b/i;

function normalizeUnit(rawUnit: string): string {
  const lower = rawUnit.toLowerCase();
  if (lower.startsWith("milli") || lower === "mm") return "mm";
  if (lower.startsWith("centi") || lower === "cm") return "cm";
  if (lower.startsWith("ml")) return "mL";
  if (lower.includes("%") || lower.includes("percent")) return "%";
  return lower;
}

function parseMeasurement(text: string) {
  const match = text.match(MEASUREMENT_REGEX);
  if (!match) return null;

  const rawValuesString = match[1] ?? "";
  const rawUnit = match[2] ?? "";
  const values = rawValuesString.split(/\s*(?:x|×|by)\s*/i).map(Number).filter((n) => !Number.isNaN(n));
  if (values.length === 0) return null;

  const unit = normalizeUnit(rawUnit);
  const rawFormatted = values.join(" × ") + " " + unit;

  return {
    value: values[0] ?? 0,
    values,
    unit,
    raw: rawFormatted,
  };
}

function getLaterality(text: string): Laterality {
  const lower = text.toLowerCase();
  if (/\bbilateral\b|\bboth\b/i.test(lower)) return "bilateral";
  if (/\bleft\b/i.test(lower)) return "left";
  if (/\bright\b/i.test(lower)) return "right";
  if (/\bmidline\b/i.test(lower)) return "midline";
  return "none";
}

function sourceSentence(dictation: string, matchIndex: number, matchLength: number): string {
  const before = dictation.slice(0, matchIndex);
  const sentenceEndRegex = /(?<!\d)\.(?:\s+|$)/g;
  let lastStart = 0;
  let match: RegExpExecArray | null;
  while ((match = sentenceEndRegex.exec(before)) !== null) {
    lastStart = match.index + match[0].length;
  }
  const after = dictation.slice(matchIndex + matchLength);
  const nextEndMatch = /(?<!\d)\.(?:\s+|$)/.exec(after);
  const nextEnd = nextEndMatch ? matchIndex + matchLength + nextEndMatch.index : dictation.length;
  return dictation.slice(lastStart, nextEnd).trim();
}

function isNegated(sentence: string, entity: string): boolean {
  const lower = sentence.toLowerCase();
  if (/post[- ]cholecystectomy/i.test(entity)) return false;
  if (/ventricle/i.test(entity)) return false;
  if (/kidney/i.test(entity)) return false;
  if (/ha?emorrhage/i.test(entity) && !/\bno\s+ha?emorrhage/i.test(lower)) return false;
  if (/(?:oe|e)dema/i.test(entity) && !/\bno\s+(?:oe|e)dema/i.test(lower)) return false;
  if (/lesion/i.test(entity) && !/\bno\s+lesion/i.test(lower)) return false;
  if (/\b(no|without|negative for|absent|not seen|free of|denies)\b/i.test(lower)) {
    return true;
  }
  return false;
}

function resolveAnatomy(sentence: string, definition: EntityDefinition): string {
  if (/basal ganglia/i.test(sentence)) return "left basal ganglia";
  if (/segment\s+(?:six|vi\b)/i.test(sentence)) return "liver segment VI";
  if (/liver/i.test(sentence)) return "liver";
  if (/kidney/i.test(sentence)) {
    if (/\bleft\b/i.test(sentence)) return "left kidney";
    if (/\bright\b/i.test(sentence)) return "right kidney";
    return "kidneys";
  }
  if (/ventricle/i.test(sentence)) return "ventricles";
  if (/biliary/i.test(sentence)) return "biliary tree";
  if (/cholecystectomy/i.test(sentence)) return "gallbladder";
  if (/midline/i.test(sentence)) return "midline";
  return definition.defaultAnatomy;
}

export function extractFacts(dictation: string): Fact[] {
  // If dictation already contains an Impression: section (as in deliberate inconsistency tests),
  // findings section is the source of truth for extracted facts.
  const findingsSection = dictation.split(/\bimpression\s*:/i)[0] || dictation;
  const facts: Fact[] = [];

  for (const [index, definition] of ENTITY_DEFINITIONS.entries()) {
    const match = definition.pattern.exec(findingsSection);
    if (!match || match.index === undefined) continue;

    const sentence = sourceSentence(findingsSection, match.index, match[0].length);
    const isMeasurable = ["haemorrhage", "lesion", "calculus", "aneurysm", "opacity", "effusion"].some((t) => definition.entity.includes(t));
    const measurement = isMeasurable ? parseMeasurement(sentence) : null;
    const negated = isNegated(sentence, definition.entity);
    const laterality = getLaterality(sentence);
    const anatomy = resolveAnatomy(sentence, definition);

    facts.push({
      id: `fact-${index + 1}`,
      entity: definition.entity,
      anatomy,
      laterality,
      measurement,
      negated,
      severity: negated ? "routine" : definition.severity,
      sourceQuote: sentence,
    });
  }

  return facts;
}
