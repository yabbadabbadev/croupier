import { describe, it, expect } from "vitest";
import { evaluateVerificationState } from "../../src/arbiter/jev-arbiter.js";
import { VerificationResult } from "../../src/state/types.js";

describe("Jev Arbiter: Deterministic Decision Engine", () => {
  it("avanza a a11y cuando el resultado es positivo", () => {
    const verification: VerificationResult = {
      passed: true,
      typeCheckPassed: true,
      unitTestsPassed: true,
      output: "All tests green",
      failedTestNames: [],
    };

    const result = evaluateVerificationState(verification, 3);
    expect(result.action).toBe("PROCEED_TO_A11Y");
    expect(result.remainingRetries).toBe(3);
  });

  it("ordena reintentar implementación decrementando el contador si quedan intentos", () => {
    const verification: VerificationResult = {
      passed: false,
      typeCheckPassed: true,
      unitTestsPassed: false,
      output: "AssertionError: expected true to be false",
      failedTestNames: ["shouldToggleState"],
    };

    const result = evaluateVerificationState(verification, 3);
    expect(result.action).toBe("RETRY_IMPLEMENTATION");
    expect(result.remainingRetries).toBe(2);
  });

  it("activa el circuit breaker de escalado si retriesLeft llega a 1 y falla", () => {
    const verification: VerificationResult = {
      passed: false,
      typeCheckPassed: false,
      unitTestsPassed: false,
      output: "TS2322: Type 'string' is not assignable to type 'number'",
      failedTestNames: [],
    };

    const result = evaluateVerificationState(verification, 1);
    expect(result.action).toBe("ESCALATE_LIMIT_REACHED");
    expect(result.remainingRetries).toBe(0);
  });

  it("escala por fallo crítico cuando no existe resultado de verificación", () => {
    const result = evaluateVerificationState(null, 3);
    expect(result.action).toBe("ESCALATE_CRITICAL_FAILURE");
    expect(result.remainingRetries).toBe(3);
  });

  it("ordena reintentar ante fallo de compilación indicando la causa de tipado", () => {
    const verification: VerificationResult = {
      passed: false,
      typeCheckPassed: false,
      unitTestsPassed: true,
      output: "TS2322: Type 'string' is not assignable to type 'number'",
      failedTestNames: [],
    };

    const result = evaluateVerificationState(verification, 3);
    expect(result.action).toBe("RETRY_IMPLEMENTATION");
    expect(result.remainingRetries).toBe(2);
    expect(result.reason).toContain("Tipado");
  });

  it("decrementa el presupuesto exactamente una unidad por ciclo de fallo", () => {
    const verification: VerificationResult = {
      passed: false,
      typeCheckPassed: true,
      unitTestsPassed: false,
      output: "1 failing",
      failedTestNames: ["rendersAccessibleButton"],
    };

    const result = evaluateVerificationState(verification, 2);
    expect(result.action).toBe("RETRY_IMPLEMENTATION");
    expect(result.remainingRetries).toBe(1);
  });

  it("activa el circuit breaker también cuando el presupuesto ya es cero", () => {
    const verification: VerificationResult = {
      passed: false,
      typeCheckPassed: false,
      unitTestsPassed: false,
      output: "boom",
      failedTestNames: [],
    };

    const result = evaluateVerificationState(verification, 0);
    expect(result.action).toBe("ESCALATE_LIMIT_REACHED");
    expect(result.remainingRetries).toBe(0);
  });

  it("permite avanzar con el último reintento disponible si las pruebas pasan", () => {
    const verification: VerificationResult = {
      passed: true,
      typeCheckPassed: true,
      unitTestsPassed: true,
      output: "ok",
      failedTestNames: [],
    };

    const result = evaluateVerificationState(verification, 1);
    expect(result.action).toBe("PROCEED_TO_A11Y");
    expect(result.remainingRetries).toBe(1);
  });
});
