import { END } from "@langchain/langgraph";
import { PipelineState } from "../state/pipeline-state.js";

export function routeAfterArbiter(
  state: PipelineState
): "a11y_visual" | "implementer" | typeof END {
  const evaluation = state.arbiterEvaluation;
  if (!evaluation) return END;

  switch (evaluation.action) {
    case "PROCEED_TO_A11Y":
      return "a11y_visual";
    case "RETRY_IMPLEMENTATION":
      return "implementer";
    case "ESCALATE_LIMIT_REACHED":
    case "ESCALATE_CRITICAL_FAILURE":
    default:
      return END;
  }
}

export function routeAfterA11y(
  state: PipelineState
): "code_review" | "implementer" | typeof END {
  if (state.a11yPassed) {
    return "code_review";
  }
  if (state.retriesLeft <= 0) {
    return END;
  }
  return "implementer";
}

export function routeAfterReview(
  state: PipelineState
): typeof END | "implementer" {
  if (state.reviewApproved || state.retriesLeft <= 0) {
    return END;
  }
  return "implementer";
}
