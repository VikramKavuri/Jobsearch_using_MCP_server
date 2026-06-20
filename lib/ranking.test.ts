import { describe, expect, test } from "vitest";
import { tokenize, rankByCosine } from "./ranking";

describe("tokenize", () => {
  test("lowercases and splits on punctuation, preserving + and #", () => {
    expect(tokenize("Node.js, C++ and C# — Great!")).toEqual([
      "node",
      "js",
      "c++",
      "and",
      "c#",
      "great",
    ]);
  });

  test("returns an empty array for empty or symbol-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   —  !! ")).toEqual([]);
  });
});

describe("rankByCosine", () => {
  test("scores a doc sharing query terms higher than an unrelated doc", () => {
    const docs = [
      "python data engineer spark airflow",
      "frontend react designer figma css",
    ];
    const scores = rankByCosine("python spark data pipelines", docs);
    expect(scores[0]).toBeGreaterThan(scores[1]);
  });

  test("returns ~1 for an exact match and ~0 for no overlap", () => {
    const docs = ["alpha beta gamma", "delta epsilon"];
    const scores = rankByCosine("alpha beta gamma", docs);
    expect(scores[0]).toBeCloseTo(1, 5);
    expect(scores[1]).toBeCloseTo(0, 5);
  });

  test("all scores lie within [0, 1]", () => {
    const docs = ["one two three", "two three four", "five six"];
    const scores = rankByCosine("two three", docs);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  test("is deterministic across runs", () => {
    const docs = ["a b c", "b c d", "c d e"];
    const a = rankByCosine("b c", docs);
    const b = rankByCosine("b c", docs);
    expect(a).toEqual(b);
  });
});
