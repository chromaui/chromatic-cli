# Agent guidelines

## Lint and format

- `yarn lint` runs oxlint (`.oxlintrc.json`); `yarn fmt:check` runs oxfmt (`.oxfmtrc.json`). CI runs both.
- Run `yarn fmt:write` before committing. It also sorts imports, so don't order them by hand.
- When iterating, lint only the files you changed: `yarn lint:js path/to/file.ts`. oxlint has no cache, and
  linting a few files takes about a second.

## Don't suppress complexity or size limits

`complexity`, `max-lines`, `max-statements` and `max-depth` exist to keep code reviewable. When one fires,
split the function or file instead of adding an `eslint-disable` comment. Inline disables for the first
three are rejected by lint; files that already had one are listed in the first override in `.oxlintrc.json`.
Remove a file from that list when you refactor it below the limit.

Any other `eslint-disable` should say why, after `--`:

```ts
// eslint-disable-next-line no-console -- the CLI prints this before the logger exists
```
