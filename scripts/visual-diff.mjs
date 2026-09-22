#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

export function diffPngs(bufferA, bufferB, options = {}) {
  const a = PNG.sync.read(Buffer.from(bufferA));
  const b = PNG.sync.read(Buffer.from(bufferB));

  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`
    );
  }

  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: options.threshold ?? 0.1,
  });
  const totalPixels = a.width * a.height;

  return {
    diffPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
    diffPng: PNG.sync.write(diff),
  };
}

function main() {
  const [beforePath, afterPath, diffPath] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    process.stderr.write("usage: visual-diff <before.png> <after.png> [diff.png]\n");
    process.exit(2);
  }

  const result = diffPngs(readFileSync(beforePath), readFileSync(afterPath));
  if (diffPath) {
    writeFileSync(diffPath, result.diffPng);
  }

  process.stdout.write(
    JSON.stringify(
      { ratio: result.ratio, diffPixels: result.diffPixels, totalPixels: result.totalPixels, diffPath: diffPath ?? null },
      null,
      2
    )
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}