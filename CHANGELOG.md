# v13.1.4 (Fri Aug 29 2025)

#### 🐛 Bug Fix

- Feat:Fix outdated and incorrect links in the CLI [#1202](https://github.com/chromaui/chromatic-cli/pull/1202) ([@jonniebigodes](https://github.com/jonniebigodes))
- Show setup URL on build errors when onboarding. [#1201](https://github.com/chromaui/chromatic-cli/pull/1201) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- [@jonniebigodes](https://github.com/jonniebigodes)
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v13.1.3 (Thu Jul 31 2025)

#### 🐛 Bug Fix

- Remove notify service message logs [#1199](https://github.com/chromaui/chromatic-cli/pull/1199) ([@codykaup](https://github.com/codykaup))
- Replace ad hoc test loggers with `TestLogger` [#1197](https://github.com/chromaui/chromatic-cli/pull/1197) ([@justin-thurman](https://github.com/justin-thurman))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- Justin Thurman ([@justin-thurman](https://github.com/justin-thurman))

---

# v13.1.2 (Thu Jul 03 2025)

#### 🐛 Bug Fix

- Copy package files with absolute paths [#1195](https://github.com/chromaui/chromatic-cli/pull/1195) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v13.1.1 (Thu Jul 03 2025)

#### 🐛 Bug Fix

- Skip notify service if there are no tests [#1196](https://github.com/chromaui/chromatic-cli/pull/1196) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v13.1.0 (Wed Jul 02 2025)

#### 🚀 Enhancement

- Get build progress updates through Chromatic notify service [#1191](https://github.com/chromaui/chromatic-cli/pull/1191) ([@justin-thurman](https://github.com/justin-thurman) [@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Dynamically generate `CHROMATIC_NOTIFY_SERVICE_URL` [#1194](https://github.com/chromaui/chromatic-cli/pull/1194) ([@codykaup](https://github.com/codykaup))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- Justin Thurman ([@justin-thurman](https://github.com/justin-thurman))

---

# v13.0.1 (Wed Jun 18 2025)

#### 🐛 Bug Fix

- Wrap env-ci usage and recover from errors. [#1190](https://github.com/chromaui/chromatic-cli/pull/1190) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 1

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v13.0.0 (Mon Jun 16 2025)

#### 💥 Breaking Change

- Remove some deprecated flags [#1188](https://github.com/chromaui/chromatic-cli/pull/1188) ([@jmhobbs](https://github.com/jmhobbs))

#### 🚀 Enhancement

- Log errors in env-ci call [#1189](https://github.com/chromaui/chromatic-cli/pull/1189) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 1

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v12.2.0 (Mon Jun 09 2025)

#### 🚀 Enhancement

- Set `STORYBOOK_INVOKED_BY` env var for SB telemetry [#1180](https://github.com/chromaui/chromatic-cli/pull/1180) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v12.1.1 (Fri Jun 06 2025)

#### 🐛 Bug Fix

- Remove requirement for an accepted build [#1187](https://github.com/chromaui/chromatic-cli/pull/1187) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v12.1.0 (Wed Jun 04 2025)

#### 🚀 Enhancement

- Split upload task to allow tracing changed files with dry run [#1185](https://github.com/chromaui/chromatic-cli/pull/1185) ([@justin-thurman](https://github.com/justin-thurman))

#### Authors: 1

- Justin Thurman ([@justin-thurman](https://github.com/justin-thurman))

---

# v12.0.0 (Sat May 24 2025)

#### 💥 Breaking Change

- Revert "Revert "Add git command logging and pass `--no-relative` to `git diff`."" [#1184](https://github.com/chromaui/chromatic-cli/pull/1184) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.29.0 (Fri May 23 2025)

#### 🚀 Enhancement

- Export `createLogger` and make all arguments optional [#1182](https://github.com/chromaui/chromatic-cli/pull/1182) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.28.4 (Fri May 23 2025)

#### 🐛 Bug Fix

- Revert "Add git command logging and pass `--no-relative` to `git diff`." [#1183](https://github.com/chromaui/chromatic-cli/pull/1183) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.28.3 (Thu May 22 2025)

#### 🐛 Bug Fix

- Add git command logging and pass `--no-relative` to `git diff`. [#1181](https://github.com/chromaui/chromatic-cli/pull/1181) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.28.2 (Thu Apr 17 2025)

#### 🐛 Bug Fix

- Use pagination to get all tests in the build [#1175](https://github.com/chromaui/chromatic-cli/pull/1175) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.28.1 (Thu Apr 17 2025)

#### 🐛 Bug Fix

- Return additional build info on action rerun [#1174](https://github.com/chromaui/chromatic-cli/pull/1174) ([@justin-thurman](https://github.com/justin-thurman))
- :pencil2: Update help text to reflect actual state of exitOnceUploaded. [#1169](https://github.com/chromaui/chromatic-cli/pull/1169) ([@jwir3](https://github.com/jwir3))

#### Authors: 2

- Justin Thurman ([@justin-thurman](https://github.com/justin-thurman))
- Scott Johnson ([@jwir3](https://github.com/jwir3))

---

# v11.28.0 (Thu Apr 03 2025)

#### 🚀 Enhancement

- Remove unused `viewLayer` and `addons` from CLI metadata [#1167](https://github.com/chromaui/chromatic-cli/pull/1167) ([@justin-thurman](https://github.com/justin-thurman))
- Add `pnpm-lock.yaml` to list of lockfiles [#1164](https://github.com/chromaui/chromatic-cli/pull/1164) ([@codykaup](https://github.com/codykaup))
- Move TurboSnap to a local lib [#1162](https://github.com/chromaui/chromatic-cli/pull/1162) ([@codykaup](https://github.com/codykaup))
- Throw on multiple scanned projects from snyk [#1161](https://github.com/chromaui/chromatic-cli/pull/1161) ([@jmhobbs](https://github.com/jmhobbs))

#### 🐛 Bug Fix

- Preserve git history when publishing new GH action version [#1166](https://github.com/chromaui/chromatic-cli/pull/1166) ([@justin-thurman](https://github.com/justin-thurman))
- Improve TurboSnap tests [#1163](https://github.com/chromaui/chromatic-cli/pull/1163) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 3

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))
- Justin Thurman ([@justin-thurman](https://github.com/justin-thurman))

---

# v11.27.0 (Mon Mar 03 2025)

#### 🚀 Enhancement

- Add PNPM Support for TurboSnap [#1160](https://github.com/chromaui/chromatic-cli/pull/1160) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.26.1 (Wed Feb 26 2025)

#### 🐛 Bug Fix

- Fix moduleName resolution for Storybook files with import cycles. [#1157](https://github.com/chromaui/chromatic-cli/pull/1157) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 1

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.26.0 (Tue Feb 25 2025)

#### 🚀 Enhancement

- Upgrade to latest version of `snyk-nodejs-lockfile-parser` [#1158](https://github.com/chromaui/chromatic-cli/pull/1158) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Add new Vite builder entry for future SB versions [#1155](https://github.com/chromaui/chromatic-cli/pull/1155) ([@codykaup](https://github.com/codykaup))
- Add `outputDir` to action metadata [#1154](https://github.com/chromaui/chromatic-cli/pull/1154) ([@codykaup](https://github.com/codykaup))
- Set Apollo GraphQL client identification headers [#1151](https://github.com/chromaui/chromatic-cli/pull/1151) ([@jmhobbs](https://github.com/jmhobbs))
- Fix directory flags for trace command. [#1148](https://github.com/chromaui/chromatic-cli/pull/1148) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.25.2 (Thu Jan 30 2025)

#### 🐛 Bug Fix

- Add additional rspack builder entrypoint [#1147](https://github.com/chromaui/chromatic-cli/pull/1147) ([@jmhobbs](https://github.com/jmhobbs))
- Account for accessibility change counts in UI [#1145](https://github.com/chromaui/chromatic-cli/pull/1145) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 1

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.25.1 (Wed Jan 22 2025)

#### 🐛 Bug Fix

- Don't normalize package.json fields [#1143](https://github.com/chromaui/chromatic-cli/pull/1143) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.25.0 (Thu Jan 16 2025)

#### 🚀 Enhancement

- Log Turbosnap metrics to New Relic [#1141](https://github.com/chromaui/chromatic-cli/pull/1141) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Remove Turbosnap metrics logs [#1142](https://github.com/chromaui/chromatic-cli/pull/1142) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.24.0 (Tue Jan 14 2025)

#### 🚀 Enhancement

- Log Turbosnap metrics to New Relic [#1141](https://github.com/chromaui/chromatic-cli/pull/1141) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.23.0 (Mon Jan 13 2025)

#### 🚀 Enhancement

- Skip lock file parsing if it's larger than 10MB [#1140](https://github.com/chromaui/chromatic-cli/pull/1140) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.22.2 (Thu Jan 09 2025)

#### 🐛 Bug Fix

- Add rsbuild v0.1.7 support [#1138](https://github.com/chromaui/chromatic-cli/pull/1138) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.22.1 (Wed Jan 08 2025)

#### 🐛 Bug Fix

- Add `outputDir` to GitHub Action options [#1136](https://github.com/chromaui/chromatic-cli/pull/1136) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.22.0 (Fri Jan 03 2025)

#### 🚀 Enhancement

- Bail on preview file changes [#1133](https://github.com/chromaui/chromatic-cli/pull/1133) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.21.0 (Fri Jan 03 2025)

#### 🚀 Enhancement

- Set `storybookUrl` action output on rebuild early exit [#1134](https://github.com/chromaui/chromatic-cli/pull/1134) ([@jmhobbs](https://github.com/jmhobbs))
- Upload coverage reports to codecov [#1132](https://github.com/chromaui/chromatic-cli/pull/1132) ([@paulelliott](https://github.com/paulelliott))

#### Authors: 2

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))
- Paul Elliott ([@paulelliott](https://github.com/paulelliott))

---

# v11.20.2 (Wed Dec 11 2024)

#### 🐛 Bug Fix

- Errors in project metadata gathering causing build failures [#1131](https://github.com/chromaui/chromatic-cli/pull/1131) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 1

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.20.1 (Tue Dec 10 2024)

#### 🐛 Bug Fix

- Account for configs when checking `exitOnceUploaded` in action [#1130](https://github.com/chromaui/chromatic-cli/pull/1130) ([@codykaup](https://github.com/codykaup))
- Only publish `latest` action on push to main [#1129](https://github.com/chromaui/chromatic-cli/pull/1129) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.20.0 (Mon Dec 02 2024)

#### 🚀 Enhancement

- Send project metadata to the index [#1122](https://github.com/chromaui/chromatic-cli/pull/1122) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.19.0 (Mon Nov 25 2024)

#### 🚀 Enhancement

- :sparkles: Add properties to XML reporting based on status. [#1125](https://github.com/chromaui/chromatic-cli/pull/1125) ([@jwir3](https://github.com/jwir3))

#### Authors: 1

- Scott Johnson ([@jwir3](https://github.com/jwir3))

---

# v11.18.1 (Tue Nov 12 2024)

#### 🐛 Bug Fix

- Revert "Detect `context.projectMetadata.hasRouter` and send to the index" [#1121](https://github.com/chromaui/chromatic-cli/pull/1121) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.18.0 (Thu Nov 07 2024)

#### 🚀 Enhancement

- Detect `context.projectMetadata.hasRouter` and send to the index [#1112](https://github.com/chromaui/chromatic-cli/pull/1112) ([@tmeasday](https://github.com/tmeasday))

#### 🐛 Bug Fix

- :book: Add new issue template that references Chromatic support. [#1119](https://github.com/chromaui/chromatic-cli/pull/1119) ([@jwir3](https://github.com/jwir3))

#### Authors: 2

- Scott Johnson ([@jwir3](https://github.com/jwir3))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.17.0 (Thu Nov 07 2024)

#### 🚀 Enhancement

- :sparkles: Add support for JSON5 as a configuration file. [#1118](https://github.com/chromaui/chromatic-cli/pull/1118) ([@jwir3](https://github.com/jwir3))

#### Authors: 1

- Scott Johnson ([@jwir3](https://github.com/jwir3))

---

# v11.16.5 (Mon Nov 04 2024)

#### 🐛 Bug Fix

- Account for `rsbuild` stats JSON output and multiple locations [#1110](https://github.com/chromaui/chromatic-cli/pull/1110) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.16.4 (Mon Nov 04 2024)

#### 🐛 Bug Fix

- Ensure parent directory exists before writing log/diagnostics file [#1117](https://github.com/chromaui/chromatic-cli/pull/1117) ([@codykaup](https://github.com/codykaup))
- Fix `--diagnostics-file` parsing [#1116](https://github.com/chromaui/chromatic-cli/pull/1116) ([@codykaup](https://github.com/codykaup))
- Add steps for how to run builds against local CLI [#1113](https://github.com/chromaui/chromatic-cli/pull/1113) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.16.3 (Wed Oct 30 2024)

#### ⚠️ Pushed to `main`

- Revert "Add `ctx.projectMetadata.hasRouter`" ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.16.2 (Wed Oct 30 2024)

#### ⚠️ Pushed to `main`

- Add `ctx.projectMetadata.hasRouter` ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.16.1 (Fri Oct 25 2024)

#### 🐛 Bug Fix

- Handle ENOENT for bun as well as Node [#1108](https://github.com/chromaui/chromatic-cli/pull/1108) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 1

- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.16.0 (Fri Oct 25 2024)

#### 🚀 Enhancement

- Add support for `--build-command` for arbitrary build commands [#1109](https://github.com/chromaui/chromatic-cli/pull/1109) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.15.0 (Wed Oct 23 2024)

#### 🚀 Enhancement

- Add support for `logLevel` and `logPrefix` options, use local timestamp as default prefix [#1107](https://github.com/chromaui/chromatic-cli/pull/1107) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.14.0 (Mon Oct 21 2024)

#### 🚀 Enhancement

- Update task output to account for E2E [#1096](https://github.com/chromaui/chromatic-cli/pull/1096) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Switch to read-package-up from read-pkg-up [#1106](https://github.com/chromaui/chromatic-cli/pull/1106) ([@jmhobbs](https://github.com/jmhobbs))
- Only run `package-size` on pull request [#1105](https://github.com/chromaui/chromatic-cli/pull/1105) ([@codykaup](https://github.com/codykaup))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.13.0 (Mon Oct 21 2024)

#### 🚀 Enhancement

- Add new check to test the CLI action in merge queue [#1098](https://github.com/chromaui/chromatic-cli/pull/1098) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Fix `.env` parsing [#1104](https://github.com/chromaui/chromatic-cli/pull/1104) ([@codykaup](https://github.com/codykaup))
- Better handling of undefined values in branches [#1101](https://github.com/chromaui/chromatic-cli/pull/1101) ([@jmhobbs](https://github.com/jmhobbs))
- Setup workflow for PR checks [#1102](https://github.com/chromaui/chromatic-cli/pull/1102) ([@codykaup](https://github.com/codykaup))
- Rename new action job name for merge queue UI [#1100](https://github.com/chromaui/chromatic-cli/pull/1100) ([@codykaup](https://github.com/codykaup))
- Add context to sentinel upload failures. [#1094](https://github.com/chromaui/chromatic-cli/pull/1094) ([@jmhobbs](https://github.com/jmhobbs) [@codykaup](https://github.com/codykaup))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.12.6 (Thu Oct 17 2024)

#### 🐛 Bug Fix

- Add nicer formatting to TS bail reasons. [#1095](https://github.com/chromaui/chromatic-cli/pull/1095) ([@jmhobbs](https://github.com/jmhobbs) [@codykaup](https://github.com/codykaup))
- Fix GITHUB_REF check on release [#1093](https://github.com/chromaui/chromatic-cli/pull/1093) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.12.5 (Wed Oct 09 2024)

#### 🐛 Bug Fix

- Manually update `package.json` and `CHANGELOG.md` v4 [#1092](https://github.com/chromaui/chromatic-cli/pull/1092) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.12.4 (Wed Oct 09 2024)

#### 🐛 Bug Fix

- Manually update `package.json` and `CHANGELOG.md` v3 [#1091](https://github.com/chromaui/chromatic-cli/pull/1091) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.12.3 (Wed Oct 09 2024)

#### 🐛 Bug Fix

- Manually update `package.json` and `CHANGELOG.md` v2 [#1090](https://github.com/chromaui/chromatic-cli/pull/1090) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.12.2 (Wed Oct 09 2024)

#### 🐛 Bug Fix

- Manually update `package.json` and `CHANGELOG.md` [#1089](https://github.com/chromaui/chromatic-cli/pull/1089) ([@codykaup](https://github.com/codykaup))

#### Authors: 1

- Cody Kaup ([@codykaup](https://github.com/codykaup))

---

# v11.12.1 (Wed Oct 09 2024)

#### 🐛 Bug Fix

- Move deployment to single script [#1088](https://github.com/chromaui/chromatic-cli/pull/1088) ([@codykaup](https://github.com/codykaup))
- Migrate linting and tests to GitHub Actions [#1085](https://github.com/chromaui/chromatic-cli/pull/1085) ([@codykaup](https://github.com/codykaup))
- Add Sentry Releases [#1084](https://github.com/chromaui/chromatic-cli/pull/1084) ([@jmhobbs](https://github.com/jmhobbs))
- Fix CLI version output [#1079](https://github.com/chromaui/chromatic-cli/pull/1079) ([@codykaup](https://github.com/codykaup))
- Account for `--exit-zero-on-changes=true` [#1083](https://github.com/chromaui/chromatic-cli/pull/1083) ([@codykaup](https://github.com/codykaup))
- Do not run Sentry in dev [#1082](https://github.com/chromaui/chromatic-cli/pull/1082) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.12.0 (Tue Oct 08 2024)

#### 🚀 Enhancement

- Show steps for initializing a new Git repo [#1081](https://github.com/chromaui/chromatic-cli/pull/1081) ([@codykaup](https://github.com/codykaup))
- Add basic sentry integration to cli [#1036](https://github.com/chromaui/chromatic-cli/pull/1036) ([@jmhobbs](https://github.com/jmhobbs))
- Enable `unicorn/prevent-abbreviations` ESLint rule [#1064](https://github.com/chromaui/chromatic-cli/pull/1064) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Add TypeScript checking to CI pipeline [#1078](https://github.com/chromaui/chromatic-cli/pull/1078) ([@codykaup](https://github.com/codykaup))
- Upgrade `subdir` deps [#1077](https://github.com/chromaui/chromatic-cli/pull/1077) ([@codykaup](https://github.com/codykaup))
- Ignore duplication in test files and ignore all __mocks__ [#1073](https://github.com/chromaui/chromatic-cli/pull/1073) ([@codykaup](https://github.com/codykaup))
- Bump the npm_and_yarn group across 2 directories with 5 updates [#1076](https://github.com/chromaui/chromatic-cli/pull/1076) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump terser from 5.31.0 to 5.34.1 in the npm_and_yarn group across 1 directory [#1075](https://github.com/chromaui/chromatic-cli/pull/1075) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump the npm_and_yarn group across 2 directories with 7 updates [#1074](https://github.com/chromaui/chromatic-cli/pull/1074) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Fix remaining TypeScript errors and unable `strict: true` [#1072](https://github.com/chromaui/chromatic-cli/pull/1072) ([@codykaup](https://github.com/codykaup))
- Add `Empathy` and `CLI` labels to issue templates [#1071](https://github.com/chromaui/chromatic-cli/pull/1071) ([@codykaup](https://github.com/codykaup))
- Add TypeScript config from internal repo and fix some errors [#1070](https://github.com/chromaui/chromatic-cli/pull/1070) ([@codykaup](https://github.com/codykaup))
- Annotate Sentry events [#1069](https://github.com/chromaui/chromatic-cli/pull/1069) ([@jmhobbs](https://github.com/jmhobbs))
- Filter ANSI escape codes for Sentry [#1068](https://github.com/chromaui/chromatic-cli/pull/1068) ([@jmhobbs](https://github.com/jmhobbs))
- Do not capture config/option exceptions [#1067](https://github.com/chromaui/chromatic-cli/pull/1067) ([@jmhobbs](https://github.com/jmhobbs))
- Enable `unicorn/filename-case` ESLint rule [#1062](https://github.com/chromaui/chromatic-cli/pull/1062) ([@codykaup](https://github.com/codykaup))
- Enable `eslint-plugin-jsdoc` ESLint rule [#1066](https://github.com/chromaui/chromatic-cli/pull/1066) ([@codykaup](https://github.com/codykaup))
- Enable `unicorn/prefer-module` ESLint rule [#10[61](https://github.com/chromaui/chromatic-cli/actions/runs/11220330320/job/31188257361#step:6:62)](https://github.com/chromaui/chromatic-cli/pull/1061) ([@codykaup](https://github.com/codykaup))

#### Authors: 3

- [@dependabot[bot]](https://github.com/dependabot[bot])
- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.11.0 (Mon Sep 30 2024)

#### 🚀 Enhancement

- Include `storybookUrl` and `webUrl` on skipped rebuild [#1060](https://github.com/chromaui/chromatic-cli/pull/1060) ([@codykaup](https://github.com/codykaup))
- Enable `@typescript-eslint/no-floating-promises` ESLint rule [#1065](https://github.com/chromaui/chromatic-cli/pull/1065) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Enable `unicorn/no-null` ESLint rule [#1057](https://github.com/chromaui/chromatic-cli/pull/1057) ([@codykaup](https://github.com/codykaup))
- Enable `unicorn/no-array-reduce` ESLint rule [#1056](https://github.com/chromaui/chromatic-cli/pull/1056) ([@codykaup](https://github.com/codykaup))
- Track package size over time. [#1059](https://github.com/chromaui/chromatic-cli/pull/1059) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.10.4 (Tue Sep 24 2024)

#### 🐛 Bug Fix

- Revert "Use --stats-json flag for SB 8.0.0+" [#1058](https://github.com/chromaui/chromatic-cli/pull/1058) ([@jmhobbs](https://github.com/jmhobbs))
- Enable `unicorn/prefer-spread` ESLint rule [#1052](https://github.com/chromaui/chromatic-cli/pull/1052) ([@codykaup](https://github.com/codykaup))
- Enable `unicorn/better-regex` ESLint rule [#1055](https://github.com/chromaui/chromatic-cli/pull/1055) ([@codykaup](https://github.com/codykaup))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.10.3 (Mon Sep 23 2024)

#### 🐛 Bug Fix

- Use --stats-json flag for SB 8.0.0+ [#1049](https://github.com/chromaui/chromatic-cli/pull/1049) ([@jmhobbs](https://github.com/jmhobbs))
- Enable `unicorn/no-array-callback-reference` ESLint rule [#1051](https://github.com/chromaui/chromatic-cli/pull/1051) ([@codykaup](https://github.com/codykaup))
- Enable `unicorn/prefer-string-raw` ESLint rule [#1050](https://github.com/chromaui/chromatic-cli/pull/1050) ([@codykaup](https://github.com/codykaup))
- Enable `unicorn/no-anonymous-default-export` ESLint rule [#1047](https://github.com/chromaui/chromatic-cli/pull/1047) ([@codykaup](https://github.com/codykaup))
- Enable`unicorn/no-array-for-each` ESLint rule [#1048](https://github.com/chromaui/chromatic-cli/pull/1048) ([@codykaup](https://github.com/codykaup))
- GitHub action to add package size comment to PR [#1040](https://github.com/chromaui/chromatic-cli/pull/1040) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.10.2 (Fri Sep 13 2024)

#### 🐛 Bug Fix

- Revert "Use --stats-json flag for SB 8.0.0+" [#1046](https://github.com/chromaui/chromatic-cli/pull/1046) ([@maxcorbin](https://github.com/maxcorbin))
- Fix flaky verify timeout test [#1044](https://github.com/chromaui/chromatic-cli/pull/1044) ([@codykaup](https://github.com/codykaup))
- Fix flaky missing dependency test [#1043](https://github.com/chromaui/chromatic-cli/pull/1043) ([@codykaup](https://github.com/codykaup))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- Maxie ([@maxcorbin](https://github.com/maxcorbin))

---

# v11.10.1 (Thu Sep 12 2024)

#### 🐛 Bug Fix

- Use --stats-json flag for SB 8.0.0+ [#1035](https://github.com/chromaui/chromatic-cli/pull/1035) ([@jmhobbs](https://github.com/jmhobbs))
- Add basic `unicorn` setup to ESLint config [#1041](https://github.com/chromaui/chromatic-cli/pull/1041) ([@codykaup](https://github.com/codykaup))
- Update actions/upload-artifact to v4 [#1042](https://github.com/chromaui/chromatic-cli/pull/1042) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.10.0 (Thu Sep 12 2024)

#### 🚀 Enhancement

- Support storybook-rsbuild [#1032](https://github.com/chromaui/chromatic-cli/pull/1032) ([@joshwooding](https://github.com/joshwooding) [@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Remove pre-commit hook [#1039](https://github.com/chromaui/chromatic-cli/pull/1039) ([@codykaup](https://github.com/codykaup))
- Add initial ESLint config based on internal repo [#1037](https://github.com/chromaui/chromatic-cli/pull/1037) ([@codykaup](https://github.com/codykaup))
- Remove Chromatic staging CI step [#1038](https://github.com/chromaui/chromatic-cli/pull/1038) ([@codykaup](https://github.com/codykaup))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- Josh Wooding ([@joshwooding](https://github.com/joshwooding))

---

# v11.9.0 (Wed Sep 11 2024)

#### 🚀 Enhancement

- Fix initial TypeScript errors [#1033](https://github.com/chromaui/chromatic-cli/pull/1033) ([@codykaup](https://github.com/codykaup))

#### 🐛 Bug Fix

- Use the `--flag=value` format for Storybook build options [#1034](https://github.com/chromaui/chromatic-cli/pull/1034) ([@jmhobbs](https://github.com/jmhobbs))

#### Authors: 2

- Cody Kaup ([@codykaup](https://github.com/codykaup))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.8.0 (Tue Sep 10 2024)

#### 🚀 Enhancement

- Don't upload files from `.chromatic` directory [#1028](https://github.com/chromaui/chromatic-cli/pull/1028) ([@jmhobbs](https://github.com/jmhobbs) [@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))

---

# v11.7.1 (Wed Aug 14 2024)

#### 🐛 Bug Fix

- Add  key to configuration to fix #1022 [#1023](https://github.com/chromaui/chromatic-cli/pull/1023) ([@winkerVSbecks](https://github.com/winkerVSbecks))

#### Authors: 1

- Varun Vachhar ([@winkerVSbecks](https://github.com/winkerVSbecks))

---

# v11.7.0 (Wed Jul 31 2024)

#### 🚀 Enhancement

- test setting outOfSync to false [#1018](https://github.com/chromaui/chromatic-cli/pull/1018) ([@ethriel3695](https://github.com/ethriel3695))

#### Authors: 1

- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v11.6.0 (Wed Jul 31 2024)

#### 🚀 Enhancement

- Added logic to account for parentheses at the beginning [#1016](https://github.com/chromaui/chromatic-cli/pull/1016) ([@ethriel3695](https://github.com/ethriel3695))

#### Authors: 1

- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v11.5.6 (Fri Jul 19 2024)

#### 🐛 Bug Fix

- Support non-local ancestor builds with `uncommittedHash` [#1015](https://github.com/chromaui/chromatic-cli/pull/1015) ([@skitterm](https://github.com/skitterm) [@tmeasday](https://github.com/tmeasday))

#### Authors: 2

- Steven Kitterman ([@skitterm](https://github.com/skitterm))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.5.5 (Mon Jul 08 2024)

#### 🐛 Bug Fix

- Add missing skipUpdateCheck option to config schema [#1011](https://github.com/chromaui/chromatic-cli/pull/1011) ([@ryan-case-ml](https://github.com/ryan-case-ml))

#### Authors: 1

- Ryan Case ([@ryan-case-ml](https://github.com/ryan-case-ml))

---

# v11.5.4 (Wed Jun 12 2024)

#### 🐛 Bug Fix

- Ensure GitHub Action runs in specified version of node [#1006](https://github.com/chromaui/chromatic-cli/pull/1006) ([@tevanoff](https://github.com/tevanoff))
- Recommended files and ignored paths for yarn 4 [#1005](https://github.com/chromaui/chromatic-cli/pull/1005) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.5.3 (Thu Jun 06 2024)

#### 🐛 Bug Fix

- Clean package.json before compiling into source [#1003](https://github.com/chromaui/chromatic-cli/pull/1003) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.5.2 (Thu Jun 06 2024)

#### 🐛 Bug Fix

- Chore: Update the RegEx filter to pull out empty strings [#1004](https://github.com/chromaui/chromatic-cli/pull/1004) ([@ethriel3695](https://github.com/ethriel3695))

#### Authors: 1

- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v11.5.1 (Mon Jun 03 2024)

#### 🐛 Bug Fix

- Add fallback type for Storybook 6 builder syntax [#1001](https://github.com/chromaui/chromatic-cli/pull/1001) ([@ethriel3695](https://github.com/ethriel3695) [@ghengeveld](https://github.com/ghengeveld))
- Only replace *local* builds with uncommitted changes [#994](https://github.com/chromaui/chromatic-cli/pull/994) ([@ghengeveld](https://github.com/ghengeveld))
- Clean package.json before publishing [#999](https://github.com/chromaui/chromatic-cli/pull/999) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v11.5.0 (Fri May 31 2024)

#### 🚀 Enhancement

- Upgrade Storybook to 8.1 [#989](https://github.com/chromaui/chromatic-cli/pull/989) ([@ethriel3695](https://github.com/ethriel3695))

#### 🐛 Bug Fix

- Pass `SLACK_WEBHOOK_URL` to release script [#992](https://github.com/chromaui/chromatic-cli/pull/992) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v11.4.1 (Mon May 27 2024)

#### 🐛 Bug Fix

- Pass `CI=1` environment variable to Storybook build command to disable prompts [#991](https://github.com/chromaui/chromatic-cli/pull/991) ([@ghengeveld](https://github.com/ghengeveld))
- Setup Slack plugin for auto to notify on new CLI releases [#990](https://github.com/chromaui/chromatic-cli/pull/990) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.4.0 (Tue May 21 2024)

#### 🚀 Enhancement

- Use replacement build for baseline build with uncommitted changes [#988](https://github.com/chromaui/chromatic-cli/pull/988) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Remove console log [#979](https://github.com/chromaui/chromatic-cli/pull/979) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.3.5 (Wed May 15 2024)

#### 🐛 Bug Fix

- Use double quotes around command arguments [#985](https://github.com/chromaui/chromatic-cli/pull/985) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.3.4 (Wed May 15 2024)

#### 🐛 Bug Fix

- Fix dependency tracing when running from a subdirectory [#982](https://github.com/chromaui/chromatic-cli/pull/982) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.3.3 (Wed May 15 2024)

#### 🐛 Bug Fix

- Fix type declaration for `isChromatic` import [#986](https://github.com/chromaui/chromatic-cli/pull/986) ([@quantizor](https://github.com/quantizor) [@ethriel3695](https://github.com/ethriel3695))
- Specify the ts import resolver in the eslint config [#965](https://github.com/chromaui/chromatic-cli/pull/965) ([@paulelliott](https://github.com/paulelliott) [@thafryer](https://github.com/thafryer))

#### Authors: 4

- Evan Jacobs ([@quantizor](https://github.com/quantizor))
- Jarel Fryer ([@thafryer](https://github.com/thafryer))
- Paul Elliott ([@paulelliott](https://github.com/paulelliott))
- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v11.3.2 (Wed May 08 2024)

#### 🐛 Bug Fix

- Use current working directory as default value for `storybookBaseDir` [#976](https://github.com/chromaui/chromatic-cli/pull/976) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.3.1 (Tue May 07 2024)

#### 🐛 Bug Fix

- Properly check `storybookBaseDir` against repository root rather than CWD [#974](https://github.com/chromaui/chromatic-cli/pull/974) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.3.0 (Fri Mar 29 2024)

#### 🚀 Enhancement

- Throw user-friendly error when config file fails to parse as JSON [#961](https://github.com/chromaui/chromatic-cli/pull/961) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Suppress issues caused by missing Git remote [#962](https://github.com/chromaui/chromatic-cli/pull/962) ([@ghengeveld](https://github.com/ghengeveld))
- Trim `v` prefix from shipIt's version to avoid double prefixing tags [#960](https://github.com/chromaui/chromatic-cli/pull/960) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v11.2.0 (Wed Mar 20 2024)

#### 🚀 Enhancement

- Allow passing both `buildScriptName` and `storybookBuildDir` [#934](https://github.com/chromaui/chromatic-cli/pull/934) (WOU@kmd.dk [@woutervanvliet](https://github.com/woutervanvliet) [@ghengeveld](https://github.com/ghengeveld))

#### Authors: 3

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Wouter van Vliet ([@woutervanvliet](https://github.com/woutervanvliet))
- Wouter van Vliet (WOU) (WOU@kmd.dk)

---

# v11.1.1 (Wed Mar 20 2024)

#### 🐛 Bug Fix

- Properly handle GitHub Action inputs that can have multiple values [#951](https://github.com/chromaui/chromatic-cli/pull/951) ([@tevanoff](https://github.com/tevanoff))
- Fix GitHub Action release script using data from Auto shipIt hook rather than from Git [#956](https://github.com/chromaui/chromatic-cli/pull/956) ([@ghengeveld](https://github.com/ghengeveld))
- Bump ip from 2.0.0 to 2.0.1 [#925](https://github.com/chromaui/chromatic-cli/pull/925) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump vite from 4.4.9 to 4.5.2 [#895](https://github.com/chromaui/chromatic-cli/pull/895) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump ip from 1.1.5 to 1.1.9 in /subdir [#926](https://github.com/chromaui/chromatic-cli/pull/926) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump semver from 5.7.1 to 5.7.2 in /subdir [#786](https://github.com/chromaui/chromatic-cli/pull/786) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer) [@ghengeveld](https://github.com/ghengeveld))

#### Authors: 4

- [@dependabot[bot]](https://github.com/dependabot[bot])
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Jarel Fryer ([@thafryer](https://github.com/thafryer))
- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.1.0 (Tue Mar 19 2024)

#### 🚀 Enhancement

- Add `skipUpdateCheck` option [#928](https://github.com/chromaui/chromatic-cli/pull/928) ([@work933k](https://github.com/work933k) [@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Report code coverage to Codacy [#950](https://github.com/chromaui/chromatic-cli/pull/950) ([@paulelliott](https://github.com/paulelliott))
- Fixes for various issues reported by Codacy [#947](https://github.com/chromaui/chromatic-cli/pull/947) ([@ghengeveld](https://github.com/ghengeveld))
- Restrict permissions in GitHub Action workflows [#946](https://github.com/chromaui/chromatic-cli/pull/946) ([@ghengeveld](https://github.com/ghengeveld))
- Tell SB8 users to pass `--stats-json` rather than `--webpack-stats-json` [#948](https://github.com/chromaui/chromatic-cli/pull/948) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 4

- [@work933k](https://github.com/work933k)
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Paul Elliott ([@paulelliott](https://github.com/paulelliott))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v11.0.8 (Mon Mar 11 2024)

#### 🐛 Bug Fix

- Fix e2e peer dep versions [#943](https://github.com/chromaui/chromatic-cli/pull/943) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.0.7 (Fri Mar 08 2024)

#### 🐛 Bug Fix

- Prevent non-string or null message in timestamp logging from causing exit code 254 during build. [#931](https://github.com/chromaui/chromatic-cli/pull/931) ([@BenjaminEllisSo](https://github.com/BenjaminEllisSo))

#### Authors: 1

- [@BenjaminEllisSo](https://github.com/BenjaminEllisSo)

---

# v11.0.6 (Thu Mar 07 2024)

#### 🐛 Bug Fix

- Expose E2E build errors [#940](https://github.com/chromaui/chromatic-cli/pull/940) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.0.5 (Thu Mar 07 2024)

#### 🐛 Bug Fix

- escape special characters in onlyStoryFiles filenames [#942](https://github.com/chromaui/chromatic-cli/pull/942) ([@JonathanKolnik](https://github.com/JonathanKolnik))

#### Authors: 1

- Jono Kolnik ([@JonathanKolnik](https://github.com/JonathanKolnik))

---

# v11.0.4 (Wed Mar 06 2024)

#### 🐛 Bug Fix

- Do not prompt to install chromatic script during E2E builds [#941](https://github.com/chromaui/chromatic-cli/pull/941) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v11.0.3 (Wed Mar 06 2024)

#### 🐛 Bug Fix

- Display full error message when storybookBaseDir is invalid [#932](https://github.com/chromaui/chromatic-cli/pull/932) ([@andrewortwein](https://github.com/andrewortwein))

#### Authors: 1

- Andrew Ortwein ([@andrewortwein](https://github.com/andrewortwein))

---

# v11.0.2 (Tue Mar 05 2024)

#### 🐛 Bug Fix

- Fix support for boolean value to `junitReport` option [#937](https://github.com/chromaui/chromatic-cli/pull/937) ([@thafryer](https://github.com/thafryer))

#### Authors: 1

- Jarel Fryer ([@thafryer](https://github.com/thafryer))

---

# v11.0.1 (Tue Mar 05 2024)

#### 🐛 Bug Fix

- Allow commit hash to not be known when finding merge queue PR number [#929](https://github.com/chromaui/chromatic-cli/pull/929) ([@adrianbruntonsagecom](https://github.com/adrianbruntonsagecom))

#### Authors: 1

- Adrian Brunton ([@adrianbruntonsagecom](https://github.com/adrianbruntonsagecom))

---

# v11.0.0 (Thu Feb 22 2024)

#### 💥 Breaking Change

- Add new invalid sb base dir error message and validator function [#921](https://github.com/chromaui/chromatic-cli/pull/921) ([@andrewortwein](https://github.com/andrewortwein) [@ethriel3695](https://github.com/ethriel3695))

#### Authors: 2

- Andrew Ortwein ([@andrewortwein](https://github.com/andrewortwein))
- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v10.9.6 (Fri Feb 16 2024)

#### 🐛 Bug Fix

- Avoid build verify timeout when waiting for upgrade builds [#922](https://github.com/chromaui/chromatic-cli/pull/922) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v10.9.5 (Wed Feb 14 2024)

#### 🐛 Bug Fix

- Fix Storybook published messaging [#920](https://github.com/chromaui/chromatic-cli/pull/920) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v10.9.4 (Mon Feb 12 2024)

#### 🐛 Bug Fix

- Allow `traceChanged` in Chromatic config spec [#916](https://github.com/chromaui/chromatic-cli/pull/916) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v10.9.3 (Fri Feb 09 2024)

#### 🐛 Bug Fix

- clean up debug log as it's too much noise [#919](https://github.com/chromaui/chromatic-cli/pull/919) ([@ethriel3695](https://github.com/ethriel3695))

#### Authors: 1

- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))

---

# v10.9.2 (Thu Feb 08 2024)

#### 🐛 Bug Fix

- Directly execute build-archive-storybook if we can't resolve it [#917](https://github.com/chromaui/chromatic-cli/pull/917) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v10.9.1 (Thu Feb 08 2024)

#### 🐛 Bug Fix

- Add missing `fileHashing` option to GitHub Action [#918](https://github.com/chromaui/chromatic-cli/pull/918) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v10.9.0 (Wed Feb 07 2024)

#### 🚀 Enhancement

- Be smarter about comparing lock files [#912](https://github.com/chromaui/chromatic-cli/pull/912) ([@ghengeveld](https://github.com/ghengeveld) [@tmeasday](https://github.com/tmeasday))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v10.8.0 (Tue Feb 06 2024)

#### 🚀 Enhancement

- Expose `repositoryRootDir`, `configFile` and fix `diagnosticsFile` [#913](https://github.com/chromaui/chromatic-cli/pull/913) ([@ghengeveld](https://github.com/ghengeveld))
- Support `env`, `sessionId` and `log` options via Node API [#897](https://github.com/chromaui/chromatic-cli/pull/897) ([@work933k](https://github.com/work933k))
- Add timestamps to debug and file logging [#907](https://github.com/chromaui/chromatic-cli/pull/907) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- [@work933k](https://github.com/work933k)
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v10.7.1 (Fri Feb 02 2024)

#### 🐛 Bug Fix

- Add Fallback getGitInfo if we cannot find the origin URL [#910](https://github.com/chromaui/chromatic-cli/pull/910) ([@thafryer](https://github.com/thafryer))

#### Authors: 1

- Jarel Fryer ([@thafryer](https://github.com/thafryer))

---

# v10.7.0 (Fri Feb 02 2024)

#### 🚀 Enhancement

- Rename E2E peer dependencies [#909](https://github.com/chromaui/chromatic-cli/pull/909) ([@tevanoff](https://github.com/tevanoff))

#### Authors: 1

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))

---

# v10.6.1 (Fri Jan 26 2024)

#### 🐛 Bug Fix

- Remove after-release script [#906](https://github.com/chromaui/chromatic-cli/pull/906) ([@skitterm](https://github.com/skitterm))

#### Authors: 1

- Steven Kitterman ([@skitterm](https://github.com/skitterm))

---

# v10.6.0 (Fri Jan 26 2024)

#### 🚀 Enhancement

- CLI should throw error when using TurboSnap but missing a stats file. [#899](https://github.com/chromaui/chromatic-cli/pull/899) ([@thafryer](https://github.com/thafryer))

#### Authors: 1

- Jarel Fryer ([@thafryer](https://github.com/thafryer))

---

# v10.5.2 (Thu Jan 25 2024)

#### 🐛 Bug Fix

- Remove latest from the chromatic package in Init script [#902](https://github.com/chromaui/chromatic-cli/pull/902) ([@thafryer](https://github.com/thafryer))

#### Authors: 1

- Jarel Fryer ([@thafryer](https://github.com/thafryer))

---

# v10.5.1 (Thu Jan 25 2024)

#### 🐛 Bug Fix

- Add "package.json" to exports map [#900](https://github.com/chromaui/chromatic-cli/pull/900) ([@yannbf](https://github.com/yannbf))
- Improve logging around upload errors [#894](https://github.com/chromaui/chromatic-cli/pull/894) ([@ghengeveld](https://github.com/ghengeveld))
- Don't skip uploading of empty files, it works now [#901](https://github.com/chromaui/chromatic-cli/pull/901) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Yann Braga ([@yannbf](https://github.com/yannbf))

---

# v10.5.0 (Wed Jan 24 2024)

#### 🚀 Enhancement

- Add `--playwright` & `--cypress` flags [#882](https://github.com/chromaui/chromatic-cli/pull/882) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 1

- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v10.4.0 (Tue Jan 23 2024)

#### 🚀 Enhancement

- Add new Init command for Project Setup [#880](https://github.com/chromaui/chromatic-cli/pull/880) ([@thafryer](https://github.com/thafryer))

#### Authors: 1

- Jarel Fryer ([@thafryer](https://github.com/thafryer))

---

# v10.3.1 (Wed Jan 17 2024)

#### 🐛 Bug Fix

- Fix potential zip upload error when deduping files on a very large Storybook [#892](https://github.com/chromaui/chromatic-cli/pull/892) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v10.3.0 (Tue Jan 16 2024)

#### 🚀 Enhancement

- Add missing `skip` option to configuration schema [#890](https://github.com/chromaui/chromatic-cli/pull/890) ([@ghengeveld](https://github.com/ghengeveld))
- Detect merge queue branch and retrieve real branch name from pull request [#884](https://github.com/chromaui/chromatic-cli/pull/884) ([@JonathanKolnik](https://github.com/JonathanKolnik) [@ghengeveld](https://github.com/ghengeveld))
- Deduplicate files to be uploaded using file hashing [#875](https://github.com/chromaui/chromatic-cli/pull/875) ([@ghengeveld](https://github.com/ghengeveld))
- Replace upload mechanism to use a batched mutation with a new API [#888](https://github.com/chromaui/chromatic-cli/pull/888) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Retrieve `sentinelUrls` from `uploadBuild` and wait for all of them before finishing upload task [#878](https://github.com/chromaui/chromatic-cli/pull/878) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Jono Kolnik ([@JonathanKolnik](https://github.com/JonathanKolnik))

---

# v10.2.2 (Fri Jan 12 2024)

#### 🐛 Bug Fix

- Add configFile option to GitHub Action [#885](https://github.com/chromaui/chromatic-cli/pull/885) ([@wisestuart](https://github.com/wisestuart))

#### Authors: 1

- Stuart Hammar ([@wisestuart](https://github.com/wisestuart))

---

# v10.2.1 (Wed Jan 10 2024)

#### 🐛 Bug Fix

- Revert "Replace `getUploadUrls` with `uploadBuild` mutation" [#883](https://github.com/chromaui/chromatic-cli/pull/883) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Run publish-action script as afterShipIt hook [#877](https://github.com/chromaui/chromatic-cli/pull/877) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Jono Kolnik ([@JonathanKolnik](https://github.com/JonathanKolnik))

---

# v10.2.0 (Thu Dec 21 2023)

#### 🚀 Enhancement

- Replace `getUploadUrls` with `uploadBuild` mutation [#876](https://github.com/chromaui/chromatic-cli/pull/876) ([@ghengeveld](https://github.com/ghengeveld))
- Implement file hashing for to-be-uploaded files [#870](https://github.com/chromaui/chromatic-cli/pull/870) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Allow overriding `NODE_ENV` with `STORYBOOK_NODE_ENV` [#879](https://github.com/chromaui/chromatic-cli/pull/879) ([@tmeasday](https://github.com/tmeasday))
- Use code splitting in tsup CJS output [#873](https://github.com/chromaui/chromatic-cli/pull/873) ([@tmeasday](https://github.com/tmeasday))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v10.1.0 (Thu Dec 07 2023)

#### 🚀 Enhancement

- Increase number of commits checked for squash merge [#866](https://github.com/chromaui/chromatic-cli/pull/866) ([@tmeasday](https://github.com/tmeasday) [@tevanoff](https://github.com/tevanoff))

#### Authors: 2

- Todd Evanoff ([@tevanoff](https://github.com/tevanoff))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v10.0.0 (Fri Dec 01 2023)

#### 💥 Breaking Change

- Force `NODE_ENV=production` for Storybook builds through the CLI [#865](https://github.com/chromaui/chromatic-cli/pull/865) ([@tmeasday](https://github.com/tmeasday))

#### 🐛 Bug Fix

- Support pinning GitHub Action to major or patch version [#863](https://github.com/chromaui/chromatic-cli/pull/863) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))

---

# v9.1.0 (Fri Nov 17 2023)

#### 🚀 Enhancement

- Don't write `chromatic.log` by default, allow configuring log files [#855](https://github.com/chromaui/chromatic-cli/pull/855) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Redact `userToken` in diagnostics and fatal error output [#859](https://github.com/chromaui/chromatic-cli/pull/859) ([@ghengeveld](https://github.com/ghengeveld))
- Bump zod from 3.22.2 to 3.22.3 [#830](https://github.com/chromaui/chromatic-cli/pull/830) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer))
- Bump word-wrap from 1.2.3 to 1.2.5 [#804](https://github.com/chromaui/chromatic-cli/pull/804) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer))
- Bump get-func-name from 2.0.0 to 2.0.2 [#824](https://github.com/chromaui/chromatic-cli/pull/824) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer))
- Bump @babel/traverse from 7.16.3 to 7.23.2 in /subdir [#838](https://github.com/chromaui/chromatic-cli/pull/838) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer))
- Fix changelog for 9.0.0 and update auto config to prevent issue in the future [#854](https://github.com/chromaui/chromatic-cli/pull/854) ([@ghengeveld](https://github.com/ghengeveld))

#### ⚠️ Pushed to `main`

- Drop next-release label ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 3

- [@dependabot[bot]](https://github.com/dependabot[bot])
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Jarel Fryer ([@thafryer](https://github.com/thafryer))

---

# v9.0.0 (Fri Nov 10 2023)

#### 🚀 Enhancement

- Support `projectId` + `userToken` as alternative to `projectToken` for auth [#852](https://github.com/chromaui/chromatic-cli/pull/852) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v8.0.0 (Thu Nov 09 2023)

#### 💥 Breaking Change

- Drop official support for Node 14/16 [#839](https://github.com/chromaui/chromatic-cli/pull/839) ([@ghengeveld](https://github.com/ghengeveld))

#### 🚀 Enhancement

- Merge Group (Queues) GitHub Action Event Support [#825](https://github.com/chromaui/chromatic-cli/pull/825) ([@mhemmings](https://github.com/mhemmings) [@thafryer](https://github.com/thafryer))

#### 🐛 Bug Fix

- Bump browserify-sign from 4.2.1 to 4.2.2 [#848](https://github.com/chromaui/chromatic-cli/pull/848) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump semver from 7.3.5 to 7.5.2 [#778](https://github.com/chromaui/chromatic-cli/pull/778) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump browserify-sign from 4.2.1 to 4.2.2 in /subdir [#849](https://github.com/chromaui/chromatic-cli/pull/849) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer))
- Configure auto with `prerelease` setting and update readme [#847](https://github.com/chromaui/chromatic-cli/pull/847) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 4

- [@dependabot[bot]](https://github.com/dependabot[bot])
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Jarel Fryer ([@thafryer](https://github.com/thafryer))
- Mark Hemmings ([@mhemmings](https://github.com/mhemmings))

---

# v7.6.0 (Tue Oct 31 2023)

#### 🚀 Enhancement

- Merge Group (Queues) GitHub Action Event Support [#825](https://github.com/chromaui/chromatic-cli/pull/825) ([@mhemmings](https://github.com/mhemmings) [@thafryer](https://github.com/thafryer))

#### 🐛 Bug Fix

- Configure auto with `prerelease` setting and update readme [#847](https://github.com/chromaui/chromatic-cli/pull/847) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 3

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Jarel Fryer ([@thafryer](https://github.com/thafryer))
- Mark Hemmings ([@mhemmings](https://github.com/mhemmings))

---

# v7.5.4 (Thu Oct 26 2023)

#### 🐛 Bug Fix

- Configure auto with `prerelease` setting and update readme [#847](https://github.com/chromaui/chromatic-cli/pull/847) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.5.3 (Thu Oct 26 2023)

#### 🐛 Bug Fix

- Fix config for Auto and add `next-release` tag to trigger a `next` release [#846](https://github.com/chromaui/chromatic-cli/pull/846) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.5.2 (Thu Oct 26 2023)

#### 🐛 Bug Fix

- Fix `ENOENT` when uploading stats file with `--upload-metadata` [#843](https://github.com/chromaui/chromatic-cli/pull/843) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.5.1 (Thu Oct 26 2023)

#### 🐛 Bug Fix

- Fix use of `LoggingRenderer` after bad merge [#845](https://github.com/chromaui/chromatic-cli/pull/845) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.5.0 (Tue Oct 24 2023)

#### 🚀 Enhancement

- Write to log file and add `--upload-metadata` to publish metadata files [#836](https://github.com/chromaui/chromatic-cli/pull/836) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Add workflow to require certain PR labels before merging [#841](https://github.com/chromaui/chromatic-cli/pull/841) ([@ghengeveld](https://github.com/ghengeveld))
- Fix reading `diagnostics` from undefined [#840](https://github.com/chromaui/chromatic-cli/pull/840) ([@ghengeveld](https://github.com/ghengeveld))
- Only release 'latest' GitHub Action from `main` branch [#837](https://github.com/chromaui/chromatic-cli/pull/837) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.4.0 (Fri Oct 13 2023)

#### 🚀 Enhancement

- Support untraced flag in dependency tracing fallback scenario (for pnpm) [#835](https://github.com/chromaui/chromatic-cli/pull/835) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Improvements to auto release workflow [#832](https://github.com/chromaui/chromatic-cli/pull/832) ([@chromatic-support](https://github.com/chromatic-support) [@ghengeveld](https://github.com/ghengeveld))

#### Authors: 2

- [@chromatic-support](https://github.com/chromatic-support)
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.3.0 (Tue Oct 10 2023)

#### 🚀 Enhancement

- Pass runtime metadata in `announceBuild` [#826](https://github.com/chromaui/chromatic-cli/pull/826) ([@ghengeveld](https://github.com/ghengeveld))

#### 🐛 Bug Fix

- Gracefully handle gpg signature info in `git log` output [#833](https://github.com/chromaui/chromatic-cli/pull/833) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.2.3 (Fri Oct 06 2023)

#### 🐛 Bug Fix

- Fix dependency tracing for monorepos with no `package.json` at the repository root [#827](https://github.com/chromaui/chromatic-cli/pull/827) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.2.2 (Wed Oct 04 2023)

#### ⚠️ Pushed to `main`

- Clean up auto-generated changelog ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# v7.2.1 (Wed Oct 04 2023)

#### 🐛 Bug Fix

- Add `experimental_abortSignal` to Node API to allow canceling builds [#822](https://github.com/chromaui/chromatic-cli/pull/822) ([@ghengeveld](https://github.com/ghengeveld))
- Migrate from Jest to Vitest, update ESLint config and upgrade Execa [#821](https://github.com/chromaui/chromatic-cli/pull/821) ([@ghengeveld](https://github.com/ghengeveld))
- Replace release script with auto shipit [#828](https://github.com/chromaui/chromatic-cli/pull/828) ([@ghengeveld](https://github.com/ghengeveld))

#### Authors: 1

- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))

---

# 7.2.0 - 2023-09-19

- [814](https://github.com/chromaui/chromatic-cli/pull/814) Add support for a JSON configuration file
- [819](https://github.com/chromaui/chromatic-cli/pull/819) No longer log to loggly

# 7.1.0 - 2023-09-07

- [812](https://github.com/chromaui/chromatic-cli/pull/812) Allow running a build from a repo with only one commit when not in CI
- [810](https://github.com/chromaui/chromatic-cli/pull/810) Add `onTaskStart`, and a new typed field `ctx.task`
- [808](https://github.com/chromaui/chromatic-cli/pull/808) Add `onTaskError` option to report errors to node consumers
- [813](https://github.com/chromaui/chromatic-cli/pull/813) Rename `onTaskError` to `experimental_onTaskError`

# 7.0.0 - 2023-09-04

- [789](https://github.com/chromaui/chromatic-cli/pull/789) Use `@antfu/ni` to support `pnpm` for Storybook build
- [805](https://github.com/chromaui/chromatic-cli/pull/805) Add a `onTaskProgress` option and report progress on it

This is a potentially breaking change due to the introduction of [@antfu/ni](https://github.com/antfu/ni) to handle running the `storybook build` command in the **Build Storybook** step.

# 6.24.1 - 2023-08-25

- [803](https://github.com/chromaui/chromatic-cli/pull/803) Support Mode Name as Suffix for Build Progress Indicator

# 6.24.0 - 2023-08-24

- [801](https://github.com/chromaui/chromatic-cli/pull/801) Fix `Unexpected build status: PREPARED` error
- [802](https://github.com/chromaui/chromatic-cli/pull/802) Include all commit info in `GitInfo`

# 6.23.1 - 2023-08-24

- [800](https://github.com/chromaui/chromatic-cli/pull/800) Fix type signature for `runAll` and `runBuild`

# 6.23.0 - 2023-08-22

- [795](https://github.com/chromaui/chromatic-cli/pull/795) Add `--local` flag and pass to builds as `isLocalBuild`
- [796](https://github.com/chromaui/chromatic-cli/pull/796) Pass `gitUserEmailHash` up with new builds and use `localBuilds` filter in baseline calculations

# 6.22.0 - 2023-08-15

- [798](https://github.com/chromaui/chromatic-cli/pull/798) Calculate and record `uncommittedHash` when creating a build

# 6.21.0 - 2023-08-07

- [794](https://github.com/chromaui/chromatic-cli/pull/794) Add `getGitInfo` function exported by the Node API
- [780](https://github.com/chromaui/chromatic-cli/pull/780) Add support for `schedule` GitHub Action workflow trigger
- [793](https://github.com/chromaui/chromatic-cli/pull/793) Update snyk parser and added tests for yarn berry

# 6.20.0 - 2023-07-21

- [788](https://github.com/chromaui/chromatic-cli/pull/788) Track Build ID for Storybook Uploads

# 6.19.9 - 2023-06-22

- [734](https://github.com/chromaui/chromatic-cli/pull/734) Add support for `release` event to Github action.
- [750](https://github.com/chromaui/chromatic-cli/pull/750) Update CI to store tokens in environment variables
- [775](https://github.com/chromaui/chromatic-cli/pull/775) Increase timeout for Git command(s) execution

# 6.19.8 - 2023-06-16

- [765](https://github.com/chromaui/chromatic-cli/pull/765) Add some fields to package.json to help resolve types in entrypoints
- [773](https://github.com/chromaui/chromatic-cli/pull/773) Bump the Loggly Dependency

# 6.19.7 - 2023-06-14

- [770](https://github.com/chromaui/chromatic-cli/pull/770) Ensure we exit with a code at the end

# 6.19.6 - 2023-06-14

- [768](https://github.com/chromaui/chromatic-cli/pull/768) Add `isChromatic` exports

# 6.19.5 - 2023-06-14

- [763](https://github.com/chromaui/chromatic-cli/pull/763) Fix issue with onTaskComplete callback

# 6.19.5 - 2023-06-12

- [763](https://github.com/chromaui/chromatic-cli/pull/763) Fix issue with `onTaskComplete` callback

# 6.19.4 - 2023-06-12

- [764](https://github.com/chromaui/chromatic-cli/pull/764) Move all depenendencies to dev deps

# 6.19.2 - 2023-06-12

- [756](https://github.com/chromaui/chromatic-cli/pull/756) Added onTaskComplete callback option
- [755](https://github.com/chromaui/chromatic-cli/pull/755) Add a node entry point

# 6.18.2 - 2023-06-07

- [758](https://github.com/chromaui/chromatic-cli/pull/758) Add additional logging for turbosnap
- [753](https://github.com/chromaui/chromatic-cli/pull/753) Update getStorybookMetadata to safely record version even if fails to parse mainConfig

# 6.18.0 - 2023-05-03

- [737](https://github.com/chromaui/chromatic-cli/pull/737) Better discovery for TurboSnap trace-changed and related directories
- [747](https://github.com/chromaui/chromatic-cli/pull/747) Fix Storybook config detection by adding serverRequire to interpret files

# 6.17.4 - 2023-05-03

- [738](https://github.com/chromaui/chromatic-cli/pull/738) Get the builder name and version via the mainConfig for SB v7+
- [743](https://github.com/chromaui/chromatic-cli/pull/743) Bump Snyk lockfile parser dependency

# 6.17.3 - 2023-04-05

- [730](https://github.com/chromaui/chromatic-cli/pull/730) Disconnect preserveMissing from `--only-story-names` flag

# 6.17.2 - 2023-03-17

- [726](https://github.com/chromaui/chromatic-cli/pull/726) Increase timeout on Storybook Verification
- [725](https://github.com/chromaui/chromatic-cli/pull/725) Bump webpack from 5.72.1 to 5.76.0
- [711](https://github.com/chromaui/chromatic-cli/pull/711) Bump http-cache-semantics from 4.1.0 to 4.1.1

# 6.17.1 - 2023-02-24

- [718](https://github.com/chromaui/chromatic-cli/pull/718) Update `changedFiles` target to fix broken trace utility

# 6.17.0 - 2023-02-07

- [695](https://github.com/chromaui/chromatic-cli/pull/695) Omit `inputs` for `workflow_dispatch` event in GitHub Action
- [713](https://github.com/chromaui/chromatic-cli/pull/713) Add support for `issue_comment` event in GitHub Action

# 6.15.0 - 2023-01-23

- [710](https://github.com/chromaui/chromatic-cli/pull/710) Add `--repository-slug` flag to CLI, and `repositorySlug` + `branchName` options to GitHub Action

# 6.14.0 - 2022-12-19

- [683](https://github.com/chromaui/chromatic-cli/pull/683) Enhanced TurboSnap: Trace dependency changes instead of bailing out
- [694](https://github.com/chromaui/chromatic-cli/pull/694) Remove tunnel flags

# 6.13.1 - 2022-12-14

- [700](https://github.com/chromaui/chromatic-cli/pull/700) Revert "Don't bundle package.json but rely on meow's runtime value instead"

# 6.13.0 - 2022-12-13

- [676](https://github.com/chromaui/chromatic-cli/pull/676) Log message when TurboSnap is unavailable
- [671](https://github.com/chromaui/chromatic-cli/pull/671) Don't bundle package.json but rely on meow's runtime value instead
- [675](https://github.com/chromaui/chromatic-cli/pull/675) Output progress updates in non-interactive mode every 10 seconds

# 6.12.0 - 2022-12-09

- [685](https://github.com/chromaui/chromatic-cli/pull/685) Support custom DNS IP and DNS failover IP using custom DNS resolver
- [689](https://github.com/chromaui/chromatic-cli/pull/689) Improve the failure message when there's only one git commit

# 6.11.3 - 2022-10-31

- [670](https://github.com/chromaui/chromatic-cli/pull/670) Trace command errors for package manifest change
- [659](https://github.com/chromaui/chromatic-cli/pull/659) Add interactionTestFailuresCount to GitHub Action output
- [660](https://github.com/chromaui/chromatic-cli/pull/660) Update GitHub Action to Node 16
- [644](https://github.com/chromaui/chromatic-cli/pull/644) Bump node-fetch from 3.0.0 to 3.2.10
- [666](https://github.com/chromaui/chromatic-cli/pull/666) Bump @actions/core from ^1.5.0 to ^1.10.0

# 6.11.2 - 2022-10-26

- [667](https://github.com/chromaui/chromatic-cli/pull/667) Edit package file detection process for the untraced flag

# 6.11.1 - 2022-10-25

- [665](https://github.com/chromaui/chromatic-cli/pull/665) Added onlyStoryFiles to the github action

# 6.11.0 - 2022-10-24

- [648](https://github.com/chromaui/chromatic-cli/pull/648) TurboSnap not bailed if package manifest change isn't dependency-related

# 6.10.5 - 2022-10-20

- [661](https://github.com/chromaui/chromatic-cli/pull/661) Add `debug` as an option to the GH action

# 6.10.3 - 2022-10-19

- [651](https://github.com/chromaui/chromatic-cli/pull/651) Update buildHasErrors with interaction test failure specific messaging

# 6.10.2 - 2022-10-11

- [649](https://github.com/chromaui/chromatic-cli/pull/649) Fix TurboSnap for module names containing URL params in stats file
- [650](https://github.com/chromaui/chromatic-cli/pull/650) Ensure all GitHub Action outputs are exposed

# 6.10.1 - 2022-09-27

- [645](https://github.com/chromaui/chromatic-cli/pull/645) Check onlyStoryNames is non-empty

# 6.10.0 - 2022-09-23

- [620](https://github.com/chromaui/chromatic-cli/pull/620) Add various counts as GitHub Action outputs
- [643](https://github.com/chromaui/chromatic-cli/pull/643) Fix implied `--preserve-missing` for `--only-story-names`

# 6.9.0 - 2022-09-02

- [634](https://github.com/chromaui/chromatic-cli/pull/634) Add `--only-story-files` flag
- [565](https://github.com/chromaui/chromatic-cli/pull/565) Add tests for `--untraced` flag validation
- [636](https://github.com/chromaui/chromatic-cli/pull/636) Suggest using `--force-rebuild` when skipping rebuild

# 6.8.1 - 2022-09-01

- [635](https://github.com/chromaui/chromatic-cli/pull/635) Retry queries by default and allow even more retries for `FirstCommittedAtQuery`
- [607](https://github.com/chromaui/chromatic-cli/pull/607) Bump terser from 4.8.0 to 4.8.1
- [601](https://github.com/chromaui/chromatic-cli/pull/601) Bump moment from 2.29.1 to 2.29.4
- [594](https://github.com/chromaui/chromatic-cli/pull/594) Bump shell-quote from 1.7.2 to 1.7.3
- [553](https://github.com/chromaui/chromatic-cli/pull/553) Bump minimist from 1.2.5 to 1.2.6
- [631](https://github.com/chromaui/chromatic-cli/pull/631) Bump @actions/core from 1.5.0 to 1.9.1

# 6.8.0 - 2022-08-26

- [630](https://github.com/chromaui/chromatic-cli/pull/630) Rename `--only` to `--only-story-names` but keep it as a deprecated alias
- [629](https://github.com/chromaui/chromatic-cli/pull/629) Deprecate `--preserve-missing` and raise a warning if it's being used

### Use TurboSnap instead of `preserveMissing`

In order to support advanced use cases where only a subset of stories would be included in a Storybook, the `--preserve-missing` flag could be used to prevent excluded stories from being marked as "removed" in Chromatic. This behavior could lead to problematic situations regarding infrastructure upgrades and cause truly removed stories to never be removed from Chromatic. That's why we are sunsetting the "preserve missing" behavior. As of v6.8.0, using this flag will raise a warning message in the CLI. In a future major version, the flag will be removed completely, and continuing to use it with an older CLI version will start to fail your build.

To upgrade, you should remove the `--preserve-missing` flag from your CI and/or `package.json` scripts. If you use our GitHub Action, you should remove the `preserveMissing` input (`with: ...`) from your workflow config file. Furthermore, you should make sure that your `build-storybook` script builds _all_ stories, not just a subset. Check your `stories` configuration in `.storybook/main.js` so it doesn't omit any stories (e.g. based on an environment variable).

Most likely you were using `preserveMissing` to cut down on the number of snapshots taken by Chromatic. To achieve the same goal, you have three options:

- Recommended: Use [TurboSnap](https://www.chromatic.com/docs/turbosnap) to automatically only snapshot stories for which related source files have changed.
- Use [`--only-story-names`](https://www.chromatic.com/docs/cli#chromatic-options) to only snapshot stories matching a glob pattern by component/story name.
- (Soon) Use [`--only-story-files`](https://www.chromatic.com/docs/cli#chromatic-options) to only snapshot stories matching a glob pattern by story filename.

In each of these cases, any stories that aren't captured are "inherited" from their baseline.

# 6.7.4 - 2022-08-11

- [624](https://github.com/chromaui/chromatic-cli/pull/624) Read Webpack stats file as stream to support very large projects

# 6.7.3 - 2022-08-01

- [621](https://github.com/chromaui/chromatic-cli/pull/621) Add `addon-interactions` to list of supported addons

# 6.7.2 - 2022-07-28

- [615](https://github.com/chromaui/chromatic-cli/pull/615) Changed trim stats to stream and added test

# 6.7.1 - 2022-07-22

- [612](https://github.com/chromaui/chromatic-cli/pull/612) Add change count to buildPassed message if changes exist

# 6.7.0 - 2022-06-30

- [598](https://github.com/chromaui/chromatic-cli/pull/598) Enable bash mode for globs when matching branches with picomatch

# 6.6.4 - 2022-06-27

- [590](https://github.com/chromaui/chromatic-cli/pull/590) Better onboarding support
- [596](https://github.com/chromaui/chromatic-cli/pull/596) Handle redirects when using `--storybook-url`

# 6.6.3 - 2022-06-18

- [8be428f](https://github.com/chromaui/chromatic-cli/commit/8be428f4601f24921cf4bbeee889be853ed78bf7) Prevent split on undefined

# 6.6.2 - 2022-06-17

- [592](https://github.com/chromaui/chromatic-cli/pull/592) Filter out unsupported addons from Storybook metadata

# 6.6.1 - 2022-06-17

- [566](https://github.com/chromaui/chromatic-cli/pull/566) Handle commits that are missing from the repository (i.e. rebased) when doing TurboSnap
- [562](https://github.com/chromaui/chromatic-cli/pull/562) Implement async build creation process
- [585](https://github.com/chromaui/chromatic-cli/pull/585) Fix Storybook metadata retrieval

# 6.5.4 - 2022-04-7

- [554](https://github.com/chromaui/chromatic-cli/pull/554) Downcase the slug so we don't accidentally treat origin as fork

# 6.5.3 - 2022-03-14

- [536](https://github.com/chromaui/chromatic-cli/pull/536) Fix `slug` for GitHub's `workflow_dispatch` event
- [547](https://github.com/chromaui/chromatic-cli/pull/547) Fix line splitting on Windows for Git output
- [538](https://github.com/chromaui/chromatic-cli/pull/538) Bump url-parse from 1.5.3 to 1.5.10
- [545](https://github.com/chromaui/chromatic-cli/pull/545) Bump ansi-html from 0.0.7 to 0.0.8
- [528](https://github.com/chromaui/chromatic-cli/pull/528) Bump follow-redirects from 1.14.7 to 1.14.9

# 6.5.2 - 2022-03-11

- [527](https://github.com/chromaui/chromatic-cli/pull/527) [539](https://github.com/chromaui/chromatic-cli/pull/539) Fix TurboSnap support for Storybook in a subdirectory

# 6.5.1 - 2022-02-21

- Fix: Cannot read property 'startsWith' of null

# 6.5.0 - 2022-02-21

- [513](https://github.com/chromaui/chromatic-cli/pull/513) Add support for custom npm registry url
- [521](https://github.com/chromaui/chromatic-cli/pull/521) Add TurboSnap support for Vite
- [523](https://github.com/chromaui/chromatic-cli/pull/523) Fix TurboSnap support for Storybook 6.5 with `.cjs` extension
- [518](https://github.com/chromaui/chromatic-cli/pull/518) Fix `storybookUrl` output by removing `iframe.html` suffix

# 6.4.3 - 2022-01-31

- [505](https://github.com/chromaui/chromatic-cli/pull/505) Migrate to TypeScript

# 6.4.2 - 2022-01-28

- [510](https://github.com/chromaui/chromatic-cli/pull/510) Fix `pathname` support in proxy URL
- [0734f3a](https://github.com/chromaui/chromatic-cli/commit/e770baf117ff8fe5cb8ca0dc198302b890734f3a) Fix how paths are normalized for TurboSnap

# 6.4.1 - 2022-01-20

- [499](https://github.com/chromaui/chromatic-cli/pull/499) Fix handling of `CANCELLED` build status
- [501](https://github.com/chromaui/chromatic-cli/pull/501) Fix handling of missing `ref` and/or `sha` inputs on `workflow_dispatch` event #501
- [503](https://github.com/chromaui/chromatic-cli/pull/503) Reformat help text and move `allowConsoleErrors` to deprecated options
- [504](https://github.com/chromaui/chromatic-cli/pull/504) Fix consistent naming of flags for `trace` util

# 6.4.0 - 2022-01-18

- [495](https://github.com/chromaui/chromatic-cli/pull/495) TurboSnap: Add `--trace-changed` flag and `trace` utility
- [490](https://github.com/chromaui/chromatic-cli/pull/490) TurboSnap: Detect mismatching entry file and suggest a fix
- [502](https://github.com/chromaui/chromatic-cli/pull/502) Add `--force-rebuild` to prevent skipping on rebuild
- [500](https://github.com/chromaui/chromatic-cli/pull/500) Use commit author info instead of committer info
- [487](https://github.com/chromaui/chromatic-cli/pull/487) Improve how process exit code is set
- [488](https://github.com/chromaui/chromatic-cli/pull/488) Fix `--untraced` for package files
- [474](https://github.com/chromaui/chromatic-cli/pull/474) Fix commit status update for UI Review when using `--skip`

# 6.3.4 - 2022-01-10

- [492](https://github.com/chromaui/chromatic-cli/pull/492) Fix missing exit code on rebuild
- [491](https://github.com/chromaui/chromatic-cli/pull/491) Fix `storybookBaseDir` option in GitHub Action

# 6.3.3 - 2021-12-22

- Filter empty values in array flags and restore warnings

# 6.3.2 - 2021-12-22

- Disable warning about `--externals` requiring `--only-changed`

# 6.3.1 - 2021-12-22

- Disable warning about `--untraced` requiring `--only-changed`

# 6.3.0 - 2021-12-22

- [461](https://github.com/chromaui/chromatic-cli/pull/461) Add `--untraced` flag to avoid retesting stories that depend on certain files
- [479](https://github.com/chromaui/chromatic-cli/pull/479) Add `--diagnostics` flag to write process context data to a file
- [458](https://github.com/chromaui/chromatic-cli/pull/458) Track `bailReason`, improve TurboSnap messaging and throw on zero CSF globs
- [482](https://github.com/chromaui/chromatic-cli/pull/482) Fix commit details when using env var and warn if the commit is missing

# 6.2.3 - 2021-12-17

- Avoid optional chaining which breaks in Node 12 (GitHub Actions)

# 6.2.2 - 2021-12-17

- Fix error handling in GraphQL client to not retry mutation on HTTP error

# 6.2.1 - 2021-12-16

- [477](https://github.com/chromaui/chromatic-cli/pull/477) Retry createBuild based on error messages
- [468](https://github.com/chromaui/chromatic-cli/pull/468) Increase unpack wait timeout to 3 minutes
- [466](https://github.com/chromaui/chromatic-cli/pull/466) Add workingDirectory input handler for action
- [465](https://github.com/chromaui/chromatic-cli/pull/465) Remove the need to set a GitHub token

# 6.2.0 - 2021-12-07

- [459](https://github.com/chromaui/chromatic-cli/pull/459) Add --zip flag to upload files as zip archive
- [463](https://github.com/chromaui/chromatic-cli/pull/463) Fix tests of makeZipFile
- [447](https://github.com/chromaui/chromatic-cli/pull/447) Add support for passing the same flag multiple times

# 6.1.0 - 2021-11-29

- [455](https://github.com/chromaui/chromatic-cli/pull/455) Add `--storybook-base-dir` to support TurboSnap with a prebuilt Storybook originating from a subdirectory
- [456](https://github.com/chromaui/chromatic-cli/pull/456) Add `--dry-run` to skip publishing
- [444](https://github.com/chromaui/chromatic-cli/pull/444) Add support for proxy authentication
- [457](https://github.com/chromaui/chromatic-cli/pull/457) Throw error rather than bailing out of TurboSnap when tracing changed files fails

# 6.0.6 - 2021-11-10

- [449](https://github.com/chromaui/chromatic-cli/pull/449) Fix TurboSnap for unnamed modules in Webpack 5 stats file
- [442](https://github.com/chromaui/chromatic-cli/pull/442) Set exitCode to 0 when branch is skipped with skip flag

# 6.0.5 - 2021-10-27

- [440](https://github.com/chromaui/chromatic-cli/pull/440) Add TurboSnap support for 6.4 virtual story file locations
- [440](https://github.com/chromaui/chromatic-cli/pull/440) Fix TurboSnap for files that are chunked with preview files
- [436](https://github.com/chromaui/chromatic-cli/pull/436) Fix DEBUG env variable being set
- [424](https://github.com/chromaui/chromatic-cli/pull/424) Update GitHub Action to use Node 14
- [433](https://github.com/chromaui/chromatic-cli/pull/433) Add optional window arg to `isChromatic`

# 6.0.4 - 2021-10-13

- Fix issue with `node:path` import caused by `meow` v10.

# 6.0.3 - 2021-10-13

- Fix `--only-changed` to bail on changes to `package.json`, `package-lock.json` or `yarn.lock` located at the repository root.

# 6.0.0 - 2021-10-12

- [393](https://github.com/chromaui/chromatic-cli/pull/393) Bundle the bin & action so it's dependency-less
- [393](https://github.com/chromaui/chromatic-cli/pull/393) Add support for `workflow_run` event
- [393](https://github.com/chromaui/chromatic-cli/pull/393) Make lookup of storybook version optional
- Make `isChromatic` the package main entry point
- Remove the deprecated Storybook addon

Before:

```js
import isChromatic from 'chromatic/isChromatic';
```

After:

```js
import isChromatic from 'chromatic';
```

# 5.10.1 - 2021-09-21

- [404](https://github.com/chromaui/chromatic-cli/pull/404) Fix the version of node-fetch to `2.6.0` due to a bug in `2.6.3`

# 5.10.0 - 2021-09-17

- [311](https://github.com/chromaui/chromatic-cli/pull/311) Support `workflow_dispatch` event in GitHub Action
- [382](https://github.com/chromaui/chromatic-cli/pull/382) Support absolute paths in webpack stats
- [370](https://github.com/chromaui/chromatic-cli/pull/370) Ignore `--only-changed` on rebuild
- [381](https://github.com/chromaui/chromatic-cli/pull/381) Throw when specifying an invalid loglevel
- [392](https://github.com/chromaui/chromatic-cli/pull/392) Better path handling for TurboSnap
- [374](https://github.com/chromaui/chromatic-cli/pull/374) Fix handling of `NO_PROXY` environment variable
- [397](https://github.com/chromaui/chromatic-cli/pull/397) Fix runtime issues with HTTP_PROXY / NO_PROXY
- [380](https://github.com/chromaui/chromatic-cli/pull/380) Fix `isChromatic` for server-side rendering
- [401](https://github.com/chromaui/chromatic-cli/pull/401) Update BuildHasChanges message to be clearer

# 5.9.2 - 2021-06-15

- [366](https://github.com/chromaui/chromatic-cli/pull/366) Fix resolving webpack stats in subdirectory

# 5.9.1 - 2021-06-14

- [365](https://github.com/chromaui/chromatic-cli/pull/365) Fix cross-fork builds from GitHub Action

# 5.9.0 - 2021-06-02

- [347](https://github.com/chromaui/chromatic-cli/pull/347) Add support for proxy server
- [334](https://github.com/chromaui/chromatic-cli/pull/334) Check existence and validity of package.json
- [355](https://github.com/chromaui/chromatic-cli/pull/355) Ignore `--only-changed` on changes matching `--externals`

# 5.8.3 - 2021-05-21

- [350](https://github.com/chromaui/chromatic-cli/pull/350) Restore original `preferLocal` settings for Execa

# 5.8.2 - 2021-05-19

- [348](https://github.com/chromaui/chromatic-cli/pull/348) Restore original behavior to use npm_execpath

# 5.8.1 - 2021-05-18

- [345](https://github.com/chromaui/chromatic-cli/pull/345) Restore implying of `--preserve-missing` when using `--only`
- [344](https://github.com/chromaui/chromatic-cli/pull/344) Fix determining viewLayer when using transitive dependency
- [337](https://github.com/chromaui/chromatic-cli/pull/337) Fix chromatic script that can be added to package.json
- [331](https://github.com/chromaui/chromatic-cli/pull/331) Log `clientVersion` on fatal error

# 5.8.0 - 2021-04-29

- [319](https://github.com/chromaui/chromatic-cli/pull/319) Retrieve viewLayer and version from dependencies and support @web/dev-server-storybook
- [313](https://github.com/chromaui/chromatic-cli/pull/313) Use original baseline for rebuilds (new build for the same commit)
- [304](https://github.com/chromaui/chromatic-cli/pull/304) Support only testing components affected by recent git changes via `--only-changed`
- [305](https://github.com/chromaui/chromatic-cli/pull/305) Fix `npx chromatic` timing out on build-storybook

# 5.7.1 - 2021-02-02

- Better logging when Storybook validation fails

# 5.7.0 - 2021-03-11

- [283](https://github.com/chromaui/chromatic-cli/pull/283) Explicitly allow multiple project-tokens (last will be used)
- [301](https://github.com/chromaui/chromatic-cli/pull/301) Strip `origin/*` prefix from branch name
- [297](https://github.com/chromaui/chromatic-cli/pull/297) Add @storybook/vue3 support
- [296](https://github.com/chromaui/chromatic-cli/pull/296) Support Yarn 2 execpath
- [295](https://github.com/chromaui/chromatic-cli/pull/295) Gracefully handle `git config` command in Netlify
- [284](https://github.com/chromaui/chromatic-cli/pull/284) Fix `storybookUrl` in GitHub Action
- [287](https://github.com/chromaui/chromatic-cli/pull/287) Update CLI to use new `test` terminology and statuses
- [298](https://github.com/chromaui/chromatic-cli/pull/298) Document GitHub action outputs
- [306](https://github.com/chromaui/chromatic-cli/pull/306) Fix tunnel builds

# 5.6.3 - 2021-02-17

- [282](https://github.com/chromaui/chromatic-cli/pull/282) Revert meow upgrade (will upgrade again in next major release)

# 5.6.2 - 2021-02-10

- [269](https://github.com/chromaui/chromatic-cli/pull/269) Record CI service name on build
- [278](https://github.com/chromaui/chromatic-cli/pull/278) Fix 10-minute timeout in gh action

# 5.6.1 - 2021-01-22

- Update `@chromaui/localtunnel` dependency to patch Axios security vulnerability

# 5.6.0 - 2021-01-12

- [233](https://github.com/chromaui/chromatic-cli/pull/233) Add `--branch-name` flag to override branch name
- [193](https://github.com/chromaui/chromatic-cli/pull/193) Record the repository slug to support builds from forks
- [237](https://github.com/chromaui/chromatic-cli/pull/237) Avoid passing `--silent` when invoking npm through Node.js script
- [231](https://github.com/chromaui/chromatic-cli/pull/231) Fix overriding Storybook version through environment variable

# 5.5.0 - 2020-12-20

- [212](https://github.com/chromaui/chromatic-cli/pull/212) Add support for monorepo using a new `path` argument
- [218](https://github.com/chromaui/chromatic-cli/pull/218) isChromatic should always be a boolean
- Dependency upgrades

# 5.4.0 - 2020-11-16

- Throw error when running from shallow clone.
- Improve error messages for when build-storybook fails.
- Add support for `pull_request_target` and `pull_request_review` events to GitHub Action.

# 5.3.0 - 2020-10-29

- Retrieve branch name using more modern git commands, if available.
- Auto-detect buildScriptName from available scripts.
- Improve various log messages.

# 5.2.0 - 2020-09-14

- Keep track of baselines when doing squash or rebase merges.

# 5.1.0 - 2020-08-03

- If the build directory we defined is empty, try to detect the actual build output directory from the Storybook build log and warn about it.
- Show a user-friendly error message if we still don't find any Storybook files to publish.
- We now read package.json using `pkgUp`, so theoretically you can run `chromatic` from a subdirectory.
- Added the `--output-dir (-o)` flag to use instead of a temp dir.
- Added `buildScript` to the error json output so we won't have to ask for it in support every time.
- Added a global promise rejection handler, in case we accidently forget to catch them.
- Added a user-friendly error message when build-storybook fails.
- Fixed the `--debug` flag so it actually prints something.
- Fixed the `--only` flag.
- Fixed issue with `node-loggly-bulk` when using Yarn 2.

# 5.0.0 - 2020-06-19

- Completely overhauled the CLI, with improved UX and better error handling
- Removed JSDOM and its shims to avoid a whole category of issues with broken builds
- Added a version upgrade check that warns when a new major update is available
- Added --junit-report to generating build reports for integration with other tools
- Changed --only to accept a simple glob
- Moved documentation to the Chromatic website

# 4.0.3 - 2020-05-18

- Replace child_process.execSync with execa
- ADD mock for execCommand in JSDOM

# 4.0.2 - 2020-04-26

- REMOVE node_env development https://github.com/chromaui/chromatic-cli/pull/81
- ADD ability to create a patch build for pull requests
- ADD extra parameters to upload https://github.com/chromaui/chromatic-cli/pull/107
- IMPROVE readability of error message from build-storybook https://github.com/chromaui/chromatic-cli/pull/112
- IMPROVE user experience during onboarding
- RENAME appCode to projectToken https://github.com/chromaui/chromatic-cli/pull/109
- REMOVE adding a environment variable when adding script, use cli flag instead https://github.com/chromaui/chromatic-cli/pull/105

# 3.5.2 - 2020-02-18

- FIX version of JSDOM to 16.1 as 16.2 includes a conflicting custom element support https://github.com/chromaui/chromatic-cli/issues/95

# 3.5.1 - 2020-02-06

- FIX setting the `fromCI` flag from our github action https://github.com/chromaui/action/issues/14

# 3.5.0 - 2020-01-28

- CHANGE so the CLI stop on storybook runtime errors https://github.com/chromaui/chromatic-cli/issues/75
- ADD a flag (`--allow-console-errors`) to continue on storybook runtime errors https://github.com/chromaui/chromatic-cli/issues/75
- ADD early warning system for if the storybook output folder is empty https://github.com/chromaui/chromatic-cli/issues/78
- IMPROVE readability of the error when build-storybook fails https://github.com/chromaui/chromatic-cli/issues/73
- IMPROVE readability of the error when storybook runtime throws an error https://github.com/chromaui/chromatic-cli/issues/73
- FIX `Intl.PluralRules.supportedLocalesOf is not a function` error https://github.com/chromaui/chromatic-cli/issues/76

# 3.4.0 - 2019-12-25

- FIX pubish script

# 3.3.0 - 2019-12-25

- IMPROVE logging when git fails
- FIX script for windows
- ADD `--exit-once-uploaded` flag
- FIX escape chararacters in error messages

# 3.2.0 failed upload to npm

# 3.1.0 - 2019-11-04

- ADD jsdom shim for SVG elements
- ADD jsdom shim for fetch
- Bugfix jsdom shim for Intl

# 3.0.3 - 2019-10-15

- ADD compatibility with github action
- ADD test with github action
- ADD compatibility with github env vars for tracing git branch
- Bugfix running on windows by using cross-spawn

# 3.0.2 - 2019-10-09

- ADD licence file
- Bugfix compatibility with CHROMA_APP_CODE
- Bugfix report list of addons

# 3.0.1 - 2019-10-08

- ADD chroma bin

# 3.0.0 - 2019-10-03

- Bugfix indentation of messages in terminal
- REMOVE the need for the clientside addon
- unify the 2 related packages into a single repository

# 2.2.2 - 2019-08-25

- Bugfix for compatibility with localtunnel`

# 2.2.0 - 2019-08-23

- Add support for docs-mode (Storybook 5.2 feature).

- Add support for a new parameter: `pauseAnimationsAtEnd`. Read about it here: https://www.chromatic.com/docs/animations

- Retry requests to uploading storybooks in case of network problems.

# 2.1.1 - 2019-08-06

- Upgrade `axios` dependency for security update

# 2.1.0 - 2019-07-17

- Add a `--skip` flag to indicate a commit is not going to be built (and still tag the PR as passing).
- Allow `chromatic` story parameters to be functions of `({ id, kind name })` -- in particular e.g. `chromatic: { viewport: () => [/*something dynamic based on story info */]}`
- A fix for issues involving story listings differing between browsers.

# 2.0.0 - 2019-07-17

- We now default to building and uploading your storybook, rather than starting and tunneling it. This has many benefits including increased reliability and better support for Live View. You'll need to ensure you have a `build-storybook` script defined in `package.json` (as added by the Storybook CLI). To get the old behaviour, pass `-s` to the `chromatic test` command.

- We now support HTTPS storybooks (using the `--ssl` flag and friends).

- We polyfill `window.Intl` in our JSDOM environment.

- We polyfill `window.customElements` in our JSDOM environment.

# 1.4.0 - 2019-06-20

- Retry requests to the API server if one fails rather than bailing out on builds.

# 1.3.3 - 2019-04-19

- Fixed issue with uploaded builds and Storybook 5 URLs.

# 1.3.2 - 2019-04-02

- Added a new `diffThreshold` Storybook parameter you can use to control the anti-aliasing threshold we use for diffing if you find that certain images are tripping our diff.

- Fix an issue with handling rebased branches in unusual CI systems.

# 1.3.1 - 2019-03-21

- Add a dedicated endpoint for `isChromatic` so you don't need to load our full package to use it (which is useful if you want to use it inside your app, which we generally don't advise).

# 1.3.0 - 2019-02-28

- Change the default behaviour around starting the storybook; if we find something running on the port, we assume it's your storybook, instead of requiring you to pass `-S/--do-not-start`.

- Add a new flag `--preserve-missing` which means any stories that are missing from the last build will be assumed to be unchanged. Use this if you are doing tricky things around dynamically building your Storybook based on code changes.

# 1.2.6 - 2019-02-05

- Fix an issue with Angular/zone.js failing to patch our `MutationObserver` mock

# 1.2.5 - 2019-01-30

- Fix an issue with using `isChromatic()` inside Jest (storyshots).

- Some rendering timing fixes to better support Storybook version 5

# 1.2.4 - 2019-01-18

- Added an export `isChromatic()` to determine if code is running under test.

- Added JSDOM mocks for `CreateObjectUrl` and `MutationObserver`

- Added a parameter `{ chromatic: { disable: true } }` to skip a story in chromatic

- Added a parameter `{ chromatic: { noScroll: true } }` to avoid scrolling screenshots in (non-chrome) browsers.

# 1.2.3 - 2018-12-28

- Allow overwriting the polyfills we create in JSDOM mode. (This is a bugfix for some libraries that bundle their own polyfills).

# 1.2.2 - 2018-12-10

- Allow controlling package initialization timing via `import configure from 'storybook-chromatic/configure'; configure()`

- Add a flag `--ignore-last-build-on-branch=X` to not use the last build on a branch no matter what (which helps with rebasing, see: http://chromatic.com/docs/branching-and-baselines#rebasing).

# 1.2.1 - 2018-12-04

- Update logging dependency from `loggly` to `node-loggly-bulk` due to security vulnerabilities.
  NOTE: this package was only used by our CLI tool and so there is no need for concern, but this new version should avoid tripping security tools.

# 1.2.0 - 2018-10-29

- Pass `chromatic` parameters from Storybook@4, supporting:

  - Viewports: http://chromatic.com/docs/viewports
  - Delay: http://chromatic.com/docs/delay

- Better logging from the package to allow us to debug build problems.

- Fix regression for node v6

- Fix for supporting stories that use Canvas APIs in JSDOM

# 1.1.0 - 2018-10-15

- Fix to work on Windows CI

- Added a `--storybook-build-dir` parameter that allows you to upload a pre-built storybook.

# 1.0.2 - 2018-08-23

- Fix a bug with Live View and Storybook@3.4

# 1.0.1 - 2018-07-26

- We now set the `CHROMATIC_APP_CODE` variable for you, with explicit instructions to remove it (and set via CI) in less secure applications.

- Some small bugfixes to support unusual usages.

# 1.0.0 - 2018-07-02

- Renamed the package from `react-chromatic` to `storybook-chromatic`, to indicate support for all view layers that Storybook supports!

- Tweaked to focus soley on Storybook -- simply `import 'storybook-chromatic';` (no `/storybook-addon` required). Run tests with `chromatic test --app-code` (no `--storybook-addon` required).

- Changed some URL parameters for the test command:

  - `--port` renamed `--storybook-port`
  - `--url` renamed `--storybook-url`
  - `--app-path` removed (it's always `/iframe.html`, as per Storybook).
  - `--exec` added to run arbitrary commands as an alternative to `--script-name`
  - `--no-interactive` added to disable interactive mode (and we do so automatically when on CI)

- We no longer require you to have npm installed if you are using yarn.

- Small bug fixes for missing git repositories, various failure modes.

- We now track your Storybook version and view layer so we know when to ship/change features.

# As `react-chromatic`

# 0.8.4 - 2018-06-07

- Fix an issue for stories that use `navigator.mimeTypes`

# 0.8.3 - 2018-04-26

- Fix a bug where sometimes the package did not detect the checked out branch.

# 0.8.2 - 2018-04-18

- Better support for rebasing branches - we now always treat the last build on this branch as a baseline, even if strictly it is not a git ancestor of the current commit. This helps deal with the situation where you rebase a branch off main, and still want to use the previously approved snapshots.

- Improved support for CI systems, especially _Netlify_ and _Travis PR builds_. Travis PR builds are a special case, read more about how to handle them in Chromatic here: https://www.chromatic.com/docs/ci#travis

# 0.8.1 - 2018-03-28

- Fix a small bug in the git algorithm for old Chromatic projects.

# 0.8.0 - 2018-03-28

- Reworked the git baseline detection algorithm to use a different technique that should be more reliable across many different modes of usage.

- Gather stories from Storybook 3.4 without requiring direct installation.

- Added `--auto-accept-changes` to avoid approvals on certain branches

- Added `--only` flag to run a single story

# 0.7.11 - 2018-03-15

- Handle the case where the last few Chromatic builds were run against commits which are no longer in the repository (due to rebasing or squashing). This could cause the tool to crash or fail to find a baseline for a build.

- Add a `--url` argument to allow running tests against arbitrary running apps.

# 0.7.10 - 2018-02-22

- Small API change for querying build change counts.

# 0.7.9 - 2018-01-23

- Our test script now warns you if your Storybook logs any errors. This can sometimes help reveal subtle problems that are caused by the script evaluating your Storybook in JSDOM. If you have legitimate things logged to `console.error` this may cause noise---you should probably get rid of them.

# 0.7.8 - 2018-01-18

- We no longer write your app code to your `package.json` by default; instead we prefer you pass it via the `CHROMATIC_APP_CODE` environment variable. (You can still optionally use `--app-code=xyz` if you are comfortable with the security of your `package.json`).

- We now show the final part of your Story's kind as the component name in the Chromatic UI. So "Webapp/UserList" will appear in Chromatic as "UserList".

# 0.7.7 - 2017-12-21

- This version sends us a little more information about the environment the package runs in -- is it CI? which package version?

# 0.7.6 - 2017-12-19

- Fix an issue where we did not pass the context to stories in the right format.

# 0.7.5 - 2017-12-19

- We detect a running process on your app's port and don't try and start the app if so. Pass `--do-not-start` if you've already started the app.

# 0.7.3 - 2017-12-09

- We now upload your application bundle to our tunnel server directly from the package.
  This means that on slower uplinks, we no need to set arbitrary timeouts in our server process; instead we simply will not start your Chromatic build until we've verified the bundle has uploaded successfully.
