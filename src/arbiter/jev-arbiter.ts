import { VerificationResult, ArbiterEvaluation } from "../state/types.js";

export function evaluateVerificationState(
  verification: VerificationResult | null,
  retriesLeft: number
): ArbiterEvaluation {
  if (!verification) {
    return {
      action: "ESCALATE_CRITICAL_FAILURE",
      reason: "No se obtuvo resultado de ejecución de pruebas.",
      remainingRetries: retriesLeft,
    };
  }

  if (verification.passed) {
    return {
      action: "PROCEED_TO_A11Y",
      reason: "TypeScript y suite de Vitest superados con éxito.",
      remainingRetries: retriesLeft,
    };
  }

  if (retriesLeft <= 1) {
    return {
      action: "ESCALATE_LIMIT_REACHED",
      reason: `Presupuesto de reintentos agotado tras fallos: ${verification.failedTestNames.join(", ")}`,
      remainingRetries: 0,
    };
  }

  return {
    action: "RETRY_IMPLEMENTATION",
    reason: `Fallo detectado (${verification.typeCheckPassed ? "Tests" : "Tipado"}). Reintentos restantes: ${retriesLeft - 1}`,
    remainingRetries: retriesLeft - 1,
  };
}
