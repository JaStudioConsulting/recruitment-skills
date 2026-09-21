import { describe, expect, it, vi } from "vitest";

import { loadScopedCaseResource } from "../components/workstation/recruiter-workstation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe("case resource request scope", () => {
  it("does not let a stale A request restart or settle loading after B completes", async () => {
    const counter = { current: 0 };
    const pendingA = deferred<string[]>();
    const pendingB = deferred<string[]>();
    let activeCaseId = "case-a";
    let loading = false;
    const starts: string[] = [];
    const commits: string[][] = [];
    const load = vi.fn((caseId: string) => caseId === "case-a" ? pendingA.promise : pendingB.promise);
    const request = (caseId: string) => loadScopedCaseResource(
      load,
      caseId,
      counter,
      (requestedCaseId) => activeCaseId === requestedCaseId,
      {
        onStart: () => { starts.push(caseId); loading = true; },
        onSuccess: (value) => commits.push(value),
        onError: vi.fn(),
        onFinish: () => { loading = false; },
      },
    );

    const loadingA = request("case-a");
    activeCaseId = "case-b";
    const loadingB = request("case-b");
    pendingB.resolve(["B"]);
    await loadingB;
    expect(loading).toBe(false);

    const staleRestart = await request("case-a");
    expect(staleRestart).toBeNull();
    expect(loading).toBe(false);

    pendingA.resolve(["A"]);
    await loadingA;

    expect(starts).toEqual(["case-a", "case-b"]);
    expect(commits).toEqual([["B"]]);
    expect(loading).toBe(false);
  });
});
