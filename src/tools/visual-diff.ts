import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { tool, type ToolDefinition } from "@opencode-ai/plugin";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export interface DiffResult {
  diffPixels: number;
  totalPixels: number;
  ratio: number;
  diffPng: Buffer;
}

export function diffPngs(bufferA: Uint8Array, bufferB: Uint8Array, threshold = 0.1): DiffResult {
  const a = PNG.sync.read(Buffer.from(bufferA));
  const b = PNG.sync.read(Buffer.from(bufferB));
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold });
  const totalPixels = a.width * a.height;
  return {
    diffPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
    diffPng: PNG.sync.write(diff),
  };
}

export const visualDiffTool: ToolDefinition = tool({
  description: "Compara dos PNG (before/after) y devuelve el ratio de píxeles distintos; opcionalmente escribe la imagen de diff.",
  args: {
    before: tool.schema.string().describe("Ruta del PNG before, relativa al proyecto"),
    after: tool.schema.string().describe("Ruta del PNG after, relativa al proyecto"),
    diff: tool.schema.string().optional().describe("Ruta donde escribir la imagen de diff"),
  },
  async execute(args, context) {
    const before = resolve(context.directory, args.before);
    const after = resolve(context.directory, args.after);
    const result = diffPngs(readFileSync(before), readFileSync(after));
    if (args.diff) writeFileSync(resolve(context.directory, args.diff), result.diffPng);
    return JSON.stringify(
      {
        ratio: result.ratio,
        diffPixels: result.diffPixels,
        totalPixels: result.totalPixels,
        diffPath: args.diff ?? null,
      },
      null,
      2
    );
  },
});