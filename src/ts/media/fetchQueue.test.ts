import { describe, expect, it } from "vitest";

import { enqueueFetch, focusFetchPriority } from "./fetchQueue";

/** A task that records its label when run and resolves on command. */
function controlled(label: string, log: string[]) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const task = async () => {
    log.push(label);
    await gate;
    return label;
  };
  return { task, release };
}

describe("fetchQueue", () => {
  it("runs one job at a time in priority order, FIFO within a priority", async () => {
    const log: string[] = [];
    const first = controlled("p0", log);
    const a = enqueueFetch(0, first.task);
    // Enqueued while p0 runs — must start in priority order, not enqueue order.
    const rest = [
      controlled("p2", log),
      controlled("p1-first", log),
      controlled("p1-second", log),
    ];
    const b = enqueueFetch(2, rest[0].task);
    const c = enqueueFetch(1, rest[1].task);
    const d = enqueueFetch(1, rest[2].task);

    await Promise.resolve();
    expect(log).toEqual(["p0"]); // only one running

    first.release();
    rest[1].release();
    rest[2].release();
    rest[0].release();
    await Promise.all([a, b, c, d]);
    expect(log).toEqual(["p0", "p1-first", "p1-second", "p2"]);
  });

  it("focusFetchPriority bumps a slide's jobs to the front", async () => {
    const log: string[] = [];
    const first = controlled("running", log);
    const a = enqueueFetch(0, first.task);
    const early = controlled("p1", log);
    const late = controlled("p9", log);
    const b = enqueueFetch(1, early.task);
    const c = enqueueFetch(9, late.task);

    focusFetchPriority(9); // user jumped to slide 9
    first.release();
    late.release();
    early.release();
    await Promise.all([a, b, c]);
    expect(log).toEqual(["running", "p9", "p1"]);
  });

  it("a failing job rejects its caller but the queue keeps going", async () => {
    const log: string[] = [];
    const boom = enqueueFetch(0, () => Promise.reject(new Error("boom")));
    const after = controlled("after", log);
    const ok = enqueueFetch(0, after.task);

    await expect(boom).rejects.toThrow("boom");
    after.release();
    await expect(ok).resolves.toBe("after");
    expect(log).toEqual(["after"]);
  });
});
