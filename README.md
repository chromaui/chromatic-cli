# Chromatic Github Action

## How to add an GitHub action

- Create a file in your repo: `.github/workflows/chromatic.yml`
- set it's content to:
  ```yml
  name: "Chromatic"
  on: push

  jobs:
    test:
      runs-on: ubuntu-latest
      steps:
      - uses: actions/checkout@v1
      - uses: chromaui/action@v1
        with: 
          appCode: <insert the chromatic appToken here>
          token: ${{ secrets.GITHUB_TOKEN }}
  ```

## Usage (all options)

```yaml
- uses: chromaui/action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    appCode: 'Your chromatic/chroma app_code'
    buildScriptName: 'The npm script that builds your Storybook [build-storybook]'
    storybookBuildDir: 'Provide a directory with your built storybook; use if you've already built your storybook'
    allowConsoleErrors: 'do not exit when runtime errors occur in storybook'
    autoAcceptChanges: 'automatically accept all changes in chromatic: boolean or branchname'
    exitZeroOnChanges: 'positive exit of action even when there are changes: boolean or branchname'
    exitOnceUploaded: 'exit with 0 once the built version has been sent to chromatic: boolean or branchname'
```


We suggest you use a secret to hide to app-code:

```yaml
- uses: chromaui/action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    appCode: ${{ secrets.CHROMATIC_APP_CODE }}
```

You have to configure secrets in the settings tab (`https://github.com/{YOUR_ORGANSATION}/{YOUR_REPOSITORY}/settings/secrets`)

However if you need to be able to run this action on forked PRs you can't make it a secret, it has to be public:

```yaml
- uses: chromaui/action@v1
  with:
    token: ${{ secrets.GITHUB_TOKEN }}
    appCode: appcodehere
```

## Checkout depth

In the v2 version of the `actions/checkout` action, there's no git history. Chromatic needs the git history in order to find the base-build.

Add `fetch-depth: 0` to add full history, see: https://github.com/actions/checkout#whats-new

## Development

### Publish to a distribution branch

Actions are run from GitHub repos. We will create a releases branch and only commit production modules. 

Comment out node_modules in `.gitignore` and create a releases/v1 branch
```plaintext
# comment out in distribution branches
# node_modules/
```

```sh
git checkout -b releases/v1
git commit -a -m "prod dependencies"
```

```sh
npm prune --production
git add node_modules
git commit -a -m "prod dependencies"
git push origin releases/v1
```

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

### Validate

You can now validate the action by referencing the releases/v1 branch

```yaml
- uses: chromaui/action@releases/v1
  with:
    appCode: ${{ secrets.CHROMATIC_APP_CODE }}
```

See the [actions tab](https://github.com/chromaui/action/actions) for runs of this action! :rocket:

### Usage:

After testing you can [create a v1 tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the stable and tested action

```yaml
- uses: chromaui/action@v1
  with:
    appCode: ${{ secrets.CHROMATIC_APP_CODE }}
```
