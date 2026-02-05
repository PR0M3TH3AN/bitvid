/**
 * Maps over an iterable with a concurrency limit.
 *
 * @template T, R
 * @param {Iterable<T>} iterable - The input iterable (e.g., an array).
 * @param {(item: T, index: number) => Promise<R> | R} mapper - The mapping function.
 * @param {object} [options]
 * @param {number} [options.concurrency=Infinity] - Maximum number of concurrent executions.
 * @returns {Promise<R[]>} - A promise that resolves to an array of results in the same order as the input.
 */
export async function pMap(iterable, mapper, { concurrency = Infinity } = {}) {
  // Handle infinite concurrency with standard Promise.all
  if (concurrency === Infinity) {
    const promises = [];
    let index = 0;
    for (const item of iterable) {
      const i = index++;
      promises.push(Promise.resolve(item).then((val) => mapper(val, i)));
    }
    return Promise.all(promises);
  }

  const results = [];
  const iterator = iterable[Symbol.iterator]();
  const limit = Math.max(1, Number.isFinite(concurrency) ? concurrency : 1);
  const workers = [];
  let index = 0;

  async function worker() {
    let nextItem = iterator.next();
    while (!nextItem.done) {
      const i = index++;
      const value = nextItem.value;
      try {
        results[i] = await mapper(value, i);
      } catch (error) {
        throw error;
      }
      nextItem = iterator.next();
    }
  }

  // Spawn workers up to the concurrency limit
  for (let i = 0; i < limit; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
