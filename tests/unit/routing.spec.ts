import { describe, it, expect } from "vitest";
import { END } from "@langchain/langgraph";
import {
  routeAfterArbiter,
  routeAfterA11y,
  routeAfterReview,
} from "../../src/graph/routing.js";
import { buildPipelineGraph } from "../../src/graph/builder.js";
import type { PipelineState } from "../../src/state/pipeline-state.js";
import type { PipelineNode } from "../../src/nodes/types.js";
import type {
  ArbiterAction,
  ArbiterEvaluation,
  VerificationResult,
} from "../../src/state/types.js";

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    requirement: "Implementar un botón accesible",
    spec: null,
    targetFiles: [],
    testFiles: [],
    verification: null,
    arbiterEvaluation: null,
    a11yPassed: false,
    a11yIssues: [],
    reviewApproved: false,
    reviewIssues: [],
    decisionAudit: [],
    retriesLeft: 3,
    logs: [],
    ...overrides,
  };
}

function evaluation(action: ArbiterAction): ArbiterEvaluation {
  return { action, reason: "test-fixture", remainingRetries: 3 };
}

const passingVerification: VerificationResult = {
  passed: true,
  typeCheckPassed: true,
  unitTestsPassed: true,
  output: "All green",
  failedTestNames: [],
};

const failingVerification: VerificationResult = {
  passed: false,
  typeCheckPassed: false,
  unitTestsPassed: false,
  output: "TS2322: Type error",
  failedTestNames: ["rendersButton"],
};

interface StubConfig {
  verification: VerificationResult;
  a11yPassed: boolean;
  reviewApproved: boolean;
  onImplement?: () => void;
}

function stubNodes(config: StubConfig): {
  orchestrator: PipelineNode;
  testWriter: PipelineNode;
  implementer: PipelineNode;
  verifier: PipelineNode;
  a11yVisual: PipelineNode;
  reviewer: PipelineNode;
} {
  return {
    orchestrator: () => ({
      spec: "# Spec atómica",
      targetFiles: ["src/button.tsx"],
      testFiles: ["tests/button.spec.tsx"],
    }),
    testWriter: () => ({ logs: ["test-writer: red phase"] }),
    implementer: () => {
      config.onImplement?.();
      return { logs: ["implementer: wrote production code"] };
    },
    verifier: () => ({ verification: config.verification }),
    a11yVisual: () => ({
      a11yPassed: config.a11yPassed,
      a11yIssues: config.a11yPassed ? [] : ["contrast ratio below 4.5:1"],
    }),
    reviewer: () => ({
      reviewApproved: config.reviewApproved,
      reviewIssues: [],
    }),
  };
}

describe("Routing: routeAfterArbiter", () => {
  it("envía a inspección a11y cuando el árbitro aprueba la verificación", () => {
    const state = makeState({
      arbiterEvaluation: evaluation("PROCEED_TO_A11Y"),
    });
    expect(routeAfterArbiter(state)).toBe("a11y_visual");
  });

  it("retorna al implementador cuando el árbitro ordena reintentar", () => {
    const state = makeState({
      arbiterEvaluation: evaluation("RETRY_IMPLEMENTATION"),
    });
    expect(routeAfterArbiter(state)).toBe("implementer");
  });

  it("corta el grafo cuando se agota el límite de reintentos", () => {
    const state = makeState({
      arbiterEvaluation: evaluation("ESCALATE_LIMIT_REACHED"),
    });
    expect(routeAfterArbiter(state)).toBe(END);
  });

  it("corta el grafo ante un fallo crítico", () => {
    const state = makeState({
      arbiterEvaluation: evaluation("ESCALATE_CRITICAL_FAILURE"),
    });
    expect(routeAfterArbiter(state)).toBe(END);
  });

  it("corta el grafo si no existe evaluación del árbitro", () => {
    const state = makeState({ arbiterEvaluation: null });
    expect(routeAfterArbiter(state)).toBe(END);
  });
});

describe("Routing: routeAfterA11y", () => {
  it("continúa hacia la revisión de código cuando a11y pasa", () => {
    const state = makeState({ a11yPassed: true, retriesLeft: 3 });
    expect(routeAfterA11y(state)).toBe("code_review");
  });

  it("retorna al implementador cuando a11y falla y quedan reintentos", () => {
    const state = makeState({ a11yPassed: false, retriesLeft: 2 });
    expect(routeAfterA11y(state)).toBe("implementer");
  });

  it("corta el grafo cuando a11y falla y no quedan reintentos", () => {
    const state = makeState({ a11yPassed: false, retriesLeft: 0 });
    expect(routeAfterA11y(state)).toBe(END);
  });
});

describe("Routing: routeAfterReview", () => {
  it("finaliza el pipeline cuando la revisión es aprobada", () => {
    const state = makeState({ reviewApproved: true, retriesLeft: 3 });
    expect(routeAfterReview(state)).toBe(END);
  });

  it("retorna al implementador cuando la revisión es rechazada y quedan reintentos", () => {
    const state = makeState({ reviewApproved: false, retriesLeft: 2 });
    expect(routeAfterReview(state)).toBe("implementer");
  });

  it("corta el grafo cuando la revisión es rechazada y no quedan reintentos", () => {
    const state = makeState({ reviewApproved: false, retriesLeft: 0 });
    expect(routeAfterReview(state)).toBe(END);
  });
});

describe("Graph topology: end-to-end transitions with stubbed nodes", () => {
  it("recorre el camino feliz completo hasta END", async () => {
    const graph = buildPipelineGraph(
      stubNodes({
        verification: passingVerification,
        a11yPassed: true,
        reviewApproved: true,
      })
    );

    const result = await graph.invoke({
      requirement: "Implementar un botón accesible",
    });

    expect(result.arbiterEvaluation?.action).toBe("PROCEED_TO_A11Y");
    expect(result.a11yPassed).toBe(true);
    expect(result.reviewApproved).toBe(true);
    expect(result.targetFiles).toEqual(["src/button.tsx"]);
  });

  it("corta por circuit breaker tras agotar los 3 reintentos de verificación", async () => {
    let implementCalls = 0;
    const graph = buildPipelineGraph(
      stubNodes({
        verification: failingVerification,
        a11yPassed: false,
        reviewApproved: false,
        onImplement: () => {
          implementCalls += 1;
        },
      })
    );

    const result = await graph.invoke({
      requirement: "Implementar un botón accesible",
    });

    expect(result.arbiterEvaluation?.action).toBe("ESCALATE_LIMIT_REACHED");
    expect(result.retriesLeft).toBe(0);
    expect(implementCalls).toBe(3);
  });

  it("corta por circuit breaker en a11y cuando el presupuesto es cero", async () => {
    const graph = buildPipelineGraph(
      stubNodes({
        verification: passingVerification,
        a11yPassed: false,
        reviewApproved: false,
      })
    );

    const result = await graph.invoke({
      requirement: "Implementar un botón accesible",
      retriesLeft: 0,
    });

    expect(result.arbiterEvaluation?.action).toBe("PROCEED_TO_A11Y");
    expect(result.a11yPassed).toBe(false);
    expect(result.reviewApproved).toBe(false);
  });

  it("corta por circuit breaker en revisión cuando el presupuesto es cero", async () => {
    const graph = buildPipelineGraph(
      stubNodes({
        verification: passingVerification,
        a11yPassed: true,
        reviewApproved: false,
      })
    );

    const result = await graph.invoke({
      requirement: "Implementar un botón accesible",
      retriesLeft: 0,
    });

    expect(result.a11yPassed).toBe(true);
    expect(result.reviewApproved).toBe(false);
  });
});
