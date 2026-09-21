import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionEngine,
} from "../state/types.js";

const CRITICAL_PATTERNS: RegExp[] = [
  /`any`/i,
  /\bany type\b/i,
  /\bno-?any\b/i,
  /a11y/i,
  /wcag/i,
  /accessib/i,
  /accesib/i,
  /security/i,
  /seguridad/i,
  /vulnerab/i,
  /type[- ]?safety/i,
  /tipado/i,
];

function isCritical(description: string): boolean {
  return CRITICAL_PATTERNS.some((pattern) => pattern.test(description));
}

export class RuleDecisionEngine implements DecisionEngine {
  async classifyReviewIssueSeverities(
    inputs: ClassifySeverityInput[]
  ): Promise<ClassifiedSeverity[]> {
    return inputs.map((input) => ({
      severity:
        input.issue.severity === "blocker" || isCritical(input.issue.description)
          ? "blocker"
          : "warning",
      confidence: 1,
      engine: "rule",
    }));
  }
}