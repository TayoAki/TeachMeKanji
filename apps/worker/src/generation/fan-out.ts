/**
 * Run model calls in parallel without paying for the shared prompt N times: the first task
 * goes alone until its response starts streaming (a prompt-cache entry is readable only from
 * then on), then the others start, at most `limit` at a time, and read that cache.
 *
 * After a failure no new task starts; the ones in flight finish (their usage is real and is
 * metered), then the first error is rethrown.
 */
export async function fanOut<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number, onStreamStart: () => void) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let warm!: () => void;
  const warmed = new Promise<void>((resolve) => (warm = resolve));
  let next = 0;
  const state: { failure: { error: unknown } | null } = { failure: null };

  async function lane() {
    while (!state.failure && next < items.length) {
      const index = next++;
      if (index > 0) await warmed;
      if (state.failure) return;
      try {
        results[index] = await run(items[index]!, index, index === 0 ? warm : () => {});
      } catch (error) {
        state.failure ??= { error };
      } finally {
        // If the first call fails before streaming, don't leave the others waiting.
        if (index === 0) warm();
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  if (state.failure) throw state.failure.error;
  return results;
}
