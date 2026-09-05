# Bionic Flow · AI-Assisted Radiology Reporting Workspace

Bionic Flow is a production-minded prototype of an AI-assisted radiology reporting workspace. It converts unstructured radiology dictations into structured **Findings** and **Impression** reports, preserves sentence-level provenance, and enforces safety through **deterministic validation** before clinical sign-off.

---

## 1. Core Architecture

```
Dictation
   │
   ▼
Fact Extraction ───► Structured Facts (Source of Truth)
   │                       │
   ▼                       ▼
Report Generation ──► Deterministic Validation
(Groq or Mock)             │
   │                       ▼
   └───────────────► Safety Review & Human Sign-off
                     (One-Click Fixes & Audit History)
```

The workflow follows five discrete stages:
1. **Dictation**: Clinician inputs raw text or selects from verified test cases.
2. **Fact Extraction**: Clinical entities, anatomy, laterality, measurements, negation status, and severity are parsed into normalized `Fact` objects. These structured facts act as the immutable source of truth.
3. **Report Generation**: Synthesizes formal `Findings` and `Impression` sections. Every sentence carries provenance metadata (`Dictation`, `Template`, or `System inference`) and explicit links to supporting fact IDs.
4. **Deterministic Validation**: Pure TypeScript rules compare the generated report against the structured facts. The LLM is never permitted to validate its own output.
5. **Human Review**: Clinicians inspect highlighted safety warnings, review side-by-side evidence, dismiss warnings for clinical discretion, or apply deterministic auto-fixes that immediately trigger revalidation.

---

## 2. Why This Architecture?

Large language models excel at natural language synthesis, formatting, and stylistic transformation. However, they are probabilistic systems that suffer from:
- **Hallucination**: Inventing unobserved findings or diagnoses.
- **Sycophancy & Self-Confirmation**: When asked to check their own output, LLMs frequently affirm errors or invent justifications.
- **Subtle Consistency Flips**: Inverting negation ("no hydronephrosis" becoming "hydronephrosis"), swapping laterality ("left" becoming "right"), or escalating units ("14 mm" becoming "14 cm").

By separating **language transformation** (handled by the LLM or Mock generator) from **safety verification** (handled strictly by deterministic TypeScript validators against extracted ground truth), Bionic Flow guarantees that critical inconsistencies cannot slip past undetected.

---

## 3. Hallucination Reduction Strategy

Bionic Flow reduces hallucination risk through five defense layers:

1. **Structured Facts as Source of Truth**: Before report generation, key observations are extracted into a strictly typed schema with normalized units and laterality.
2. **Constrained Generation**: The LLM prompt and schema demand sentence-level grounding, forbidding any diagnostic claims not anchored to extracted facts.
3. **Sentence-Level Provenance**: Every sentence is tagged (`Dictation`, `Template`, `System inference`), allowing radiologists to instantly trace the origin of every claim.
4. **Deterministic TypeScript Validators**: Independent rules verify laterality, negation, measurements, ungrounded diagnostic claims, and impression completeness.
5. **Human Review & Sign-Off**: The system is review-first. Clinicians retain final authority to inspect, correct, and sign off on reports.

> **Important**: This architecture reduces hallucination risk; it does not claim to completely eliminate it. Final clinical interpretation always requires human verification.

---

## 4. Assessment Test Cases

Bionic Flow includes three quick-load test cases aligned with clinical reporting requirements:

### Case 1 · CT Brain
> *"CT brain. There is a 12 by 8 millimetre acute haemorrhage in the left basal ganglia with mild surrounding oedema. No midline shift. The ventricles are normal."*
- **Preserves**: Left basal ganglia, 12 × 8 mm, acute haemorrhage, mild surrounding oedema, "No midline shift", normal ventricles.
- **Safety checks**: Confirms zero hallucinations, no inverted laterality, and no introduced midline shift. Result: **0 warnings**.

### Case 2 · CT Abdomen
> *"Contrast CT abdomen. Post cholecystectomy status. Liver shows a 2.4 centimetre hypodense lesion in segment six. No biliary dilatation. Both kidneys are normal. Rest of the abdomen is unremarkable."*
- **Preserves**: Post-cholecystectomy status, 2.4 cm lesion in segment VI, no biliary dilatation, normal kidneys bilaterally.
- **Safety checks**: Enforces the critical rule that **the gallbladder must NEVER be described as normal** when post-cholecystectomy is documented, and prevents unsupported diagnoses for the liver lesion. Result: **0 warnings**.

### Case 3 · Deliberate Inconsistency Test
> *"There is a 14 millimetre lesion in the left kidney. No hydronephrosis. Impression: Right renal lesion measuring 14 centimetres with hydronephrosis."*
- **Detects three distinct errors**:
  1. **Laterality inconsistency**: Left kidney vs. Right renal lesion.
  2. **Measurement mismatch**: 14 mm vs. 14 cm.
  3. **Negation inconsistency**: No hydronephrosis vs. Hydronephrosis present.
- **Fix Lifecycle**: Applying each deterministic fix updates the report and re-runs `validateReport()`. Warnings resolve to `fixed` in the audit history until the report is clean.

---

## 5. Deterministic Validators

The validation pipeline (`src/lib/radiology/validators/`) inspects generated reports without LLM calls:

| Validator | Target Check | Example Caught |
|:---|:---|:---|
| **Laterality** | Ensures report laterality matches source facts | Fact: `left`, Report: `Right renal lesion` |
| **Negation** | Detects flipped positive/negative polarity | Fact: `No hydronephrosis`, Report: `Hydronephrosis present` |
| **Measurement** | Verifies dimensions and normalized units | Fact: `14 mm`, Report: `14 cm` |
| **Grounding** | Flags unsupported high-risk diagnostic terms and checks post-cholecystectomy gallbladder integrity | Catches `carcinoma` or `gallbladder normal` when gallbladder was surgically removed |
| **Completeness** | Ensures non-negated important/critical findings reach the Impression | Flags when a critical haemorrhage or lesion is omitted from the final impression |

---

## 6. Fix and Dismiss Lifecycle

- **Apply Fix**:
  1. Executes a deterministic string transformation (e.g. replacing laterality with case preservation, restoring units, or restoring negation).
  2. Re-runs `validateReport()` against the updated report.
  3. The warning is removed from active warnings **only if genuinely resolved**.
  4. The resolved warning is archived into the **Review History** marked as `fixed`.
- **Dismiss**:
  1. The clinician acknowledges the warning but chooses to leave the report as written.
  2. The warning is removed from active review items and archived into the **Review History** marked as `dismissed`.
  3. Dismissed items are **never** represented as successful validations; the audit trail preserves the dismissal.

---

## 7. Mock Mode & Error Handling

- **Mock Mode (Default)**: Runs out of the box with zero external dependencies or API keys. For Case 3, it intentionally injects the three safety errors so reviewers can immediately evaluate validator and auto-fix capabilities.
- **Groq Mode**: When `GROQ_API_KEY` is provided in the environment, the server calls Groq API (`llama-3.3-70b-versatile`) with strict JSON schema enforcement and temperature 0.
- **Graceful Error Handling**:
  - Empty dictations are rejected client-side with clear validation alerts.
  - LLM timeouts (15s abort controller), network drops, or malformed JSON trigger graceful fallback messages without crashing the application.

---

## 8. Running Locally

### Prerequisites
- Node.js >= 20.x (tested on Node 22.17.1)
- npm >= 10.x

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Run unit tests (verifies extraction, all 5 validators, and correction lifecycle)
npm test

# 3. Verify TypeScript compilation
npm run typecheck

# 4. Build for production
npm run build

# 5. Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

To enable Groq inference, set your API key:
```bash
export GROQ_API_KEY="your-groq-api-key"
npm run dev
```
If `GROQ_API_KEY` is not set, Bionic Flow automatically runs in Mock mode.

---

## 9. Known Limitations

- **Scoped Deterministic Extraction**: Clinical entity extraction uses targeted regex patterns rather than full NLP dependency parsing.
- **Vocabulary Scope**: Designed for the assessment's modalities (Brain CT/MRI, Abdominal CT, Renal CT); does not cover all ICD-10 or RadLex terminologies.
- **Clinical Reasoning Depth**: Validators check consistency between dictation and report; they do not perform deep physiological or staging inference.
- **Prototype Validation**: Safety checks are scoped consistency guards, not regulatory-grade medical device software.

---

## 10. Production Roadmap

For hospital or enterprise deployment, the following enhancements would be required:
1. **Medical Ontologies**: Integration with RadLex and SNOMED-CT for synonym mapping and anatomy trees.
2. **Template Management**: Departmental and radiologist-specific reporting templates with version control.
3. **Observability & Model Monitoring**: Tracking drift, latency, token usage, and validator trigger rates.
4. **Audit Logging & Compliance**: Comprehensive audit trails of every keystroke, fix, and sign-off in accordance with HIPAA / GDPR.
5. **Role-Based Access Control (RBAC)**: Distinct permissions for resident drafters, attending radiologists, and administrative staff.
6. **Multi-Model Fallback**: Automated failover across multiple LLM providers (e.g., Groq to Anthropic to self-hosted vLLM).
7. **Production Storage**: PostgreSQL database with pgvector for similar-case retrieval.

---

## 11. AI Tools Disclosure

In accordance with the assessment guidelines, AI-assisted development (DeepMind's Antigravity pairing assistant) was utilized during the development of this prototype. AI was used to assist with boilerplate drafting, unit test authoring, and edge-case pattern formulation. All generated logic, deterministic validators, regex rules, and safety behaviors were verified and executed against the automated test suite.
