import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionAuditEntry,
  DecisionEngine,
  DecisionOutcome,
  ReviewIssue,
} from "../state/types.js";

export async function classifyReviewIssues(
  primary: DecisionEngine,
  fallback: DecisionEngine,
  inputs: ClassifySeverityInput[],
  confidenceThreshold: number
): Promise<DecisionOutcome> {
  let primaryResults: ClassifiedSeverity[] | null = null;
  try {
    primaryResults = await primary.classifyReviewIssueSeverities(inputs);
  } catch {
    primaryResults = null;
  }

  const fallbackResults = await fallback.classifyReviewIssueSeverities(inputs);

  const issues: ReviewIssue[] = [];
  const audit: DecisionAuditEntry[] = [];

  inputs.forEach((input, index) => {
    const primaryResult = primaryResults?.[index];
    const fallbackResult = fallbackResults[index];
    const usePrimary =
      primaryResult !== undefined &&
      primaryResult.confidence >= confidenceThreshold;
    const chosen = usePrimary ? primaryResult : fallbackResult;

    issues.push({ ...input.issue, severity: chosen.severity });
    audit.push({
      point: "review_issue_severity",
      issueIndex: index,
      engine: chosen.engine,
      selected: chosen.severity,
      confidence: chosen.confidence,
      usedFallback: !usePrimary,
    });
  });

  return { issues, audit };
}