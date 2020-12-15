# GitHub Action for Chromatic

Builds and publishes your Storybook to Chromatic and runs visual regression tests.

This is a wrapper for [chromatic-cli](https://github.com/chromaui/chromatic-cli), which is also where the action's source code resides.

## Getting started

In your git repository, create a file `.github/workflows/chromatic.yml` with the following contents:

```yml
# .github/workflows/chromatic.yml

# Workflow name
name: 'Chromatic'

# Event for the workflow
on: push

# List of jobs
jobs:
  chromatic-deployment:
    # Operating System
    runs-on: ubuntu-latest
    # Job steps
    steps:
      - uses: actions/checkout@v1
      - name: Install dependencies
        run: yarn
        # 👇 Adds Chromatic as a step in the workflow
      - name: Publish to Chromatic
        uses: chromaui/action@v1
        # Chromatic GitHub Action options
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          # 👇 Chromatic projectToken, refer to the manage page to obtain it.
          projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

Make sure to replace the value of `projectToken` with the project token provided to you by Chromatic. You can find it on the Manage page of your Chromatic project. The GitHub token is unrelated and will be set automatically. See below if you want to keep your projectToken secret.

> Note: Chromatic requires full [git history](#checkout-depth), so if you are using the `action/checkout@v2` action, ensure you set the `fetch-depth: 0` option.

## Usage

```yaml
- uses: chromaui/action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    projectToken: 'Your chromatic project token'
    buildScriptName: 'The npm script that builds your Storybook [build-storybook]'
    storybookBuildDir: 'Provide a directory with your built storybook; use if you've already built your storybook'
    allowConsoleErrors: 'Do not exit when runtime errors occur in storybook'
    autoAcceptChanges: 'Automatically accept all changes in chromatic: boolean or branchname'
    exitZeroOnChanges: 'Positive exit of action even when there are changes: boolean or branchname'
    exitOnceUploaded: 'Exit with 0 once the built version has been sent to chromatic: boolean or branchname'
```

We suggest you use a secret to hide the project token:

```yaml
- uses: chromaui/action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    projectToken: ${{ secrets.CHROMATIC_PROJECT_TOKEN }}
```

You can to configure secrets in the repository settings (`/<owner>/<repository>/settings/secrets`). However if you need to be able to run this action on pull requests from forks, because those can't access your secret.

## Checkout depth

Version 2 of the `actions/checkout` action will only checkout a single commit without history by default. Chromatic needs the full git history in order to track changes over time. Set `fetch-depth: 0` to enable this. See [actions/checkout](https://github.com/actions/checkout#readme) for details.

## Issues and support

Please report any issues in the [chromatic-cli](https://github.com/chromaui/chromatic-cli) repository. We provide documentation and support chat at https://www.chromatic.com/docs/.
