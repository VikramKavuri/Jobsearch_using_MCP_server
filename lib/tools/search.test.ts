import { describe, expect, test } from "vitest";
import { searchJobs } from "./search";
import type { Job } from "../types";

const jobs: Job[] = [
  {
    id: "1",
    title: "Senior Python Data Engineer",
    company: "DataCo",
    location: "Remote",
    remote: true,
    type: "Full-time",
    tags: ["python", "spark", "airflow", "sql"],
    description: "Build data pipelines with Python, Spark and Airflow.",
    url: "https://example.com/1",
  },
  {
    id: "2",
    title: "Frontend React Developer",
    company: "WebCo",
    location: "New York, NY",
    remote: false,
    type: "Full-time",
    tags: ["react", "css", "typescript"],
    description: "Build delightful UIs in React and TypeScript.",
    url: "https://example.com/2",
  },
  {
    id: "3",
    title: "Marketing Manager",
    company: "AdCo",
    location: "Los Angeles, CA",
    remote: false,
    type: "Full-time",
    tags: ["seo", "content"],
    description: "Lead marketing campaigns and content strategy.",
    url: "https://example.com/3",
  },
];

const profile = {
  title: "Data Engineer",
  skills: ["python", "spark", "sql"],
};

describe("searchJobs", () => {
  test("ranks the clearly-matching job first", () => {
    const results = searchJobs({ query: "data engineer python", profile, jobs });
    expect(results[0].id).toBe("1");
  });

  test("every fit_score is an integer within [0, 100]", () => {
    const results = searchJobs({ query: "python", profile, jobs });
    for (const r of results) {
      expect(Number.isInteger(r.fit_score)).toBe(true);
      expect(r.fit_score).toBeGreaterThanOrEqual(0);
      expect(r.fit_score).toBeLessThanOrEqual(100);
    }
  });

  test("a full skill + text match scores highly", () => {
    const results = searchJobs({ query: "data engineer python spark", profile, jobs });
    const top = results.find((r) => r.id === "1")!;
    expect(top.fit_score).toBeGreaterThanOrEqual(80);
  });

  test("match_reasons cites a matched profile skill", () => {
    const results = searchJobs({ query: "python", profile, jobs });
    const top = results.find((r) => r.id === "1")!;
    expect(top.match_reasons.join(" ").toLowerCase()).toContain("python");
  });

  test("remoteOnly filters out on-site roles", () => {
    const results = searchJobs({ query: "developer", profile, jobs, remoteOnly: true });
    expect(results.every((r) => r.remote)).toBe(true);
    expect(results.map((r) => r.id)).toContain("1");
    expect(results.map((r) => r.id)).not.toContain("2");
  });

  test("limit caps the number of results", () => {
    const results = searchJobs({ query: "engineer", profile, jobs, limit: 1 });
    expect(results).toHaveLength(1);
  });

  test("returns an empty array when there are no jobs", () => {
    expect(searchJobs({ query: "anything", profile, jobs: [] })).toEqual([]);
  });

  test("is deterministic for identical inputs", () => {
    const a = searchJobs({ query: "python data", profile, jobs });
    const b = searchJobs({ query: "python data", profile, jobs });
    expect(a).toEqual(b);
  });
});
