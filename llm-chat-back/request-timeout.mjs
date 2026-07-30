export class RequestTimeoutError extends Error {
  constructor(operation, timeoutMs) {
    super(`${operation} timed out after ${timeoutMs}ms`);
    this.name = "RequestTimeoutError";
    this.code = "ETIMEDOUT";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
    this.retryable = true;
  }
}

export async function withRequestTimeout(
  operation,
  timeoutMs,
  runner,
  parentSignal
) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      const timeoutError = new RequestTimeoutError(operation, timeoutMs);
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });
  const operationPromise = Promise.resolve().then(() =>
    runner(controller.signal)
  );

  try {
    return await Promise.race([operationPromise, timeoutPromise]);
  } catch (error) {
    if (timedOut) {
      throw new RequestTimeoutError(operation, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}
