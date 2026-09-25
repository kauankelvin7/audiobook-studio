import { contentModelSchema, semanticOutlineSchema, type ContentModel, type SemanticOutline } from "../schemas/content_model";
import { narrativePlanSchema, type NarrativePlan } from "../schemas/narrative";
import { validateNarrativePlan } from "./rust_narrative_pipeline";

export type PlannerInput = {
  contentModel: ContentModel;
  semanticOutline: SemanticOutline;
};

export interface NarrativePlannerPort {
  propose(input: PlannerInput): Promise<unknown>;
}

export type NarrativePlanCandidate = {
  kind: "candidate";
  qa: "pending";
  plan: NarrativePlan;
};

export type NarrativePlannerErrorCode = "INVALID_CONTEXT" | "PLANNER_FAILED" | "INVALID_OUTPUT" | "CORE_REJECTED";

export class NarrativePlannerError extends Error {
  constructor(public readonly code: NarrativePlannerErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NarrativePlannerError";
  }
}

export async function proposeNarrativePlan(
  port: NarrativePlannerPort,
  contentModel: unknown,
  semanticOutline: unknown,
): Promise<NarrativePlanCandidate> {
  let context: PlannerInput;
  try {
    context = {
      contentModel: contentModelSchema.parse(contentModel),
      semanticOutline: semanticOutlineSchema.parse(semanticOutline),
    };
  } catch (error) {
    throw new NarrativePlannerError("INVALID_CONTEXT", "O contexto narrativo não passou na validação de fronteira.", { cause: error });
  }

  let candidate: unknown;
  try {
    candidate = await port.propose(context);
  } catch (error) {
    throw new NarrativePlannerError("PLANNER_FAILED", "O planner não produziu um plano narrativo.", { cause: error });
  }

  let plan: NarrativePlan;
  try {
    plan = narrativePlanSchema.parse(candidate);
  } catch (error) {
    throw new NarrativePlannerError("INVALID_OUTPUT", "O planner retornou um plano fora do contrato.", { cause: error });
  }

  try {
    await validateNarrativePlan(plan, context.contentModel, context.semanticOutline);
  } catch (error) {
    throw new NarrativePlannerError("CORE_REJECTED", "O núcleo Rust rejeitou o plano narrativo.", { cause: error });
  }
  return { kind: "candidate", qa: "pending", plan };
}
