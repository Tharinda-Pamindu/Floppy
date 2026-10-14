import { Octokit } from "@octokit/rest";
import type { GithubClient, GithubIssueInfo } from "../ports.js";

const PER_PAGE = 30;

const isNotFound = (err: unknown) => (err as { status?: number })?.status === 404;

/** Read-only GitHub access. Public repos work without a token; private ones need GITHUB_TOKEN. */
export class OctokitGithub implements GithubClient {
  private readonly octokit: Octokit;

  constructor(token?: string) {
    this.octokit = new Octokit({ ...(token ? { auth: token } : {}), userAgent: "floppy-app" });
  }

  async getRepo(owner: string, name: string) {
    try {
      const { data } = await this.octokit.repos.get({ owner, repo: name });
      return { owner: data.owner.login, name: data.name, htmlUrl: data.html_url, private: data.private };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async listOpenIssues(owner: string, name: string, page: number) {
    const { data } = await this.octokit.issues.listForRepo({ owner, repo: name, state: "open", per_page: PER_PAGE, page, sort: "updated" });
    // The issues endpoint also returns pull requests; leave those out.
    const issues: GithubIssueInfo[] = data.filter((i) => !i.pull_request).map(toIssue);
    return { issues, hasMore: data.length === PER_PAGE };
  }

  async getIssue(owner: string, name: string, number: number) {
    try {
      const { data } = await this.octokit.issues.get({ owner, repo: name, issue_number: number });
      return toIssue(data);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }
}

function toIssue(i: {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: (string | { name?: string | null })[];
  user: { login: string } | null;
  created_at: string;
}): GithubIssueInfo {
  return {
    number: i.number,
    title: i.title,
    state: i.state === "closed" ? "closed" : "open",
    url: i.html_url,
    labels: i.labels.map((l) => (typeof l === "string" ? l : (l.name ?? ""))).filter(Boolean),
    author: i.user?.login ?? null,
    createdAt: i.created_at,
  };
}
