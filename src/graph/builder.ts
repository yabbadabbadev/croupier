import { END, START, StateGraph } from "@langchain/langgraph";
import { PipelineAnnotation } from "../state/pipeline-state.js";
import { evaluateVerificationState } from "../arbiter/jev-arbiter.js";
import type { PipelineNode, PipelineNodeOverrides } from "../nodes/types.js";
import { orchestratorNode } from "../nodes/orchestrator.node.js";
import { testWriterNode } from "../nodes/test-writer.node.js";
import { implementerNode } from "../nodes/implementer.node.js";
import { verifierNode } from "../nodes/verifier.node.js";
import { a11yVisualNode } from "../nodes/a11y-visual.node.js";
import { reviewerNode } from "../nodes/reviewer.node.js";
import {
  routeAfterArbiter,
  routeAfterA11y,
  routeAfterReview,
} from "./routing.js";

export const arbiterNode: PipelineNode = (state) => {
  const arbiterEvaluation = evaluateVerificationState(
    state.verification,
    state.retriesLeft
  );
  return {
    arbiterEvaluation,
    retriesLeft: arbiterEvaluation.remainingRetries,
  };
};

export function buildPipelineGraph(overrides: PipelineNodeOverrides = {}) {
  const nodes = {
    orchestrator: overrides.orchestrator ?? orchestratorNode,
    test_writer: overrides.testWriter ?? testWriterNode,
    implementer: overrides.implementer ?? implementerNode,
    verifier: overrides.verifier ?? verifierNode,
    a11y_visual: overrides.a11yVisual ?? a11yVisualNode,
    code_review: overrides.reviewer ?? reviewerNode,
  };

  return new StateGraph(PipelineAnnotation)
    .addNode("orchestrator", nodes.orchestrator)
    .addNode("test_writer", nodes.test_writer)
    .addNode("implementer", nodes.implementer)
    .addNode("verifier", nodes.verifier)
    .addNode("arbiter", arbiterNode)
    .addNode("a11y_visual", nodes.a11y_visual)
    .addNode("code_review", nodes.code_review)
    .addEdge(START, "orchestrator")
    .addEdge("orchestrator", "test_writer")
    .addEdge("test_writer", "implementer")
    .addEdge("implementer", "verifier")
    .addEdge("verifier", "arbiter")
    .addConditionalEdges("arbiter", routeAfterArbiter, {
      a11y_visual: "a11y_visual",
      implementer: "implementer",
      [END]: END,
    })
    .addConditionalEdges("a11y_visual", routeAfterA11y, {
      code_review: "code_review",
      implementer: "implementer",
      [END]: END,
    })
    .addConditionalEdges("code_review", routeAfterReview, {
      implementer: "implementer",
      [END]: END,
    })
    .compile();
}
