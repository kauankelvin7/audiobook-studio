import type { NarrativePlannerPort, PlannerInput } from "../narrative_planner_port";

export class FixtureNarrativePlanner implements NarrativePlannerPort {
  readonly calls: PlannerInput[] = [];

  constructor(private readonly output: unknown) {}

  async propose(input: PlannerInput): Promise<unknown> {
    this.calls.push(input);
    return structuredClone(this.output);
  }
}
