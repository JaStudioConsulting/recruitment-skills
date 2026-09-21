import { describe, expect, it } from "vitest";

import {
  beginLatestRequest,
  latestRequestIsCurrent,
} from "../components/workstation/recruiter-workstation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("candidate selection request ordering", () => {
  it("allows only the latest deferred A/B request to commit selection, errors, and loading", async () => {
    const counter = { current: 0 };
    const candidateA = deferred<string>();
    const candidateB = deferred<string>();
    const selections: string[] = [];
    const errors: string[] = [];
    const settled: string[] = [];

    const open = async (label: string, request: Promise<string>) => {
      const token = beginLatestRequest(counter);
      try {
        const selected = await request;
        if (latestRequestIsCurrent(counter, token)) selections.push(selected);
      } catch (error) {
        if (latestRequestIsCurrent(counter, token)) errors.push(String(error));
      } finally {
        if (latestRequestIsCurrent(counter, token)) settled.push(label);
      }
    };

    const openingA = open("A", candidateA.promise);
    const openingB = open("B", candidateB.promise);
    candidateB.resolve("candidate-b");
    await openingB;
    candidateA.reject(new Error("stale A failure"));
    await openingA;

    expect(selections).toEqual(["candidate-b"]);
    expect(errors).toEqual([]);
    expect(settled).toEqual(["B"]);
  });

  it("invalidates an in-flight selection when the workspace is cleared", async () => {
    const counter = { current: 0 };
    const candidateA = deferred<string>();
    const selections: string[] = [];
    const token = beginLatestRequest(counter);
    const openingA = candidateA.promise.then((selected) => {
      if (latestRequestIsCurrent(counter, token)) selections.push(selected);
    });

    beginLatestRequest(counter);
    candidateA.resolve("candidate-a");
    await openingA;

    expect(selections).toEqual([]);
  });
});
