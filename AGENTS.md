# AGENTS.md

Guidance for coding agents working in `chromaui/chromatic-cli`, the `chromatic` npm package (CLI, GitHub Action, and Storybook addon).

## This repository is public

Everything you write here is visible to the world, and much of it cannot be fully deleted: PR titles and bodies keep their edit history, branch names stay in the PR timeline, and notifications go out the moment something is pushed or opened.

Work often starts from a Linear ticket or bug report that contains private details. Those details stay there. Never put any of the following into a branch name, commit message, PR title or body, review comment, code comment, test fixture, or CHANGELOG entry:

- Customer or company names, or the names, emails, or handles of people at those companies
- Chromatic app IDs, project IDs, build numbers or URLs, or project tokens (`chpt_…`)
- Customer repository names, file paths, package names, story names, or snippets of their code or config
- Logs, stack traces, or screenshots from customer builds
- Links to Linear, Slack, Intercom, Zendesk, or other internal tools (Linear URLs embed the issue title)

**Exception: Obvious links.** PR bodies may link to Obvious project, thread, and PR-artifact pages (`app.obvious.ai/...`). Those pages are restricted to Chromatic users, and reviewers need them to trace a PR back to the thread that produced it. The carve-out is narrow:

- PR bodies only. Not in branch names, commit messages, code comments, test fixtures, or CHANGELOG entries.
- The URL itself is public even though the page is not. Obvious builds URLs from the ticket title (e.g. `cap-1234-short-summary`), so the slug must meet the same bar as a branch name. If the title names a customer or anything else on the list above, use a neutral project name or leave the link out.
- Never quote or summarize the thread's content in the PR, since that content was written under the assumption that it stays private.

Instead:

- **Reference tickets by identifier only**, e.g. `CAP-1234`. Linear's GitHub integration links it automatically.
- **Name branches after the identifier**, e.g. `<username>/cap-1234` or `<username>/cap-1234-short-generic-summary`. Do not use the branch name Linear suggests; it is built from the issue title.
- **Write PR titles and descriptions from the diff**, describing the behavior that changed, not from the ticket text.
- **Reproduce customer setups generically.** Build fixtures with neutral names (`my-app`, `packages/ui`, `Button.stories.tsx`) and only the structure needed to trigger the bug.
- **Rewrite rather than quote** error messages and logs: keep the part that comes from this CLI, and replace anything that comes from the customer's project with a placeholder.

If you are unsure whether something is identifying, leave it out. If a ticket title itself names a customer, write a neutral title of your own.

## Verify changes in the real CLI

Unit tests don't show that the CLI behaves correctly for users. Before you call a change to `bin-src/` or `node-src/` done, open or update a PR, or approve one, load the `verify-chromatic-cli` skill (`.agents/skills/verify-chromatic-cli/`) and drive the built CLI through its `control-chromatic` helper. That covers comparing `main` against your branch (`build-ref`), reproducing a bug in an e2e fixture project with another builder or package manager (`e2e-fixture`), and trying a published canary (`install-published`). If the helper can't do what the change needs, extend it in the same PR instead of working around it. When you can't verify something, say what and why in the PR.
