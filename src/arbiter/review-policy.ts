import type { ReviewIssue } from "../state/types.js";

export function deriveReviewApproved(issues: ReviewIssue[]): boolean {
  return !issues.some((issue) => issue.severity === "blocker");
}