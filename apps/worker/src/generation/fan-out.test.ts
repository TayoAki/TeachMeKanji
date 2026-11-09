import { describe, expect, it } from "vitest";
import { fanOut } from "./fan-out";

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

describe("fanOut", () => {
  it("starts the others only after the first call starts streaming, within the limit", async () => {
    const started: number[] = [];
    let running = 0;
    let maxRunning = 0;
    let firstStreaming = false;
    const results = await fanOut([0, 1, 2, 3, 4, 5], 3, async (item, index, onStreamStart) => {
      if (index > 0) expect(firstStreaming).toBe(true);
      started.push(item);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      if (index === 0) {
        await tick();
        firstStreaming = true;
        onStreamStart();
      }
      await tick(10);
      running -= 1;
      return item * 10;
    });
    expect(results).toEqual([0, 10, 20, 30, 40, 50]);
    expect(maxRunning).toBe(3);
    expect(started.sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("releases the others when the first call fails before streaming", async () => {
    await expect(
      fanOut([0, 1], 2, async (_item, index) => {
        if (index === 0) throw new Error("first failed");
        return index;
      }),
    ).rejects.toThrow("first failed");
  });

  it("stops starting new work after a failure, lets in-flight work finish, then rethrows", async () => {
    const finished: number[] = [];
    await expect(
      fanOut([0, 1, 2, 3, 4, 5, 6, 7], 2, async (item, index, onStreamStart) => {
        if (index === 0) onStreamStart();
        await tick(item === 1 ? 2 : 15);
        if (item === 1) throw new Error("screen 1 failed");
        finished.push(item);
        return item;
      }),
    ).rejects.toThrow("screen 1 failed");
    expect(finished).toContain(0); // in flight when 1 failed: allowed to finish
    expect(finished.length).toBeLessThan(7); // nothing new started after the failure
  });

  it("handles no work", async () => {
    expect(await fanOut([], 4, async () => 1)).toEqual([]);
  });
});
