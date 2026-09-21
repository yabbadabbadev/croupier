import { describe, it, expect } from "vitest";
import { deriveReviewApproved } from "../../src/arbiter/review-policy.js";
import type { ReviewIssue } from "../../src/state/types.js";

function issue(severity: "blocker" | "warning"): ReviewIssue {
  return { file: "src/x.ts", severity, description: "detalle" };
}

describe("deriveReviewApproved", () => {
  it("aprueba cuando no hay issues", () => {
    expect(deriveReviewApproved([])).toBe(true);
  });

  it("aprueba cuando solo hay warnings", () => {
    expect(deriveReviewApproved([issue("warning"), issue("warning")])).toBe(true);
  });

  it("rechaza cuando hay al menos un blocker", () => {
    expect(deriveReviewApproved([issue("warning"), issue("blocker")])).toBe(false);
  });
});