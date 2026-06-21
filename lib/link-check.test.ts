import { describe, expect, test } from "vitest";
import { isDeadStatus } from "./link-check";

describe("isDeadStatus", () => {
  test("treats 404 and 410 as dead", () => {
    expect(isDeadStatus(404)).toBe(true);
    expect(isDeadStatus(410)).toBe(true);
  });

  test("treats 2xx / 3xx as alive", () => {
    for (const s of [200, 201, 204, 301, 302, 307, 308]) {
      expect(isDeadStatus(s)).toBe(false);
    }
  });

  test("treats gated/blocked/transient codes as alive (the page exists)", () => {
    // 401/403 = auth/bot wall, 405 = HEAD not allowed, 429 = rate limit,
    // 5xx = transient. None of these mean the link is dead.
    for (const s of [401, 403, 405, 429, 500, 503]) {
      expect(isDeadStatus(s)).toBe(false);
    }
  });
});
