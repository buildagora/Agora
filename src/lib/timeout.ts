/**
 * Utility for fail-fast timeouts on async operations
 * Used to prevent server-side rendering from hanging
 */

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds (default: 3000)
 * @param errorMessage Error message if timeout occurs
 * @returns Promise that rejects if timeout is exceeded
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 3000,
  errorMessage: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Wraps a fetch call with a timeout using AbortController
 * @param url The URL to fetch
 * @param options Fetch options
 * @param timeoutMs Timeout in milliseconds (default: 3000)
 * @returns Promise that rejects if timeout is exceeded
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 3000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Fetch timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Executes a function with a timeout
 * Useful for wrapping synchronous operations that might block
 * @param fn Function to execute
 * @param timeoutMs Timeout in milliseconds (default: 3000)
 * @param defaultValue Default value to return if timeout occurs
 * @returns Result of function or default value if timeout
 */
export async function executeWithTimeout<T>(
  fn: () => T | Promise<T>,
  timeoutMs: number = 3000,
  defaultValue: T
): Promise<T> {
  try {
    const result = await Promise.race([
      Promise.resolve(fn()),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error("Operation timed out")), timeoutMs)
      ),
    ]);
    return result;
  } catch (error) {
    console.error("Operation timed out, returning default value:", error);
    return defaultValue;
  }
}

