# Chromatic Github Action

We use [GitHub's action toolkit](https://github.com/actions/toolkit/blob/master/README.md#packages)

## Usage

```yaml
uses: chromaui/action@v1
with:
  appCode: 'Your chromatic/chroma app_code'
  buildScriptName: 'The npm script that builds your Storybook [build-storybook]'
  scriptName: 'The npm script that starts your Storybook [storybook]'
  exec: 'Alternatively, a full command to run to start your storybook'
  doNotStart: 'Don't attempt to start or build; use if your Storybook is already running'
  storybookPort: 'What port is your Storybook running on (auto detected from -s, if set)'
  storybookUrl: 'Storybook is already running at (external) url (implies -S)'
  storybookBuildDir: 'Provide a directory with your built storybook; use if you've already built your storybook'
  storybookHttps: 'Use if Storybook is running on https (auto detected from -s, if set)'
  storybookCert: 'Use if Storybook is running on https (auto detected from -s, if set)'
  storybookKey: 'Use if Storybook is running on https (auto detected from -s, if set)'
  storybookCa: 'Use if Storybook is running on https (auto detected from -s, if set)'
```

We suggest you use secret:

```yaml
uses: chromaui/action@v1
with:
  appCode: ${{ secrets.CHROMATIC_APP_CODE }}
```

You have to configure secrets in the settings tab (https://github.com/<org>/<repo>/settings/secrets)

## Development

### Publish to a distribution branch

Actions are run from GitHub repos. We will create a releases branch and only checkin production modules. 

Comment out node_modules in `.gitignore` and create a releases/v1 branch
```plaintext
# comment out in distribution branches
# node_modules/
```

```sh
$ git checkout -b releases/v1
$ git commit -a -m "prod dependencies"
```

```sh
$ npm prune --production
$ git add node_modules
$ git commit -a -m "prod dependencies"
$ git push origin releases/v1
```

See the [versioning documentation](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md)

### Validate

You can now validate the action by referencing the releases/v1 branch

```yaml
uses: chromaui/action@releases/v1
with:
  milliseconds: 1000
```

See the [actions tab](https://github.com/chromaui/action/actions) for runs of this action! :rocket:

### Usage:

After testing you can [create a v1 tag](https://github.com/actions/toolkit/blob/master/docs/action-versioning.md) to reference the stable and tested action

```yaml
uses: chromaui/action@v1
with:
  milliseconds: 1000
```
