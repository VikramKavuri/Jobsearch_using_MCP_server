import { describe, expect, test } from "vitest";
import { normalizeProfile, ProfileValidationError } from "./profile";

describe("normalizeProfile", () => {
  test("parses a comma-separated skills string into a lowercased, de-duped list", () => {
    const p = normalizeProfile({
      name: "Ada",
      skills: "Python, SQL , python,  TypeScript",
    });
    expect(p.skills).toEqual(["python", "sql", "typescript"]);
  });

  test("accepts a skills array and de-dupes preserving first-seen order", () => {
    const p = normalizeProfile({
      title: "Engineer",
      skills: ["React", "react", "Node", "REACT"],
    });
    expect(p.skills).toEqual(["react", "node"]);
  });

  test("coerces experienceYears: '5' -> 5, negatives -> 0, junk -> 0", () => {
    expect(normalizeProfile({ name: "A", experienceYears: "5" }).experienceYears).toBe(5);
    expect(normalizeProfile({ name: "A", experienceYears: -3 }).experienceYears).toBe(0);
    expect(normalizeProfile({ name: "A", experienceYears: "abc" }).experienceYears).toBe(0);
  });

  test("trims surrounding whitespace on text fields", () => {
    const p = normalizeProfile({
      name: "  Ada Lovelace  ",
      title: "  Analyst ",
      summary: " builds things ",
      location: " London ",
      education: " Maths ",
    });
    expect(p.name).toBe("Ada Lovelace");
    expect(p.title).toBe("Analyst");
    expect(p.summary).toBe("builds things");
    expect(p.location).toBe("London");
    expect(p.education).toBe("Maths");
  });

  test("throws when name, title and skills are all empty", () => {
    expect(() => normalizeProfile({ summary: "hi" })).toThrow(ProfileValidationError);
  });

  test("throws on a malformed email when one is supplied", () => {
    expect(() => normalizeProfile({ name: "A", email: "not-an-email" })).toThrow(
      ProfileValidationError,
    );
  });

  test("keeps a valid email and lowercases it", () => {
    const p = normalizeProfile({ name: "A", email: "Ada@Example.COM" });
    expect(p.email).toBe("ada@example.com");
  });

  test("omits email entirely when not provided", () => {
    const p = normalizeProfile({ name: "A" });
    expect(p.email).toBeUndefined();
  });
});
