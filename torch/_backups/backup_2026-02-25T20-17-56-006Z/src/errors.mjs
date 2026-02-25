// Custom Error class for controlled exits
export class ExitError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ExitError';
    this.code = code;
  }
}
