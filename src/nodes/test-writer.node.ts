import type { PipelineNode } from "./types.js";

export const testWriterNode: PipelineNode = async () => {
  throw new Error(
    "[croupier] test-writer.node: la generación LLM (DeepSeek) de tests TDD aún no está implementada."
  );
};
