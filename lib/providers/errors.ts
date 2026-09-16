/** Thrown by adapter stubs that a later build phase will fill in. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet.`);
    this.name = 'NotImplementedError';
  }
}

/** Thrown when an upstream provider responds with a non-2xx. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(`[${provider}] ${status}: ${message}`);
    this.name = 'ProviderError';
  }
}
