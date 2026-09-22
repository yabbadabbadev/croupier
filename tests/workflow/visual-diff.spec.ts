import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import { diffPngs } from "../../scripts/visual-diff.mjs";

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgb[0];
    png.data[i + 1] = rgb[1];
    png.data[i + 2] = rgb[2];
    png.data[i + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("diffPngs", () => {
  it("da ratio 0 para imágenes idénticas", () => {
    const a = solidPng(10, 10, [255, 0, 0]);
    const b = solidPng(10, 10, [255, 0, 0]);
    const result = diffPngs(a, b);
    expect(result.diffPixels).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.totalPixels).toBe(100);
  });

  it("cuenta los píxeles distintos", () => {
    const a = solidPng(10, 10, [255, 0, 0]);
    const b = solidPng(10, 10, [0, 0, 255]);
    const result = diffPngs(a, b);
    expect(result.diffPixels).toBe(100);
    expect(result.ratio).toBe(1);
    expect(result.diffPng.length).toBeGreaterThan(0);
  });

  it("lanza si las dimensiones difieren", () => {
    const a = solidPng(10, 10, [0, 0, 0]);
    const b = solidPng(20, 10, [0, 0, 0]);
    expect(() => diffPngs(a, b)).toThrow("dimensions");
  });
});