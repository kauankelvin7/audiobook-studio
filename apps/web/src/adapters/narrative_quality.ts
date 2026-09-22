import type { NarrationQa, NarrativeMemory, NarrativePlan } from "../schemas/narrative";

const STOP_WORDS = new Set([
  "a", "as", "o", "os", "um", "uma", "de", "da", "das", "do", "dos", "e", "em", "para", "por", "que", "como",
]);

const FORMULAIC_OPENERS = [
  "agora vamos entender",
  "e importante entender",
  "o ponto importante aqui e",
  "em outras palavras",
  "agora que vimos",
] as const;

export type HeadingOverlap = {
  status: "duplicate" | "review" | "distinct";
  method: "exact" | "prefix" | "token_overlap" | "none";
  score: number;
};

export type HeadingFinding = HeadingOverlap & {
  sectionId: string;
  heading: string;
};

export type NarrativeMemoryDelta = {
  conceptsCovered?: string[];
  termsDefined?: string[];
  openThreads?: string[];
  resolvedThreads?: string[];
  currentGoal?: string | null;
  nextConcepts?: string[];
  sourceRefs?: string[];
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}

export function normalizeNarrativeText(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentTokens(input: string): string[] {
  return normalizeNarrativeText(input)
    .split(" ")
    .filter(token => token.length > 0 && !STOP_WORDS.has(token));
}

export function compareHeadingToBody(heading: string, body: string): HeadingOverlap {
  const normalizedHeading = normalizeNarrativeText(heading);
  const normalizedBody = normalizeNarrativeText(body);
  if (!normalizedHeading || !normalizedBody) return { status: "distinct", method: "none", score: 0 };

  if (normalizedHeading === normalizedBody) {
    return { status: "duplicate", method: "exact", score: 1 };
  }

  if (normalizedBody === normalizedHeading || normalizedBody.startsWith(`${normalizedHeading} `)) {
    return { status: "duplicate", method: "prefix", score: 1 };
  }

  const headingTokens = unique(contentTokens(heading));
  if (headingTokens.length === 0) return { status: "distinct", method: "none", score: 0 };

  const bodyTokens = contentTokens(body).slice(0, Math.max(headingTokens.length + 4, 8));
  const bodySet = new Set(bodyTokens);
  const matched = headingTokens.filter(token => bodySet.has(token)).length;
  const score = matched / headingTokens.length;

  if (score >= 0.8) return { status: "duplicate", method: "token_overlap", score };
  if (score >= 0.5) return { status: "review", method: "token_overlap", score };
  return { status: "distinct", method: "none", score };
}

export function findDuplicatedSpokenHeadings(
  plan: NarrativePlan,
  sectionSpeech: Readonly<Record<string, string>>,
): HeadingFinding[] {
  const findings: HeadingFinding[] = [];

  for (const section of plan.sections) {
    if (!section.heading || section.heading.policy !== "announce") continue;
    const body = sectionSpeech[section.id];
    if (!body) continue;
    const overlap = compareHeadingToBody(section.heading.displayText, body);
    if (overlap.status === "distinct") continue;
    findings.push({
      sectionId: section.id,
      heading: section.heading.displayText,
      ...overlap,
    });
  }

  return findings;
}

export function reduceNarrativeMemory(memory: NarrativeMemory, delta: NarrativeMemoryDelta): NarrativeMemory {
  const conceptsCovered = unique([...memory.conceptsCovered, ...(delta.conceptsCovered ?? [])]);
  const termsDefined = unique([...memory.termsDefined, ...(delta.termsDefined ?? [])]);
  const resolved = new Set(delta.resolvedThreads ?? []);
  const openThreads = unique([...memory.openThreads, ...(delta.openThreads ?? [])]).filter(thread => !resolved.has(thread));
  const requestedNext = delta.nextConcepts ?? memory.nextConcepts;
  const covered = new Set(conceptsCovered);
  const nextConcepts = unique(requestedNext).filter(concept => !covered.has(concept));

  return {
    schemaVersion: 1,
    conceptsCovered,
    termsDefined,
    openThreads,
    currentGoal: delta.currentGoal === undefined ? memory.currentGoal : delta.currentGoal,
    nextConcepts,
    sourceRefs: unique([...memory.sourceRefs, ...(delta.sourceRefs ?? [])]),
  };
}

export type FormulaicFinding = {
  opener: string;
  count: number;
  sectionIndexes: number[];
};

export function findRepeatedFormulaicOpeners(sectionTexts: string[], minOccurrences = 3): FormulaicFinding[] {
  if (!Number.isSafeInteger(minOccurrences) || minOccurrences < 2) throw new RangeError("INVALID_MIN_OCCURRENCES");

  return FORMULAIC_OPENERS.flatMap(opener => {
    const indexes = sectionTexts
      .map((text, index) => normalizeNarrativeText(text).startsWith(opener) ? index : -1)
      .filter(index => index >= 0);
    return indexes.length >= minOccurrences ? [{ opener, count: indexes.length, sectionIndexes: indexes }] : [];
  });
}


export function findInvalidSourceRefs(plan: NarrativePlan, validSourceRefs: ReadonlySet<string>): string[] {
  const referenced = new Set<string>();
  for (const section of plan.sections) {
    section.sourceRefs.forEach(ref => referenced.add(ref));
    section.transition?.sourceRefs.forEach(ref => referenced.add(ref));
  }
  return [...referenced].filter(ref => !validSourceRefs.has(ref)).sort();
}

export type BuildNarrationQaInput = {
  planId: string;
  documentSections: number;
  plan: NarrativePlan;
  sectionSpeech: Readonly<Record<string, string>>;
  validSourceRefs: ReadonlySet<string>;
  unsupportedClaims?: number;
  methodVersion?: string;
};

export function buildNarrationQa(input: BuildNarrationQaInput): NarrationQa {
  if (!Number.isSafeInteger(input.documentSections) || input.documentSections < 0) {
    throw new RangeError("INVALID_DOCUMENT_SECTION_COUNT");
  }
  const unsupportedClaims = input.unsupportedClaims ?? 0;
  if (!Number.isSafeInteger(unsupportedClaims) || unsupportedClaims < 0) {
    throw new RangeError("INVALID_UNSUPPORTED_CLAIMS");
  }

  const headingFindings = findDuplicatedSpokenHeadings(input.plan, input.sectionSpeech);
  const duplicatedSpokenHeadings = headingFindings.filter(finding => finding.status === "duplicate").length;
  const headingReviews = headingFindings.filter(finding => finding.status === "review");
  const invalidRefs = findInvalidSourceRefs(input.plan, input.validSourceRefs);
  const formulaic = findRepeatedFormulaicOpeners(
    input.plan.sections.map(section => input.sectionSpeech[section.id] ?? ""),
  );

  const warnings: NarrationQa["warnings"] = [
    ...invalidRefs.map(ref => ({
      code: "INVALID_SOURCE_REF",
      sectionId: null,
      message: `Source reference not found: ${ref}`,
    })),
    ...headingReviews.map(finding => ({
      code: "HEADING_OVERLAP_REVIEW",
      sectionId: finding.sectionId,
      message: `Heading/body overlap requires review (score ${finding.score.toFixed(2)}).`,
    })),
    ...formulaic.map(finding => ({
      code: "FORMULAIC_OPENER",
      sectionId: input.plan.sections[finding.sectionIndexes[0]]?.id ?? null,
      message: `Repeated opener "${finding.opener}" appears ${finding.count} times.`,
    })),
  ];

  const critical = duplicatedSpokenHeadings > 0 || unsupportedClaims > 0 || invalidRefs.length > 0;
  const status: NarrationQa["status"] = critical ? "fail" : warnings.length > 0 ? "review" : "pass";

  return {
    schemaVersion: 1,
    planId: input.planId,
    status,
    documentSections: input.documentSections,
    narrativeSections: input.plan.sections.length,
    spokenChapters: input.plan.spokenChapters.length,
    duplicatedSpokenHeadings,
    unsupportedClaims,
    warnings,
    methodVersion: input.methodVersion ?? "narrative-quality-v1",
  };
}
