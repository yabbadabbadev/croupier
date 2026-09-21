import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionAuditEntry,
  DecisionEngine,
  DecisionEngineConfig,
  DecisionOutcome,
  JevProviderConfig,
  ReviewIssue,
} from "../state/types.js";
import { RuleDecisionEngine } from "./rules.js";

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

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;
export const DEFAULT_TYPESAFE_MODEL = "jev-1.13";
export const DEFAULT_TYPESAFE_API_KEY_ENV = "TYPESAFE_API_KEY";

export interface ResolvedJevProvider {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export type JevEngineFactory = (
  provider: ResolvedJevProvider
) => Promise<DecisionEngine>;

export interface CreateDecisionEngineDeps {
  createJevEngine?: JevEngineFactory;
}

export function resolveDecisionConfig(
  env: NodeJS.ProcessEnv = process.env
): DecisionEngineConfig {
  const rawThreshold = Number(env.CROUPIER_CONFIDENCE_THRESHOLD);
  const confidenceThreshold =
    Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 1
      ? rawThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD;

  return {
    engine: env.CROUPIER_DECISION_ENGINE === "jev" ? "jev" : "rule",
    confidenceThreshold,
    provider: {
      apiKeyEnv: DEFAULT_TYPESAFE_API_KEY_ENV,
      model: env.TYPESAFE_MODEL ?? DEFAULT_TYPESAFE_MODEL,
    },
  };
}

export async function createDecisionEngine(
  config: DecisionEngineConfig = resolveDecisionConfig(),
  env: NodeJS.ProcessEnv = process.env,
  deps: CreateDecisionEngineDeps = {}
): Promise<DecisionEngine> {
  if (config.engine === "rule") {
    return new RuleDecisionEngine();
  }

  const provider: JevProviderConfig = config.provider ?? {};
  const apiKeyEnv = provider.apiKeyEnv ?? DEFAULT_TYPESAFE_API_KEY_ENV;
  const apiKey = provider.apiKey ?? env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(
      `Missing TypeSafe API key. Set ${apiKeyEnv} or use CROUPIER_DECISION_ENGINE=rule.`
    );
  }

  const resolved: ResolvedJevProvider = {
    apiKey,
    model: provider.model ?? DEFAULT_TYPESAFE_MODEL,
    ...(provider.baseUrl ? { baseUrl: provider.baseUrl } : {}),
  };

  if (deps.createJevEngine) {
    return deps.createJevEngine(resolved);
  }

  const { createJevDecisionEngine } = await import("./jev-decision-engine.js");
  return createJevDecisionEngine(resolved);
}