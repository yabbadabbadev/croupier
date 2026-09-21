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

export interface ClassifySeverityInput {
  issue: ReviewIssue;
  spec: string | null;
  targetFiles: string[];
}

export interface ClassifiedSeverity {
  severity: Severity;
  confidence: number;
  engine: "rule" | "jev";
}

export interface DecisionEngine {
  classifyReviewIssueSeverities(
    inputs: ClassifySeverityInput[]
  ): Promise<ClassifiedSeverity[]>;
}

export interface DecisionAuditEntry {
  point: "review_issue_severity";
  issueIndex: number;
  engine: "rule" | "jev";
  selected: Severity;
  confidence: number;
  usedFallback: boolean;
}

export interface DecisionOutcome {
  issues: ReviewIssue[];
  audit: DecisionAuditEntry[];
}

export interface JevProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  apiKeyEnv?: string;
  model?: string;
}

export interface DecisionEngineConfig {
  engine: "rule" | "jev";
  confidenceThreshold: number;
  provider?: JevProviderConfig;
}
