import { describe, expect, it } from "vitest";
import type { NarrativeMemory, NarrativePlan } from "../schemas/narrative";
import {
  buildNarrationQa,
  compareHeadingToBody,
  findDuplicatedSpokenHeadings,
  findInvalidSourceRefs,
  findRepeatedFormulaicOpeners,
  normalizeNarrativeText,
  reduceNarrativeMemory,
} from "./narrative_quality";

function plan(policy: "announce" | "integrate" | "silent" = "announce"): NarrativePlan {
  return {
    schemaVersion: 1,
    documentId: "doc_1",
    sections: [{
      id: "section_1",
      sourceRefs: ["p1-t1"],
      conceptIds: ["indexed_files"],
      heading: { displayText: "Arquivos indexados", policy, reason: "mudança de assunto" },
      transition: null,
      spokenChapterId: "chapter_1",
      estimatedSeconds: 60,
    }],
    spokenChapters: [{ id: "chapter_1", sectionIds: ["section_1"], displayTitle: "Arquivos" }],
  };
}

const memory: NarrativeMemory = {
  schemaVersion: 1,
  conceptsCovered: ["PIC"],
  termsDefined: ["PIC"],
  openThreads: ["estruturas repetitivas"],
  currentGoal: "estrutura de dados",
  nextConcepts: ["OCCURS"],
  sourceRefs: ["p1-t1"],
};

describe("narrative quality guards", () => {
  it("normalizes case, accents and punctuation without changing technical digits", () => {
    expect(normalizeNarrativeText("  SQLCODE -911: Introdução! ")).toBe("sqlcode 911 introducao");
  });

  it("detects a heading repeated verbatim at the start of the body", () => {
    expect(compareHeadingToBody("Arquivos indexados", "Arquivos indexados permitem acesso por chave."))
      .toEqual({ status: "duplicate", method: "prefix", score: 1 });
  });

  it("detects paraphrased heading overlap through content tokens", () => {
    const result = compareHeadingToBody(
      "Como funcionam os arquivos indexados",
      "Arquivos indexados funcionam por meio de uma chave de acesso.",
    );
    expect(result.status).toBe("duplicate");
    expect(result.method).toBe("token_overlap");
  });

  it("only flags headings that would actually be announced", () => {
    expect(findDuplicatedSpokenHeadings(plan("announce"), {
      section_1: "Arquivos indexados permitem acesso direto.",
    })).toHaveLength(1);
    expect(findDuplicatedSpokenHeadings(plan("integrate"), {
      section_1: "Arquivos indexados permitem acesso direto.",
    })).toEqual([]);
  });

  it("reduces narrative memory without reintroducing covered concepts or resolved threads", () => {
    expect(reduceNarrativeMemory(memory, {
      conceptsCovered: ["OCCURS"],
      termsDefined: ["OCCURS"],
      openThreads: ["REDEFINES"],
      resolvedThreads: ["estruturas repetitivas"],
      nextConcepts: ["OCCURS", "REDEFINES"],
      sourceRefs: ["p2-t1", "p1-t1"],
    })).toEqual({
      schemaVersion: 1,
      conceptsCovered: ["PIC", "OCCURS"],
      termsDefined: ["PIC", "OCCURS"],
      openThreads: ["REDEFINES"],
      currentGoal: "estrutura de dados",
      nextConcepts: ["REDEFINES"],
      sourceRefs: ["p1-t1", "p2-t1"],
    });
  });

  it("reports repeated formulaic openers as a frequency signal, not a hard ban", () => {
    const findings = findRepeatedFormulaicOpeners([
      "Agora vamos entender arquivos sequenciais.",
      "Agora vamos entender arquivos indexados.",
      "Outra explicação começa de forma diferente.",
      "Agora vamos entender o FILE STATUS.",
    ]);
    expect(findings).toEqual([{
      opener: "agora vamos entender",
      count: 3,
      sectionIndexes: [0, 1, 3],
    }]);
  });

  it("finds source references that are absent from the validated source set", () => {
    const invalidPlan = plan("integrate");
    invalidPlan.sections[0].sourceRefs = ["p1-t1", "missing"];
    expect(findInvalidSourceRefs(invalidPlan, new Set(["p1-t1"]))).toEqual(["missing"]);
  });

  it("fails deterministic QA when an announced heading is duplicated", () => {
    const report = buildNarrationQa({
      planId: "plan_1",
      documentSections: 1,
      plan: plan("announce"),
      sectionSpeech: { section_1: "Arquivos indexados permitem acesso direto." },
      validSourceRefs: new Set(["p1-t1"]),
    });
    expect(report.status).toBe("fail");
    expect(report.duplicatedSpokenHeadings).toBe(1);
  });

  it("returns review for repeated formulaic openings without critical findings", () => {
    const reviewPlan: NarrativePlan = {
      schemaVersion: 1,
      documentId: "doc_1",
      sections: ["1", "2", "3"].map(id => ({
        id: `section_${id}`,
        sourceRefs: [`p${id}-t1`],
        conceptIds: [`concept_${id}`],
        heading: null,
        transition: null,
        spokenChapterId: "chapter_1",
        estimatedSeconds: 30,
      })),
      spokenChapters: [{
        id: "chapter_1",
        sectionIds: ["section_1", "section_2", "section_3"],
        displayTitle: "Capítulo",
      }],
    };
    const report = buildNarrationQa({
      planId: "plan_2",
      documentSections: 3,
      plan: reviewPlan,
      sectionSpeech: {
        section_1: "Agora vamos entender o primeiro conceito.",
        section_2: "Agora vamos entender o segundo conceito.",
        section_3: "Agora vamos entender o terceiro conceito.",
      },
      validSourceRefs: new Set(["p1-t1", "p2-t1", "p3-t1"]),
    });
    expect(report.status).toBe("review");
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0].code).toBe("FORMULAIC_OPENER");
  });
});
