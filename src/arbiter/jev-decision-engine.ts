import type {
  ClassifiedSeverity,
  ClassifySeverityInput,
  DecisionEngine,
  ReviewIssue,
  Severity,
} from "../state/types.js";

export interface SystemOneAnswer {
  choice: string;
  confidence: number;
}

export interface SystemOneClient {
  systemOne(req: { state: unknown; questions: unknown }): Promise<{
    answers: Record<string, SystemOneAnswer>;
  }>;
}

export interface JevEngineOptions {
  client: SystemOneClient;
  model: string;
}

interface JevState {
  spec: string | null;
  targetFiles: string[];
  issues: ReviewIssue[];
}

function buildQuestions(count: number): Record<string, unknown> {
  const questions: Record<string, unknown> = {};
  for (let i = 0; i < count; i += 1) {
    questions[`issue_${i}`] = {
      type: "choice",
      instructions: `Classify the severity of \`issues[${i}]\` for the change described by \`spec\`.`,
      criteria: {
        blocker: {
          what: "breaks correctness, type-safety, accessibility or acceptance of `spec`",
          not_for: "style, naming or refactor suggestions",
          examples: ["uncovered branch in a test", "WCAG failure", "use of `any`"],
        },
        warning: {
          what: "improvement that does not block acceptance",
          not_for: "bugs, a11y failures or type-safety holes",
          examples: ["unclear name", "minor duplication"],
        },
      },
    };
  }
  return questions;
}

export class JevDecisionEngine implements DecisionEngine {
  private readonly client: SystemOneClient;
  private readonly model: string;

  constructor(options: JevEngineOptions) {
    this.client = options.client;
    this.model = options.model;
  }

  async classifyReviewIssueSeverities(
    inputs: ClassifySeverityInput[]
  ): Promise<ClassifiedSeverity[]> {
    if (inputs.length === 0) {
      return [];
    }

    const state: JevState = {
      spec: inputs[0].spec,
      targetFiles: inputs[0].targetFiles,
      issues: inputs.map((input) => input.issue),
    };

    const response = await this.client.systemOne({
      state,
      questions: buildQuestions(inputs.length),
    });

    return inputs.map((_, index) => {
      const answer = response.answers[`issue_${index}`];
      if (!answer) {
        throw new Error(`Jev response missing answer for issue_${index}`);
      }
      const severity: Severity = answer.choice === "blocker" ? "blocker" : "warning";
      return { severity, confidence: answer.confidence, engine: "jev" };
    });
  }
}

export async function createJevDecisionEngine(config: {
  apiKey: string;
  model: string;
  baseUrl?: string;
}): Promise<DecisionEngine> {
  const sdk = await import("@typesafe-ai/sdk");
  const client = new sdk.TypeSafeClient({
    apiKey: config.apiKey,
    defaultModel: config.model,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });

  const wrapped: SystemOneClient = {
    systemOne: async (req) => {
      const result = await client.systemOne(
        req as unknown as Parameters<typeof client.systemOne>[0]
      );
      return { answers: result.answers as Record<string, SystemOneAnswer> };
    },
  };

  return new JevDecisionEngine({ client: wrapped, model: config.model });
}