export type Severity = "blocker" | "warning";

export interface ReviewIssue {
  file: string;
  line?: number;
  severity: Severity;
  description: string;
}

export interface VerificationResult {
  passed: boolean;
  typeCheckPassed: boolean;
  unitTestsPassed: boolean;
  output: string;
  failedTestNames: string[];
}

export type ArbiterAction =
  | "PROCEED_TO_A11Y"
  | "RETRY_IMPLEMENTATION"
  | "ESCALATE_LIMIT_REACHED"
  | "ESCALATE_CRITICAL_FAILURE";

export interface ArbiterEvaluation {
  action: ArbiterAction;
  reason: string;
  remainingRetries: number;
}
