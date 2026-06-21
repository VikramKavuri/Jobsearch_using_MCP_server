import { describe, expect, test } from "vitest";
import {
  getSampleJobs,
  stripHtml,
  dedupeJobs,
  mapRemotiveJob,
  mapMuseJob,
  mapArbeitnowJob,
  mapRemoteOkJob,
  mapJobicyJob,
  jobicyGeo,
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

  test('tags every sample job with source "Sample"', () => {
    expect(getSampleJobs().every((j) => j.source === "Sample")).toBe(true);
  });
});

describe("mapMuseJob", () => {
  const raw = {
    id: 123,
    name: "Senior Data Engineer",
    company: { name: "Ava Labs" },
    locations: [{ name: "Flexible / Remote" }, { name: "New York, NY" }],
    categories: [{ name: "Data Science" }],
    levels: [{ name: "Senior Level" }],
    contents: "<p>Build <b>pipelines</b></p>",
    publication_date: "2026-06-10T00:00:00Z",
    refs: { landing_page: "https://www.themuse.com/jobs/avalabs/senior-data-engineer" },
  };

  test("maps core fields and marks remote when a location is Remote/Flexible", () => {
    const j = mapMuseJob(raw);
    expect(j.id).toBe("muse-123");
    expect(j.title).toBe("Senior Data Engineer");
    expect(j.company).toBe("Ava Labs");
    expect(j.url).toBe("https://www.themuse.com/jobs/avalabs/senior-data-engineer");
    expect(j.remote).toBe(true);
    expect(j.description).toBe("Build pipelines");
    expect(j.source).toBe("The Muse");
  });

  test("is not remote when no location is flexible/remote", () => {
    const j = mapMuseJob({ ...raw, locations: [{ name: "Berlin, Germany" }] });
    expect(j.remote).toBe(false);
    expect(j.location).toContain("Berlin");
  });
});

describe("mapArbeitnowJob", () => {
  test("maps fields and converts the epoch posted date", () => {
    const j = mapArbeitnowJob({
      slug: "pm-263521",
      company_name: "BELKAW GmbH",
      title: "Projektmanager",
      description: "<p>Deine <b>Rolle</b></p>",
      remote: false,
      url: "https://www.arbeitnow.com/jobs/companies/belkaw/pm-263521",
      tags: ["Project Management"],
      job_types: ["full_time"],
      location: "Bergisch Gladbach",
      created_at: 1782001892,
    });
    expect(j.id).toBe("arbeitnow-pm-263521");
    expect(j.company).toBe("BELKAW GmbH");
    expect(j.remote).toBe(false);
    expect(j.location).toBe("Bergisch Gladbach");
    expect(j.description).toBe("Deine Rolle");
    expect(j.postedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.source).toBe("Arbeitnow");
  });
});

describe("mapRemoteOkJob", () => {
  test("maps fields and is always remote", () => {
    const j = mapRemoteOkJob({
      id: "1133737",
      position: "Product Manager",
      company: "Cambridge Spark",
      location: "",
      url: "https://remoteOK.com/remote-jobs/remote-product-manager-1133737",
      apply_url: "https://remoteOK.com/apply/1133737",
      tags: ["product manager", "senior"],
      description: "<p>Lead <b>product</b></p>",
      date: "2026-06-20T02:09:54+00:00",
      salary_min: 90000,
      salary_max: 120000,
    });
    expect(j.id).toBe("remoteok-1133737");
    expect(j.title).toBe("Product Manager");
    expect(j.remote).toBe(true);
    expect(j.location).toBe("Remote");
    expect(j.url).toContain("remoteOK.com");
    expect(j.description).toBe("Lead product");
    expect(j.source).toBe("RemoteOK");
  });
});

describe("mapJobicyJob", () => {
  test("maps fields, strips HTML entities in industry, is remote", () => {
    const j = mapJobicyJob({
      id: 144319,
      url: "https://jobicy.com/jobs/144319-tax-manager",
      jobTitle: "Tax Manager",
      companyName: "Paddle",
      jobIndustry: ["Finance &amp; Accounting"],
      jobType: ["Full-Time"],
      jobGeo: "UK",
      jobLevel: "Senior",
      jobExcerpt: "Own the numbers",
      jobDescription: "<p>Own <b>finance</b></p>",
      pubDate: "2026-06-15 10:00:00",
    });
    expect(j.id).toBe("jobicy-144319");
    expect(j.title).toBe("Tax Manager");
    expect(j.company).toBe("Paddle");
    expect(j.remote).toBe(true);
    expect(j.location).toBe("UK");
    expect(j.tags.join(" ")).toContain("Finance & Accounting");
    expect(j.source).toBe("Jobicy");
  });
});

describe("jobicyGeo", () => {
  test("maps common locations to Jobicy region slugs", () => {
    expect(jobicyGeo("London, UK")).toBe("uk");
    expect(jobicyGeo("New York, USA")).toBe("usa");
    expect(jobicyGeo("Toronto, Canada")).toBe("canada");
  });

  test("returns undefined for unknown / empty locations", () => {
    expect(jobicyGeo("")).toBeUndefined();
    expect(jobicyGeo("Atlantis")).toBeUndefined();
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
