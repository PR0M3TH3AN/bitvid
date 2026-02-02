export async function waitFor(callback, { timeout = 2000, interval = 50, message = "waitFor timed out" } = {}) {
  const start = Date.now();
  let lastError;

  while (true) {
    try {
      const result = await callback();
      return result;
    } catch (error) {
      lastError = error;
    }

    if (Date.now() - start > timeout) {
      const errorMsg = lastError ? `${message}: ${lastError.message}` : message;
      throw new Error(errorMsg);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}
