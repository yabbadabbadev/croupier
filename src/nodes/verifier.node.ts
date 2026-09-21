import type { PipelineNode } from "./types.js";

export const verifierNode: PipelineNode = async () => {
  throw new Error(
    "[croupier] verifier.node: el wrapper determinista CLI (tsc + vitest) aún no está implementado."
  );
};
