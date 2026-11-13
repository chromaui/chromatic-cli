/**
 * Thrown by a subcommand to fail with an exit code other than 1. `register.js` prints its message
 * like any other error and exits with `exitCode`.
 */
export class SubcommandFailure extends Error {
  readonly exitCode: number;

  constructor(message: string, options: { exitCode: number }) {
    super(message);
    this.name = 'SubcommandFailure';
    this.exitCode = options.exitCode;
  }
}
