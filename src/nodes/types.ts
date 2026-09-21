import type { PipelineState } from "../state/pipeline-state.js";

export type PipelineNodeResult =
  | Partial<PipelineState>
  | Promise<Partial<PipelineState>>;

export type PipelineNode = (state: PipelineState) => PipelineNodeResult;

export interface PipelineNodeOverrides {
  orchestrator?: PipelineNode;
  testWriter?: PipelineNode;
  implementer?: PipelineNode;
  verifier?: PipelineNode;
  a11yVisual?: PipelineNode;
  reviewer?: PipelineNode;
}
