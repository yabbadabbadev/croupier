import { Annotation } from "@langchain/langgraph";
import { ReviewIssue, VerificationResult, ArbiterEvaluation } from "./types.js";

export const PipelineAnnotation = Annotation.Root({
  requirement: Annotation<string>(),
  spec: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  targetFiles: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  testFiles: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  verification: Annotation<VerificationResult | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  arbiterEvaluation: Annotation<ArbiterEvaluation | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  a11yPassed: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  a11yIssues: Annotation<string[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  reviewApproved: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  reviewIssues: Annotation<ReviewIssue[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  retriesLeft: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 3,
  }),
  logs: Annotation<string[]>({
    reducer: (curr, next) => curr.concat(next),
    default: () => [],
  }),
});

export type PipelineState = typeof PipelineAnnotation.State;
