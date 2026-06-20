import { describe, expect, test } from "vitest";
import {
  getSampleJobs,
  stripHtml,
  dedupeJobs,
  mapRemotiveJob,
} from "./jobs-source";
import type { Job } from "./types";

describe("getSampleJobs", () => {
  test("returns a non-empty list of well-formed jobs", () => {
    const jobs = getSampleJobs();
    expect(jobs.length).toBeGreaterThan(5);
    for (const j of jobs) {
      expect(j.id).toBeTruthy();
      expect(j.title).toBeTruthy();
      expect(j.company).toBeTruthy();
      expect(Array.isArray(j.tags)).toBe(true);
      expect(typeof j.remote).toBe("boolean");
    }
  });

  test("has no duplicate ids", () => {
    const ids = getSampleJobs().map((j) => j.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("stripHtml", () => {
  test("removes tags and collapses whitespace", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>\n\n<p>Again</p>")).toBe(
      "Hello world Again",
    );
  });

  test("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;3 &nbsp;ok")).toBe("Tom & Jerry <3 ok");
  });
});

describe("dedupeJobs", () => {
  const base = (over: Partial<Job>): Job => ({
    id: "x",
    title: "Engineer",
    company: "Acme",
    location: "Remote",
    remote: true,
    type: "Full-time",
    tags: [],
    description: "",
    url: "https://e.com",
    ...over,
  });

  test("drops entries with a duplicate id", () => {
    const jobs = [base({ id: "1" }), base({ id: "1", title: "Other" })];
    expect(dedupeJobs(jobs)).toHaveLength(1);
  });

  test("drops entries with the same title + company (case-insensitive)", () => {
    const jobs = [
      base({ id: "1", title: "Engineer", company: "Acme" }),
      base({ id: "2", title: "ENGINEER", company: "acme" }),
    ];
    expect(dedupeJobs(jobs)).toHaveLength(1);
  });

  test("keeps genuinely distinct jobs", () => {
    const jobs = [
      base({ id: "1", title: "Engineer", company: "Acme" }),
      base({ id: "2", title: "Designer", company: "Acme" }),
    ];
    expect(dedupeJobs(jobs)).toHaveLength(2);
  });
});

describe("mapRemotiveJob", () => {
  test("maps the Remotive shape into our Job type", () => {
    const job = mapRemotiveJob({
      id: 42,
      title: "Backend Developer",
      company_name: "RemoteCo",
      candidate_required_location: "Worldwide",
      job_type: "full_time",
      tags: ["python", "django"],
      description: "<p>Build <b>APIs</b></p>",
      url: "https://remotive.com/job/42",
      salary: "$120k",
      publication_date: "2026-06-01T00:00:00",
    });

    expect(job.id).toBe("remotive-42");
    expect(job.title).toBe("Backend Developer");
    expect(job.company).toBe("RemoteCo");
    expect(job.remote).toBe(true);
    expect(job.tags).toEqual(["python", "django"]);
    expect(job.description).toBe("Build APIs");
    expect(job.url).toBe("https://remotive.com/job/42");
  });
});
