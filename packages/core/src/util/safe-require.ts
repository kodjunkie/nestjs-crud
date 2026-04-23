export function safeRequire<T = any>(path: string, loader?: () => T): T | null {
  try {
    /* istanbul ignore next -- defensive: loader fast-path covered by callers; bare require(path) branch only reachable via callers that omit the loader (none in this repo) */
    const pack = loader ? loader() : require(path);
    return pack;
  } catch (_) {
    /* istanbul ignore next -- catch branch: covered by jest.config.no-swagger.js sentinel via moduleNameMapper, but instrumentation of the catch in the same module's own coverage is a chicken-and-egg problem (D-18) */
    return null;
  }
}
