/**
 * Run async tasks with bounded concurrency.
 *
 * @param items   - Array of work items
 * @param fn      - Async function to run per item
 * @param limit   - Max concurrent tasks (default 8)
 * @returns       - Results in the same order as items
 */
export async function parallelMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit = 8
): Promise<R[]> {
  if (items.length === 0) return []
  if (limit < 1) limit = 1

  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i]!, i)
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  )

  await Promise.all(workers)
  return results
}
