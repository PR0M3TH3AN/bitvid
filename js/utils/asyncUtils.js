/**
 * Maps over an iterable with a concurrency limit.
 *
 * @param {Iterable} iterable - The items to map over.
 * @param {Function} mapper - The async mapping function.
 * @param {Object} options - Options object.
 * @param {number} options.concurrency - The concurrency limit (default: Infinity).
 * @returns {Promise<Array>} - The results of the mapping function in original order.
 */
export async function pMap(iterable, mapper, { concurrency = Infinity } = {}) {
  const results = [];
  const iterator = iterable[Symbol.iterator]();
  let index = 0;
  let active = 0;
  let done = false;
  let rejected = false;

  return new Promise((resolve, reject) => {
    function next() {
      if (rejected) return;
      if (done && active === 0) {
        resolve(results);
        return;
      }

      while (active < concurrency && !done) {
        const nextItem = iterator.next();
        if (nextItem.done) {
          done = true;
          if (active === 0) resolve(results);
          return;
        }

        const currentIndex = index++;
        active++;

        Promise.resolve(nextItem.value)
          .then((value) => mapper(value, currentIndex))
          .then((result) => {
            results[currentIndex] = result;
            active--;
            next();
          })
          .catch((err) => {
            rejected = true;
            reject(err);
          });
      }
    }

    next();
  });
}
