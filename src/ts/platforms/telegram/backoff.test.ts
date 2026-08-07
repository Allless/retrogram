import { describe, expect, it, vi } from "vitest";

import { withFloodRetry } from "./backoff";

function fakeSleep() {
  const calls: number[] = [];
  const sleep = (ms: number): Promise<void> => {
    calls.push(ms);
    return Promise.resolve();
  };
  return { calls, sleep };
}

describe("withFloodRetry", () => {
  it("passes through a successful call with no retries", async () => {
    const { calls, sleep } = fakeSleep();
    const fn = vi.fn().mockResolvedValue("ok");

    await expect(withFloodRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });

  it("retries after a FLOOD_WAIT and waits the mandated seconds", async () => {
    const { calls, sleep } = fakeSleep();
    const onWait = vi.fn();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("flood"), { seconds: 7 }))
      .mockResolvedValue("done");

    await expect(withFloodRetry(fn, { sleep, onWait })).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([7000]);
    expect(onWait).toHaveBeenCalledWith(7);
  });

  it("parses FLOOD_WAIT_<n> from the error message", async () => {
    const { calls, sleep } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("RPC FLOOD_WAIT_12 called"))
      .mockResolvedValue("done");

    await expect(withFloodRetry(fn, { sleep })).resolves.toBe("done");
    expect(calls).toEqual([12000]);
  });

  it("uses exponential backoff for non-flood transient errors", async () => {
    const { calls, sleep } = fakeSleep();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValue("done");

    await expect(withFloodRetry(fn, { sleep })).resolves.toBe("done");
    expect(calls).toEqual([1000, 2000]);
  });

  it("gives up and rethrows after maxRetries", async () => {
    const { calls, sleep } = fakeSleep();
    const fn = vi.fn().mockRejectedValue(new Error("persistent"));

    await expect(withFloodRetry(fn, { sleep, maxRetries: 2 })).rejects.toThrow(
      "persistent",
    );
    // Initial attempt + 2 retries = 3 calls; 2 sleeps between them.
    expect(fn).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([1000, 2000]);
  });
});
