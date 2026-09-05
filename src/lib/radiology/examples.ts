export type ExampleCase = {
  id: string;
  label: string;
  modality: string;
  dictation: string;
};

export const EXAMPLE_CASES: ExampleCase[] = [
  {
    id: "case-1-brain",
    label: "Case 1 · CT brain",
    modality: "CT BRAIN",
    dictation:
      "CT brain. There is a 12 by 8 millimetre acute haemorrhage in the left basal ganglia with mild surrounding oedema. No midline shift. The ventricles are normal.",
  },
  {
    id: "case-2-abdomen",
    label: "Case 2 · CT abdomen",
    modality: "CT ABDOMEN",
    dictation:
      "Contrast CT abdomen. Post cholecystectomy status. Liver shows a 2.4 centimetre hypodense lesion in segment six. No biliary dilatation. Both kidneys are normal. Rest of the abdomen is unremarkable.",
  },
  {
    id: "case-3-inconsistency",
    label: "Case 3 · Deliberate inconsistency",
    modality: "CT ABDOMEN",
    dictation:
      "There is a 14 millimetre lesion in the left kidney. No hydronephrosis. Impression: Right renal lesion measuring 14 centimetres with hydronephrosis.",
  },
];
