# v7.2.1 (Wed Oct 04 2023)

#### 🐛 Bug Fix

- Replace release script with auto shipit [#828](https://github.com/chromaui/chromatic-cli/pull/828) ([@ghengeveld](https://github.com/ghengeveld))
- Add `experimental_abortSignal` to Node API to allow canceling builds [#822](https://github.com/chromaui/chromatic-cli/pull/822) ([@ghengeveld](https://github.com/ghengeveld))
- Migrate from Jest to Vitest, update ESLint config and upgrade Execa [#821](https://github.com/chromaui/chromatic-cli/pull/821) ([@ghengeveld](https://github.com/ghengeveld))
- No longer log to loggly [#819](https://github.com/chromaui/chromatic-cli/pull/819) ([@tmeasday](https://github.com/tmeasday))
- Add support for a JSON configuration file [#814](https://github.com/chromaui/chromatic-cli/pull/814) ([@tmeasday](https://github.com/tmeasday))
- Rename `onTaskError` to `experimental_onTaskError` [#813](https://github.com/chromaui/chromatic-cli/pull/813) ([@tmeasday](https://github.com/tmeasday))
- Add `onTaskStart`, and a new typed field `ctx.task` [#810](https://github.com/chromaui/chromatic-cli/pull/810) ([@tmeasday](https://github.com/tmeasday))
- Allow running a build from a repo with only one commit when not in CI [#812](https://github.com/chromaui/chromatic-cli/pull/812) ([@tmeasday](https://github.com/tmeasday))
- Add `onTaskError` option to report errors to node consumers [#808](https://github.com/chromaui/chromatic-cli/pull/808) ([@weeksling](https://github.com/weeksling))
- 7.0.0 ([@ghengeveld](https://github.com/ghengeveld))
- Use `@antfu/ni` to support `pnpm` for Storybook build [#789](https://github.com/chromaui/chromatic-cli/pull/789) ([@ghengeveld](https://github.com/ghengeveld))
- Add a `onTaskProgress` option and report progress on it [#805](https://github.com/chromaui/chromatic-cli/pull/805) ([@tmeasday](https://github.com/tmeasday))
- Add Modes Suffix to CLI Progress Indicator [#803](https://github.com/chromaui/chromatic-cli/pull/803) ([@thafryer](https://github.com/thafryer))
- Include all commit info in `GitInfo` [#802](https://github.com/chromaui/chromatic-cli/pull/802) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `Unexpected build status: PREPARED` error [#801](https://github.com/chromaui/chromatic-cli/pull/801) ([@ghengeveld](https://github.com/ghengeveld))
- Fix type signature for `runAll` and `runBuild` [#800](https://github.com/chromaui/chromatic-cli/pull/800) ([@tmeasday](https://github.com/tmeasday))
- Pass `gitUserEmailHash` up with new builds and use `localBuilds` filter in baseline calculations [#796](https://github.com/chromaui/chromatic-cli/pull/796) ([@tmeasday](https://github.com/tmeasday))
- Add `--local` flag and pass to builds as `isLocalBuild` [#795](https://github.com/chromaui/chromatic-cli/pull/795) ([@tmeasday](https://github.com/tmeasday))
- Calculate and record `uncommittedHash` when creating a build [#798](https://github.com/chromaui/chromatic-cli/pull/798) ([@ghengeveld](https://github.com/ghengeveld))
- Add support for `schedule` GitHub Action workflow trigger [#780](https://github.com/chromaui/chromatic-cli/pull/780) ([@Sealos](https://github.com/Sealos))
- Update snyk parser and added tests for yarn berry [#793](https://github.com/chromaui/chromatic-cli/pull/793) ([@ethriel3695](https://github.com/ethriel3695) [@JonathanKolnik](https://github.com/JonathanKolnik))
- Add `getGitInfo` function exported by the Node API [#794](https://github.com/chromaui/chromatic-cli/pull/794) ([@ndelangen](https://github.com/ndelangen))
- Send build id up with upload mutation [#788](https://github.com/chromaui/chromatic-cli/pull/788) ([@tmeasday](https://github.com/tmeasday) [@thafryer](https://github.com/thafryer))
- Add `release` event to GitHub Action [#734](https://github.com/chromaui/chromatic-cli/pull/734) ([@0x2b3bfa0](https://github.com/0x2b3bfa0) [@thafryer](https://github.com/thafryer))
- Increase the timeout for executing Git commands [#775](https://github.com/chromaui/chromatic-cli/pull/775) ([@thafryer](https://github.com/thafryer))
- Use `CHROMATIC_PROJECT_TOKEN` environment variable rather than hardcoded value [#750](https://github.com/chromaui/chromatic-cli/pull/750) ([@ghengeveld](https://github.com/ghengeveld) [@thafryer](https://github.com/thafryer))
- Remove Azure Pipelines CI [#759](https://github.com/chromaui/chromatic-cli/pull/759) ([@thafryer](https://github.com/thafryer))
- Bump loggly dep [#773](https://github.com/chromaui/chromatic-cli/pull/773) ([@thafryer](https://github.com/thafryer) [@tmeasday](https://github.com/tmeasday))
- Add some fields to package.json to help resolve types [#765](https://github.com/chromaui/chromatic-cli/pull/765) ([@tmeasday](https://github.com/tmeasday))
- Ensure we exit with a code at the end [#770](https://github.com/chromaui/chromatic-cli/pull/770) ([@tmeasday](https://github.com/tmeasday))
- Add isChromatic exports [#768](https://github.com/chromaui/chromatic-cli/pull/768) ([@tmeasday](https://github.com/tmeasday))
- Fix issue with `onTaskComplete` callback [#763](https://github.com/chromaui/chromatic-cli/pull/763) ([@tmeasday](https://github.com/tmeasday))
- Move all depenendencies to dev deps [#764](https://github.com/chromaui/chromatic-cli/pull/764) ([@tmeasday](https://github.com/tmeasday))
- Added `onTaskComplete` callback option [#756](https://github.com/chromaui/chromatic-cli/pull/756) ([@tmeasday](https://github.com/tmeasday))
- Add a node entry point [#755](https://github.com/chromaui/chromatic-cli/pull/755) ([@tmeasday](https://github.com/tmeasday))
- 6.18.2 [#770](https://github.com/chromaui/chromatic-cli/pull/770) ([@tmeasday](https://github.com/tmeasday))
- update getStorybookMetadata to safely record version even if fails to parse mainConfig [#753](https://github.com/chromaui/chromatic-cli/pull/753) ([@JonathanKolnik](https://github.com/JonathanKolnik) [@tmeasday](https://github.com/tmeasday))
- Add additional logging for turbosnap [#758](https://github.com/chromaui/chromatic-cli/pull/758) ([@ethriel3695](https://github.com/ethriel3695))
- Add type statement [#754](https://github.com/chromaui/chromatic-cli/pull/754) ([@kk3939](https://github.com/kk3939) [@ghengeveld](https://github.com/ghengeveld))
- Add JUnit Report to Github Action Inputs [#706](https://github.com/chromaui/chromatic-cli/pull/706) ([@thafryer](https://github.com/thafryer))
- Fix types and Yarn classic compatibility [#757](https://github.com/chromaui/chromatic-cli/pull/757) ([@ghengeveld](https://github.com/ghengeveld))
- 6.18.0 [#754](https://github.com/chromaui/chromatic-cli/pull/754) ([@ghengeveld](https://github.com/ghengeveld))
- Better discovery for TurboSnap trace-changed and related directories [#737](https://github.com/chromaui/chromatic-cli/pull/737) ([@ethriel3695](https://github.com/ethriel3695))
- Fix Storybook config detection by adding serverRequire to interpret files [#747](https://github.com/chromaui/chromatic-cli/pull/747) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Bump Snyk Lockfile Parser Dependency [#743](https://github.com/chromaui/chromatic-cli/pull/743) ([@thafryer](https://github.com/thafryer))
- get the builder name and version via the mainConfig for SB v7+ [#738](https://github.com/chromaui/chromatic-cli/pull/738) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- 6.17.3 ([@thafryer](https://github.com/thafryer))
- Disconnect Preserve missing from `--only-story-names` flag [#730](https://github.com/chromaui/chromatic-cli/pull/730) ([@thafryer](https://github.com/thafryer))
- 6.17.2 ([@thafryer](https://github.com/thafryer))
- Increase timeout on Storybook Verify [#726](https://github.com/chromaui/chromatic-cli/pull/726) ([@thafryer](https://github.com/thafryer))
- Update `changedFiles` target to fix broken trace utility [#718](https://github.com/chromaui/chromatic-cli/pull/718) ([@ethriel3695](https://github.com/ethriel3695))
- Add support for `issue_comment` event in GitHub Action [#713](https://github.com/chromaui/chromatic-cli/pull/713) ([@thafryer](https://github.com/thafryer))
- Omit `inputs` for `workflow_dispatch` event in GitHub Action [#695](https://github.com/chromaui/chromatic-cli/pull/695) ([@108EAA0A](https://github.com/108EAA0A))
- Add `--repository-slug` flag to CLI, and `repositorySlug` + `branchName` options to Action [#710](https://github.com/chromaui/chromatic-cli/pull/710) ([@ghengeveld](https://github.com/ghengeveld))
- Enhanced TurboSnap: Trace dependency changes instead of bailing out [#683](https://github.com/chromaui/chromatic-cli/pull/683) ([@skitterm](https://github.com/skitterm) [@ghengeveld](https://github.com/ghengeveld))
- Remove tunnel flags [#694](https://github.com/chromaui/chromatic-cli/pull/694) ([@paulelliott](https://github.com/paulelliott))
- Revert "Don't bundle package.json but rely on meow's runtime value instead" [#700](https://github.com/chromaui/chromatic-cli/pull/700) ([@ghengeveld](https://github.com/ghengeveld))
- Log message when TurboSnap is unavailable [#676](https://github.com/chromaui/chromatic-cli/pull/676) ([@ghengeveld](https://github.com/ghengeveld))
- Don't bundle package.json but rely on meow's runtime value instead [#671](https://github.com/chromaui/chromatic-cli/pull/671) ([@ghengeveld](https://github.com/ghengeveld))
- Output progress updates in non-interactive mode every 10 seconds [#675](https://github.com/chromaui/chromatic-cli/pull/675) ([@ghengeveld](https://github.com/ghengeveld))
- Support custom DNS IP and DNS failover IP using custom DNS resolver [#685](https://github.com/chromaui/chromatic-cli/pull/685) ([@ghengeveld](https://github.com/ghengeveld))
- Improve the failure message when there's only one git commit [#689](https://github.com/chromaui/chromatic-cli/pull/689) ([@thafryer](https://github.com/thafryer) [@alright-fine](https://github.com/alright-fine))
- Trace command errors for package manifest change [#670](https://github.com/chromaui/chromatic-cli/pull/670) ([@skitterm](https://github.com/skitterm))
- add interactionTestFailuresCount to github action output [#659](https://github.com/chromaui/chromatic-cli/pull/659) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Update action core to ensure secure api usage for set-output [#666](https://github.com/chromaui/chromatic-cli/pull/666) ([@JackHowa](https://github.com/JackHowa))
- Update action to use node16 [#660](https://github.com/chromaui/chromatic-cli/pull/660) ([@bryanjos](https://github.com/bryanjos))
- Edit package file detection process for the untraced flag [#667](https://github.com/chromaui/chromatic-cli/pull/667) ([@ethriel3695](https://github.com/ethriel3695) [@skitterm](https://github.com/skitterm))
- Added onlyStoryFiles to the github action [#665](https://github.com/chromaui/chromatic-cli/pull/665) ([@ethriel3695](https://github.com/ethriel3695))
- Publishing package-json dependency feature [#663](https://github.com/chromaui/chromatic-cli/pull/663) ([@skitterm](https://github.com/skitterm))
- TurboSnap not bailed if package manifest change isn't dependency-related [#648](https://github.com/chromaui/chromatic-cli/pull/648) ([@skitterm](https://github.com/skitterm) [@ghengeveld](https://github.com/ghengeveld))
- Add debug flag to action.yml [#662](https://github.com/chromaui/chromatic-cli/pull/662) ([@tmeasday](https://github.com/tmeasday))
- Add `debug` as an option to the GH action [#661](https://github.com/chromaui/chromatic-cli/pull/661) ([@tmeasday](https://github.com/tmeasday))
- Added an example for a TurboSnap optimized flow [#655](https://github.com/chromaui/chromatic-cli/pull/655) ([@ethriel3695](https://github.com/ethriel3695))
- 6.10.4 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- 6.10.3 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Fix version in changelog [#657](https://github.com/chromaui/chromatic-cli/pull/657) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Update buildHasErrors with interaction test failure specific messaging [#651](https://github.com/chromaui/chromatic-cli/pull/651) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Ensure all GitHub Action outputs are exposed [#650](https://github.com/chromaui/chromatic-cli/pull/650) ([@ghengeveld](https://github.com/ghengeveld))
- Fix TurboSnap for module names containing URL params in stats file [#649](https://github.com/chromaui/chromatic-cli/pull/649) ([@thafryer](https://github.com/thafryer))
- Fix Issues finding SB metadata [#646](https://github.com/chromaui/chromatic-cli/pull/646) ([@thafryer](https://github.com/thafryer))
- Check `onlyStoryNames` is non-empty [#645](https://github.com/chromaui/chromatic-cli/pull/645) ([@tmeasday](https://github.com/tmeasday))
- Fix implied `--preserve-missing` for `--only-story-names` [#643](https://github.com/chromaui/chromatic-cli/pull/643) ([@ghengeveld](https://github.com/ghengeveld))
- Add various counts as GitHub Action outputs [#620](https://github.com/chromaui/chromatic-cli/pull/620) ([@SiTaggart](https://github.com/SiTaggart) [@ghengeveld](https://github.com/ghengeveld))
- Add `--only-story-files` flag [#634](https://github.com/chromaui/chromatic-cli/pull/634) ([@ghengeveld](https://github.com/ghengeveld))
- Add tests for `--untraced` flag validation [#565](https://github.com/chromaui/chromatic-cli/pull/565) ([@ethriel3695](https://github.com/ethriel3695) [@ghengeveld](https://github.com/ghengeveld))
- Suggest using `--force-rebuild` when skipping rebuild [#636](https://github.com/chromaui/chromatic-cli/pull/636) ([@ghengeveld](https://github.com/ghengeveld))
- Add instructions on how to run locally [#567](https://github.com/chromaui/chromatic-cli/pull/567) ([@tmeasday](https://github.com/tmeasday) [@ghengeveld](https://github.com/ghengeveld))
- Retry queries by default and allow even more retries for `FirstCommittedAtQuery` [#635](https://github.com/chromaui/chromatic-cli/pull/635) ([@ghengeveld](https://github.com/ghengeveld))
- Rename `--only` to `--only-story-names` but keep it as a deprecated alias [#630](https://github.com/chromaui/chromatic-cli/pull/630) ([@ghengeveld](https://github.com/ghengeveld))
- Deprecate `--preserve-missing` and raise a warning if it's being used [#629](https://github.com/chromaui/chromatic-cli/pull/629) ([@ghengeveld](https://github.com/ghengeveld))
- 6.7.4 [#635](https://github.com/chromaui/chromatic-cli/pull/635) ([@ghengeveld](https://github.com/ghengeveld))
- Read Webpack stats file as stream to support very large projects [#624](https://github.com/chromaui/chromatic-cli/pull/624) ([@ethriel3695](https://github.com/ethriel3695) [@yannbf](https://github.com/yannbf))
- Update CHANGELOG.md [#619](https://github.com/chromaui/chromatic-cli/pull/619) ([@andrewortwein](https://github.com/andrewortwein) [@ghengeveld](https://github.com/ghengeveld))
- Add addon-interactions to supportedAddons in cli [#621](https://github.com/chromaui/chromatic-cli/pull/621) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Changed trim stats to stream and added test [#615](https://github.com/chromaui/chromatic-cli/pull/615) ([@ethriel3695](https://github.com/ethriel3695))
- Update CHANGELOG.md [#614](https://github.com/chromaui/chromatic-cli/pull/614) ([@thafryer](https://github.com/thafryer))
- 6.7.1 [#613](https://github.com/chromaui/chromatic-cli/pull/613) ([@thafryer](https://github.com/thafryer))
- Add change count to buildPassed message if changes exist. [#612](https://github.com/chromaui/chromatic-cli/pull/612) ([@thafryer](https://github.com/thafryer))
- Better `noCommitDetails` warning for custom GitHub `pull_request` workflows [#600](https://github.com/chromaui/chromatic-cli/pull/600) ([@ghengeveld](https://github.com/ghengeveld))
- Restore prepublish script to fix smoke tests [#602](https://github.com/chromaui/chromatic-cli/pull/602) ([@ghengeveld](https://github.com/ghengeveld))
- 6.6.5 [#599](https://github.com/chromaui/chromatic-cli/pull/599) ([@andrewortwein](https://github.com/andrewortwein))
- Enable bash mode for globs when matching branches with picomatch [#598](https://github.com/chromaui/chromatic-cli/pull/598) ([@andrewortwein](https://github.com/andrewortwein))
- Don't try to set dist-tag, just do it separately [#624](https://github.com/chromaui/chromatic-cli/pull/624) ([@ghengeveld](https://github.com/ghengeveld))
- Handle redirects when using `--storybook-url` [#596](https://github.com/chromaui/chromatic-cli/pull/596) ([@ghengeveld](https://github.com/ghengeveld))
- Better Onboarding Support in CLI [#590](https://github.com/chromaui/chromatic-cli/pull/590) ([@thafryer](https://github.com/thafryer))
- Filter out unsupported addons from sb metadata [#592](https://github.com/chromaui/chromatic-cli/pull/592) ([@thafryer](https://github.com/thafryer))
- SB Metadata Retrieval [#585](https://github.com/chromaui/chromatic-cli/pull/585) ([@thafryer](https://github.com/thafryer))
- Update message and link to status page [#560](https://github.com/chromaui/chromatic-cli/pull/560) ([@ghengeveld](https://github.com/ghengeveld))
- Revert "Fix Issue with Getting Storybook Info in CLI" [#584](https://github.com/chromaui/chromatic-cli/pull/584) ([@kylesuss](https://github.com/kylesuss) [@thafryer](https://github.com/thafryer))
- Fix Issue with Getting Storybook Info in CLI [#577](https://github.com/chromaui/chromatic-cli/pull/577) ([@thafryer](https://github.com/thafryer))
- Revert "Implement async build creation process" [#581](https://github.com/chromaui/chromatic-cli/pull/581) ([@tmeasday](https://github.com/tmeasday))
- Add notes about how to use the `next` version [#576](https://github.com/chromaui/chromatic-cli/pull/576) ([@tmeasday](https://github.com/tmeasday))
- Document how to use the next version [#575](https://github.com/chromaui/chromatic-cli/pull/575) ([@tmeasday](https://github.com/tmeasday))
- Implement async build creation process [#562](https://github.com/chromaui/chromatic-cli/pull/562) ([@ghengeveld](https://github.com/ghengeveld))
- Use `Build.ancestors` to find replacement commit for rebased build [#566](https://github.com/chromaui/chromatic-cli/pull/566) ([@tmeasday](https://github.com/tmeasday))
- Create `release` script and document it [#572](https://github.com/chromaui/chromatic-cli/pull/572) ([@ghengeveld](https://github.com/ghengeveld))
- downcase the slug so we don't accidentally treat origin as fork [#554](https://github.com/chromaui/chromatic-cli/pull/554) ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Fix line splitting on Windows for Git output [#547](https://github.com/chromaui/chromatic-cli/pull/547) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `slug` for GitHub's `workflow_dispatch` event [#536](https://github.com/chromaui/chromatic-cli/pull/536) ([@patrick-mcdougle](https://github.com/patrick-mcdougle))
- Fix TurboSnap support for Storybook in a subdirectory (part 2) [#539](https://github.com/chromaui/chromatic-cli/pull/539) ([@yngvebn](https://github.com/yngvebn) [@ghengeveld](https://github.com/ghengeveld))
- Fix TurboSnap support for Storybook in a subdirectory [#527](https://github.com/chromaui/chromatic-cli/pull/527) ([@proshunsuke](https://github.com/proshunsuke) [@ghengeveld](https://github.com/ghengeveld))
- Fix `storybookUrl` by removing `iframe.html` suffix [#518](https://github.com/chromaui/chromatic-cli/pull/518) ([@ndelangen](https://github.com/ndelangen) [@ghengeveld](https://github.com/ghengeveld))
- Add TurboSnap support for Vite [#521](https://github.com/chromaui/chromatic-cli/pull/521) ([@IanVS](https://github.com/IanVS) [@ghengeveld](https://github.com/ghengeveld))
- Fix TurboSnap support for Storybook 6.5 with `.cjs` extension [#523](https://github.com/chromaui/chromatic-cli/pull/523) ([@IanVS](https://github.com/IanVS))
- Add support for custom npm registry url [#513](https://github.com/chromaui/chromatic-cli/pull/513) ([@ghengeveld](https://github.com/ghengeveld))
- Migrate to TypeScript [#505](https://github.com/chromaui/chromatic-cli/pull/505) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `pathname` support in proxy URL [#510](https://github.com/chromaui/chromatic-cli/pull/510) ([@l10rdev](https://github.com/l10rdev))
- Fix handling of missing `ref` and/or `sha` inputs on `workflow_dispatch` event [#501](https://github.com/chromaui/chromatic-cli/pull/501) ([@tmeasday](https://github.com/tmeasday))
- Handle the `CANCELLED` build status separately [#499](https://github.com/chromaui/chromatic-cli/pull/499) ([@ghengeveld](https://github.com/ghengeveld))
- Reformat help text and move `allowConsoleErrors` to deprecated options [#503](https://github.com/chromaui/chromatic-cli/pull/503) ([@ghengeveld](https://github.com/ghengeveld))
- Fix consistent naming of flags for `trace` util [#504](https://github.com/chromaui/chromatic-cli/pull/504) ([@ghengeveld](https://github.com/ghengeveld))
- Add `--force-rebuild` to prevent skipping on rebuild [#502](https://github.com/chromaui/chromatic-cli/pull/502) ([@ghengeveld](https://github.com/ghengeveld))
- Fix commit status update for UI Review when using `--skip` [#474](https://github.com/chromaui/chromatic-cli/pull/474) ([@tmeasday](https://github.com/tmeasday) [@ghengeveld](https://github.com/ghengeveld))
- TurboSnap: Detect mismatching entry file and suggest a fix [#490](https://github.com/chromaui/chromatic-cli/pull/490) ([@ghengeveld](https://github.com/ghengeveld))
- Allow tracing changed files to affected story files CH-1205 CH-1393 [#495](https://github.com/chromaui/chromatic-cli/pull/495) ([@ghengeveld](https://github.com/ghengeveld))
- Use commit author info instead of committer info [CH-1282] [#500](https://github.com/chromaui/chromatic-cli/pull/500) ([@ghengeveld](https://github.com/ghengeveld))
- Refactor GitHub workflows [#496](https://github.com/chromaui/chromatic-cli/pull/496) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `stats-to-story-files` util [#489](https://github.com/chromaui/chromatic-cli/pull/489) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `--untraced` for package files [#488](https://github.com/chromaui/chromatic-cli/pull/488) ([@ghengeveld](https://github.com/ghengeveld))
- Improve how process exit code is set [#487](https://github.com/chromaui/chromatic-cli/pull/487) ([@ghengeveld](https://github.com/ghengeveld) [@ndelangen](https://github.com/ndelangen))
- Fix missing exit code on rebuild [#492](https://github.com/chromaui/chromatic-cli/pull/492) ([@RobertStanyon](https://github.com/RobertStanyon))
- Fix `storybookBaseDir` option in GitHub Action [#491](https://github.com/chromaui/chromatic-cli/pull/491) ([@kylegach](https://github.com/kylegach))
- Add storybookBaseDir and zip inputs to GitHub Action [#491](https://github.com/chromaui/chromatic-cli/pull/491) ([@ghengeveld](https://github.com/ghengeveld))
- Output and upload diagnostics [#490](https://github.com/chromaui/chromatic-cli/pull/490) ([@ghengeveld](https://github.com/ghengeveld))
- Add `skip` documentation [#473](https://github.com/chromaui/chromatic-cli/pull/473) ([@tmeasday](https://github.com/tmeasday) [@ghengeveld](https://github.com/ghengeveld))
- Add `--untraced` flag to avoid retesting stories that depend on certain files [#461](https://github.com/chromaui/chromatic-cli/pull/461) ([@ghengeveld](https://github.com/ghengeveld))
- Fix commit details when using env var and warn if the commit is missing [#482](https://github.com/chromaui/chromatic-cli/pull/482) ([@ghengeveld](https://github.com/ghengeveld))
- Track `bailReason`, improve TurboSnap messaging and throw on 0 CSF globs [#458](https://github.com/chromaui/chromatic-cli/pull/458) ([@ghengeveld](https://github.com/ghengeveld))
- Add `--diagnostics` flag to write process context data to a file [#479](https://github.com/chromaui/chromatic-cli/pull/479) ([@yannbf](https://github.com/yannbf))
- fix: use correct project token for action workflow [#478](https://github.com/chromaui/chromatic-cli/pull/478) ([@yannbf](https://github.com/yannbf))
- Retry createBuild based on error messages [#477](https://github.com/chromaui/chromatic-cli/pull/477) ([@codykaup](https://github.com/codykaup))
- Increase unpack wait timeout to 3 minutes [#468](https://github.com/chromaui/chromatic-cli/pull/468) ([@codykaup](https://github.com/codykaup))
- remove requirement for the token [#465](https://github.com/chromaui/chromatic-cli/pull/465) ([@ndelangen](https://github.com/ndelangen))
- add workingDirectory input handler for action [#466](https://github.com/chromaui/chromatic-cli/pull/466) ([@ndelangen](https://github.com/ndelangen))
- Tech/allow many args CH-789 [#447](https://github.com/chromaui/chromatic-cli/pull/447) ([@ndelangen](https://github.com/ndelangen) [@ghengeveld](https://github.com/ghengeveld))
- Change "upload" to "publish" CH-816 CH-817 [#464](https://github.com/chromaui/chromatic-cli/pull/464) ([@codykaup](https://github.com/codykaup))
- Fix tests of makeZipFile CH-816 CH-817 [#463](https://github.com/chromaui/chromatic-cli/pull/463) ([@codykaup](https://github.com/codykaup))
- Support zip file upload CH-816 CH-817 [#459](https://github.com/chromaui/chromatic-cli/pull/459) ([@jmhobbs](https://github.com/jmhobbs) [@codykaup](https://github.com/codykaup))
- Throw error rather than bailing out of TurboSnap when tracing changed files fails [#457](https://github.com/chromaui/chromatic-cli/pull/457) ([@ghengeveld](https://github.com/ghengeveld))
- Add `--dry-run` to skip publishing CH-1068 [#456](https://github.com/chromaui/chromatic-cli/pull/456) ([@ghengeveld](https://github.com/ghengeveld))
- Add `--storybook-base-dir` to support TurboSnap with a prebuilt Storybook originating from a subdirectory [#455](https://github.com/chromaui/chromatic-cli/pull/455) ([@ghengeveld](https://github.com/ghengeveld))
- Add support for proxy authentication CH-813 [#444](https://github.com/chromaui/chromatic-cli/pull/444) ([@jmhobbs](https://github.com/jmhobbs) [@codykaup](https://github.com/codykaup) [@ghengeveld](https://github.com/ghengeveld))
- Deal with unnamed modules in stats file in webpack 5 [#449](https://github.com/chromaui/chromatic-cli/pull/449) ([@tmeasday](https://github.com/tmeasday))
- update next from main [#448](https://github.com/chromaui/chromatic-cli/pull/448) ([@ndelangen](https://github.com/ndelangen))
- Fix DEBUG env variable being set [#436](https://github.com/chromaui/chromatic-cli/pull/436) ([@dcastil](https://github.com/dcastil))
- Deal with files that are chunked with preview files [#440](https://github.com/chromaui/chromatic-cli/pull/440) ([@tmeasday](https://github.com/tmeasday))
- 🔥 Take into account 6.4 virtual story file locations [#439](https://github.com/chromaui/chromatic-cli/pull/439) ([@tmeasday](https://github.com/tmeasday))
- Add optional window arg to isChromatic [#433](https://github.com/chromaui/chromatic-cli/pull/433) ([@anilanar](https://github.com/anilanar))
- Tweak scripts based on some problems in real world usage [#428](https://github.com/chromaui/chromatic-cli/pull/428) ([@tmeasday](https://github.com/tmeasday))
- Fix action branch name [#423](https://github.com/chromaui/chromatic-cli/pull/423) ([@ghengeveld](https://github.com/ghengeveld))
- 6.0.4 [#423](https://github.com/chromaui/chromatic-cli/pull/423) ([@ghengeveld](https://github.com/ghengeveld))
- Downgrade meow [#423](https://github.com/chromaui/chromatic-cli/pull/423) ([@ghengeveld](https://github.com/ghengeveld))
- Fix build before publish [#423](https://github.com/chromaui/chromatic-cli/pull/423) ([@ghengeveld](https://github.com/ghengeveld))
- Check for globals at the root ([@ghengeveld](https://github.com/ghengeveld))
- change to make reading storybook version optional instead, assume modern if non was found/provided [#420](https://github.com/chromaui/chromatic-cli/pull/420) ([@ndelangen](https://github.com/ndelangen))
- fix the issue where require didn't work anymore [#417](https://github.com/chromaui/chromatic-cli/pull/417) ([@ndelangen](https://github.com/ndelangen))
- Ask yarn for packages instead of trying to resolve them [#411](https://github.com/chromaui/chromatic-cli/pull/411) ([@ndelangen](https://github.com/ndelangen))
- tech/add-test-workflow_run [#412](https://github.com/chromaui/chromatic-cli/pull/412) ([@ndelangen](https://github.com/ndelangen))
- Fix the version of `node-fetch` to `2.6.0` due to a bug in `2.6.3` [#404](https://github.com/chromaui/chromatic-cli/pull/404) ([@tmeasday](https://github.com/tmeasday))
- Better path handling for TurboSnap [#392](https://github.com/chromaui/chromatic-cli/pull/392) ([@ghengeveld](https://github.com/ghengeveld))
- Fix runtime issues with HTTP_PROXY / NO_PROXY [#397](https://github.com/chromaui/chromatic-cli/pull/397) ([@jmhobbs](https://github.com/jmhobbs) [@ghengeveld](https://github.com/ghengeveld))
- Update BuildHasChanges message to be clearer [#401](https://github.com/chromaui/chromatic-cli/pull/401) ([@domyen](https://github.com/domyen))
- minor improvements [#391](https://github.com/chromaui/chromatic-cli/pull/391) ([@ndelangen](https://github.com/ndelangen))
- Ignore `--only-changed` on rebuild [#370](https://github.com/chromaui/chromatic-cli/pull/370) ([@ghengeveld](https://github.com/ghengeveld))
- Support `workflow_dispatch` event in GitHub Action [#311](https://github.com/chromaui/chromatic-cli/pull/311) ([@lyleunderwood](https://github.com/lyleunderwood) [@ndelangen](https://github.com/ndelangen) [@ghengeveld](https://github.com/ghengeveld) [@tmeasday](https://github.com/tmeasday))
- Fix `isChromatic` for server-side rendering [#380](https://github.com/chromaui/chromatic-cli/pull/380) ([@AndrewLeedham](https://github.com/AndrewLeedham))
- Fix handling of NO_PROXY environment variable [#374](https://github.com/chromaui/chromatic-cli/pull/374) ([@ghengeveld](https://github.com/ghengeveld))
- Support absolute paths in webpack stats [#382](https://github.com/chromaui/chromatic-cli/pull/382) ([@ghengeveld](https://github.com/ghengeveld))
- Throw when specifying an invalid loglevel [#381](https://github.com/chromaui/chromatic-cli/pull/381) ([@ghengeveld](https://github.com/ghengeveld))
- Fix resolving webpack stats in subdirectory [#366](https://github.com/chromaui/chromatic-cli/pull/366) ([@ghengeveld](https://github.com/ghengeveld))
- Fix cross-fork builds from GitHub Action [#365](https://github.com/chromaui/chromatic-cli/pull/365) ([@ghengeveld](https://github.com/ghengeveld))
- Ignore `onlyChanged` on changes matching `externals` [#355](https://github.com/chromaui/chromatic-cli/pull/355) ([@ghengeveld](https://github.com/ghengeveld))
- Disallow publishing prerelease as action [#311](https://github.com/chromaui/chromatic-cli/pull/311) ([@ghengeveld](https://github.com/ghengeveld))
- Check existence and validity of package.json [#334](https://github.com/chromaui/chromatic-cli/pull/334) ([@ghengeveld](https://github.com/ghengeveld))
- Add support for proxy server [#347](https://github.com/chromaui/chromatic-cli/pull/347) ([@ghengeveld](https://github.com/ghengeveld))
- Drop spawnOptions, including preferLocal: true [#350](https://github.com/chromaui/chromatic-cli/pull/350) ([@ghengeveld](https://github.com/ghengeveld))
- Restore original behavior to use npm_execpath [#348](https://github.com/chromaui/chromatic-cli/pull/348) ([@ghengeveld](https://github.com/ghengeveld))
- Add documentation for workingDir and monorepo usage. [#336](https://github.com/chromaui/chromatic-cli/pull/336) ([@jmhobbs](https://github.com/jmhobbs) [@ghengeveld](https://github.com/ghengeveld))
- Restore implying of --preserve-missing when using --only [#345](https://github.com/chromaui/chromatic-cli/pull/345) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `chromatic` script that can be added to package.json [#337](https://github.com/chromaui/chromatic-cli/pull/337) ([@ghengeveld](https://github.com/ghengeveld))
- Fix determining viewLayer when using transitive dependency [#344](https://github.com/chromaui/chromatic-cli/pull/344) ([@ghengeveld](https://github.com/ghengeveld))
- Log clientVersion on fatal error [#331](https://github.com/chromaui/chromatic-cli/pull/331) ([@ghengeveld](https://github.com/ghengeveld))
- Support only testing components affected by recent git changes [#304](https://github.com/chromaui/chromatic-cli/pull/304) ([@ghengeveld](https://github.com/ghengeveld))
- Fix `npx chromatic` timing out on build-storybook [#305](https://github.com/chromaui/chromatic-cli/pull/305) ([@ghengeveld](https://github.com/ghengeveld) [@amacneil](https://github.com/amacneil))
- Retrieve viewLayer and version from dependencies and support @web/dev-server-storybook [#319](https://github.com/chromaui/chromatic-cli/pull/319) ([@ghengeveld](https://github.com/ghengeveld))
- Use original baseline for rebuilds (new build for the same commit) [#313](https://github.com/chromaui/chromatic-cli/pull/313) ([@ghengeveld](https://github.com/ghengeveld))
- Update Storybook addon metadata [#310](https://github.com/chromaui/chromatic-cli/pull/310) ([@coderkevin](https://github.com/coderkevin))
- 5.7.0 ([@ghengeveld](https://github.com/ghengeveld))
- Update CLI to use new `test` terminology and statuses [#287](https://github.com/chromaui/chromatic-cli/pull/287) ([@tmeasday](https://github.com/tmeasday) [@ghengeveld](https://github.com/ghengeveld))
- Gracefully handle git config command in Netlify [#295](https://github.com/chromaui/chromatic-cli/pull/295) ([@ghengeveld](https://github.com/ghengeveld))
- Strip `origin/*` prefix from branch name [#301](https://github.com/chromaui/chromatic-cli/pull/301) ([@ghengeveld](https://github.com/ghengeveld))
- Support Yarn 2 execpath [#296](https://github.com/chromaui/chromatic-cli/pull/296) ([@amacneil](https://github.com/amacneil))
- Fix tunnel builds [#306](https://github.com/chromaui/chromatic-cli/pull/306) ([@tmeasday](https://github.com/tmeasday))
- Document GitHub action outputs [#298](https://github.com/chromaui/chromatic-cli/pull/298) ([@mnquintana](https://github.com/mnquintana) [@ghengeveld](https://github.com/ghengeveld))
- Add @storybook/vue3 support [#297](https://github.com/chromaui/chromatic-cli/pull/297) ([@nisshii0313](https://github.com/nisshii0313))
- Revert "Upgrade to husky 5" [#289](https://github.com/chromaui/chromatic-cli/pull/289) ([@tmeasday](https://github.com/tmeasday))
- Upgrade to husky 5 [#288](https://github.com/chromaui/chromatic-cli/pull/288) ([@tmeasday](https://github.com/tmeasday))
- Fix `storybookUrl` in GitHub Action [#284](https://github.com/chromaui/chromatic-cli/pull/284) ([@ndelangen](https://github.com/ndelangen) [@ghengeveld](https://github.com/ghengeveld))
- Explicitly allow multiple project-tokens (last will be used) [#283](https://github.com/chromaui/chromatic-cli/pull/283) ([@ndelangen](https://github.com/ndelangen))
- v5.6.3 ([@ndelangen](https://github.com/ndelangen))
- revert meow upgrade [#282](https://github.com/chromaui/chromatic-cli/pull/282) ([@ndelangen](https://github.com/ndelangen))
- fix dist ([@ndelangen](https://github.com/ndelangen))
- Chore: Adds documentation on GH Action for ignoreLastBuildOnBranch option [#239](https://github.com/chromaui/chromatic-cli/pull/239) ([@jonniebigodes](https://github.com/jonniebigodes) [@ndelangen](https://github.com/ndelangen))
- Record CI service name on build [#269](https://github.com/chromaui/chromatic-cli/pull/269) ([@ghengeveld](https://github.com/ghengeveld) [@ndelangen](https://github.com/ndelangen))
- Fix/10minute timeout action [#278](https://github.com/chromaui/chromatic-cli/pull/278) ([@ndelangen](https://github.com/ndelangen))
- Fix overriding Storybook version through environment variable [#231](https://github.com/chromaui/chromatic-cli/pull/231) ([@SasanFarrokh](https://github.com/SasanFarrokh) [@ghengeveld](https://github.com/ghengeveld))
- Record the repository slug to support builds from forks [#193](https://github.com/chromaui/chromatic-cli/pull/193) ([@ghengeveld](https://github.com/ghengeveld))
- Add `--branch-name` flag to override branch name [#233](https://github.com/chromaui/chromatic-cli/pull/233) ([@ghengeveld](https://github.com/ghengeveld))
- Avoid passing --silent when invoking npm through Node.js script [#237](https://github.com/chromaui/chromatic-cli/pull/237) ([@ghengeveld](https://github.com/ghengeveld))
- regen lockfile [#225](https://github.com/chromaui/chromatic-cli/pull/225) ([@ndelangen](https://github.com/ndelangen))
- Chore: Update readme example for the action [#214](https://github.com/chromaui/chromatic-cli/pull/214) ([@jonniebigodes](https://github.com/jonniebigodes) [@ndelangen](https://github.com/ndelangen))
- Use commit determined by env-ci [#216](https://github.com/chromaui/chromatic-cli/pull/216) ([@travi](https://github.com/travi) [@ndelangen](https://github.com/ndelangen))
- Make sure isChromatic returns a boolean [#218](https://github.com/chromaui/chromatic-cli/pull/218) ([@kylesuss](https://github.com/kylesuss) [@ndelangen](https://github.com/ndelangen))
- Fix/ci and actions [#220](https://github.com/chromaui/chromatic-cli/pull/220) ([@ndelangen](https://github.com/ndelangen))
- Throw error when running from shallow clone [#207](https://github.com/chromaui/chromatic-cli/pull/207) ([@ghengeveld](https://github.com/ghengeveld))
- ADD support for pull_request_target event [#203](https://github.com/chromaui/chromatic-cli/pull/203) ([@ndelangen](https://github.com/ndelangen))
- ADD pull_request_review to list of allowed events [#204](https://github.com/chromaui/chromatic-cli/pull/204) ([@ndelangen](https://github.com/ndelangen))
- Improve error messages when build-storybook fails [#208](https://github.com/chromaui/chromatic-cli/pull/208) ([@ghengeveld](https://github.com/ghengeveld))
- Handle 'no stories' error with custom messaging [#206](https://github.com/chromaui/chromatic-cli/pull/206) ([@ghengeveld](https://github.com/ghengeveld))
- Add sign-in link to error message [#187](https://github.com/chromaui/chromatic-cli/pull/187) ([@ghengeveld](https://github.com/ghengeveld))
- Add link to docs [#188](https://github.com/chromaui/chromatic-cli/pull/188) ([@ghengeveld](https://github.com/ghengeveld))
- Better ways to retrieve the branch name [#194](https://github.com/chromaui/chromatic-cli/pull/194) ([@ghengeveld](https://github.com/ghengeveld))
- Merge action into CLI package structure [#195](https://github.com/chromaui/chromatic-cli/pull/195) ([@ghengeveld](https://github.com/ghengeveld))
- Support squash merges natively [#174](https://github.com/chromaui/chromatic-cli/pull/174) ([@tmeasday](https://github.com/tmeasday))
- ADD storybookOptions to the input for chromatic [#50](https://github.com/chromaui/chromatic-cli/pull/50) ([@ndelangen](https://github.com/ndelangen))
- v3.0.3 [#46](https://github.com/chromaui/chromatic-cli/pull/46) ([@ndelangen](https://github.com/ndelangen))
- Fix/GitHub actions [#43](https://github.com/chromaui/chromatic-cli/pull/43) ([@ndelangen](https://github.com/ndelangen))
- Tech/add test for GitHub action [#42](https://github.com/chromaui/chromatic-cli/pull/42) ([@ndelangen](https://github.com/ndelangen))
- Better error message for when build-storybook fails [#172](https://github.com/chromaui/chromatic-cli/pull/172) ([@ghengeveld](https://github.com/ghengeveld))
- Use actual output dir and warn about it [#165](https://github.com/chromaui/chromatic-cli/pull/165) ([@ghengeveld](https://github.com/ghengeveld) [@felixfbecker](https://github.com/felixfbecker))
- Throw an error if the sourceDir does not contain a valid Storybook build [#164](https://github.com/chromaui/chromatic-cli/pull/164) ([@ghengeveld](https://github.com/ghengeveld) [@ndelangen](https://github.com/ndelangen))
- Add TypeScript types [#159](https://github.com/chromaui/chromatic-cli/pull/159) ([@felixfbecker](https://github.com/felixfbecker))
- ADD chroma bin [#33](https://github.com/chromaui/chromatic-cli/pull/33) ([@ndelangen](https://github.com/ndelangen))
- Fix yarn cmd in README [#150](https://github.com/chromaui/chromatic-cli/pull/150) ([@oliverlloyd](https://github.com/oliverlloyd))
- Fix the --skip flag and have it accept a glob for branch names [#149](https://github.com/chromaui/chromatic-cli/pull/149) ([@ghengeveld](https://github.com/ghengeveld))
- Generate JUnit XML report file when passing --report flag [#148](https://github.com/chromaui/chromatic-cli/pull/148) ([@ghengeveld](https://github.com/ghengeveld))
- Remove JSDOM [#145](https://github.com/chromaui/chromatic-cli/pull/145) ([@ghengeveld](https://github.com/ghengeveld))
- New UI based on Listr [#140](https://github.com/chromaui/chromatic-cli/pull/140) ([@ghengeveld](https://github.com/ghengeveld))
- ADD mock for execCommand [#139](https://github.com/chromaui/chromatic-cli/pull/139) ([@ndelangen](https://github.com/ndelangen))
- Better cross platform compatibility for --patch-build [#138](https://github.com/chromaui/chromatic-cli/pull/138) ([@ghengeveld](https://github.com/ghengeveld))
- Some README updates [#132](https://github.com/chromaui/chromatic-cli/pull/132) ([@tmeasday](https://github.com/tmeasday))
- Fix typo [#135](https://github.com/chromaui/chromatic-cli/pull/135) ([@aarongarciah](https://github.com/aarongarciah))
- Add support for running in a github action [#23](https://github.com/chromaui/chromatic-cli/pull/23) ([@ndelangen](https://github.com/ndelangen))
- UPDATE changelog [#114](https://github.com/chromaui/chromatic-cli/pull/114) ([@ndelangen](https://github.com/ndelangen) [@ghengeveld](https://github.com/ghengeveld))
- Update support emails [#130](https://github.com/chromaui/chromatic-cli/pull/130) ([@kylesuss](https://github.com/kylesuss) [@tmeasday](https://github.com/tmeasday))
- ADD ignored regions test with new data-attribute method & css-class [#129](https://github.com/chromaui/chromatic-cli/pull/129) ([@ndelangen](https://github.com/ndelangen))
- Fix crash when code uses random generators (eg. uuid) [#128](https://github.com/chromaui/chromatic-cli/pull/128) ([@jakubriedl](https://github.com/jakubriedl) [@ndelangen](https://github.com/ndelangen))
- Set cache-control header on uploaded builds [#124](https://github.com/chromaui/chromatic-cli/pull/124) ([@tmeasday](https://github.com/tmeasday))
- Show "Continue setup at ..." link after running the very first build [#123](https://github.com/chromaui/chromatic-cli/pull/123) ([@ghengeveld](https://github.com/ghengeveld))
- overhaul the jsdom shims [#116](https://github.com/chromaui/chromatic-cli/pull/116) ([@ndelangen](https://github.com/ndelangen))
- ADD actions for testing with staging [#122](https://github.com/chromaui/chromatic-cli/pull/122) ([@ndelangen](https://github.com/ndelangen))
- Fix Intl mocks version 2 [#120](https://github.com/chromaui/chromatic-cli/pull/120) ([@tmeasday](https://github.com/tmeasday) [@ndelangen](https://github.com/ndelangen))
- 4.0.0-alpha.2 ([@tmeasday](https://github.com/tmeasday))
- needs to be a string ([@tmeasday](https://github.com/tmeasday))
- 4.0.0-alpha.1 ([@tmeasday](https://github.com/tmeasday))
- Not sure what happened here? ([@tmeasday](https://github.com/tmeasday))
- Update v4-alpha ([@tmeasday](https://github.com/tmeasday))
- Update package.json/publish script to go to chromatic ([@tmeasday](https://github.com/tmeasday))
- Merge remote-tracking branch 'origin/next' into fix/remove-nodeenv-development [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@tmeasday](https://github.com/tmeasday))
- ADD extra parameters [#107](https://github.com/chromaui/chromatic-cli/pull/107) ([@ndelangen](https://github.com/ndelangen) [@tmeasday](https://github.com/tmeasday))
- CHANGE the output when building storybook fails [#112](https://github.com/chromaui/chromatic-cli/pull/112) ([@ndelangen](https://github.com/ndelangen) [@tmeasday](https://github.com/tmeasday))
- Create patch build [#110](https://github.com/chromaui/chromatic-cli/pull/110) ([@ghengeveld](https://github.com/ghengeveld) [@github-actions[bot]](https://github.com/github-actions[bot]))
- Waiting behaviour [#111](https://github.com/chromaui/chromatic-cli/pull/111) ([@tmeasday](https://github.com/tmeasday) [@github-actions[bot]](https://github.com/github-actions[bot]))
- MIGRATE to new lint-staged config (no git add required) ([@ndelangen](https://github.com/ndelangen))
- FIX lint-staged && UPGRADES ([@ndelangen](https://github.com/ndelangen))
- RENAME appCode to projectToken [#109](https://github.com/chromaui/chromatic-cli/pull/109) ([@ndelangen](https://github.com/ndelangen))
- Fix/94 needs crossenv [#105](https://github.com/chromaui/chromatic-cli/pull/105) ([@ndelangen](https://github.com/ndelangen))
- Clean up the help text. ([@ghengeveld](https://github.com/ghengeveld))
- Tech/add log to promote exitflag [#108](https://github.com/chromaui/chromatic-cli/pull/108) ([@ndelangen](https://github.com/ndelangen))
- Upgrades [#106](https://github.com/chromaui/chromatic-cli/pull/106) ([@ndelangen](https://github.com/ndelangen))
- Update 'Storybook was not build' language [#102](https://github.com/chromaui/chromatic-cli/pull/102) ([@kylesuss](https://github.com/kylesuss))
- Update language on getRuntimeSpecs console output when hasErrors [#99](https://github.com/chromaui/chromatic-cli/pull/99) ([@kylesuss](https://github.com/kylesuss) [@ndelangen](https://github.com/ndelangen))
- Fix/10 stop logging logconfig [#17](https://github.com/chromaui/chromatic-cli/pull/17) ([@ndelangen](https://github.com/ndelangen))
- Publishing 3.5.2 ([@tmeasday](https://github.com/tmeasday))
- Fix issue with `jsdom@16.2` [#96](https://github.com/chromaui/chromatic-cli/pull/96) ([@tmeasday](https://github.com/tmeasday))
- FIX chromaui/action/issues/14 [#92](https://github.com/chromaui/chromatic-cli/pull/92) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- Manually retry uploads, recreating streams each time [#12](https://github.com/chromaui/chromatic-cli/pull/12) ([@tmeasday](https://github.com/tmeasday))
- Merge branch 'fix/remove-nodeenv-development' of github.com:chromaui/chromatic-cli into fix/remove-nodeenv-development [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@ndelangen](https://github.com/ndelangen))
- Merge branch 'next' into fix/remove-nodeenv-development [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@ndelangen](https://github.com/ndelangen))
- Next release [#74](https://github.com/chromaui/chromatic-cli/pull/74) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]) [@tmeasday](https://github.com/tmeasday))
- Upgrades [#89](https://github.com/chromaui/chromatic-cli/pull/89) ([@ndelangen](https://github.com/ndelangen))
- Merge pull request #87 from chromaui/fix/fix-on-error [#87](https://github.com/chromaui/chromatic-cli/pull/87) ([@ndelangen](https://github.com/ndelangen))
- FIX loglevel [#86](https://github.com/chromaui/chromatic-cli/pull/86) ([@ndelangen](https://github.com/ndelangen))
- REMOVE the setting of NODE_ENV completely [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@ndelangen](https://github.com/ndelangen))
- Fix/better error reporting [#85](https://github.com/chromaui/chromatic-cli/pull/85) ([@ndelangen](https://github.com/ndelangen))
- ADD throw on runtime errors [#82](https://github.com/chromaui/chromatic-cli/pull/82) ([@ndelangen](https://github.com/ndelangen))
- UPGRADE storybook & remove unneeded (and problematic require-context-plugin) [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@ndelangen](https://github.com/ndelangen))
- REMOVE both env variables added for no good reason [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@ndelangen](https://github.com/ndelangen))
- FIX alwaysFn by copying static properties unto fn [#84](https://github.com/chromaui/chromatic-cli/pull/84) ([@ndelangen](https://github.com/ndelangen))
- ADD web-components as valid storybook app package name [#83](https://github.com/chromaui/chromatic-cli/pull/83) ([@ndelangen](https://github.com/ndelangen))
- ADD extra information about build to github action [#72](https://github.com/chromaui/chromatic-cli/pull/72) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- CHANGE URL.createObjectURL to writable: true [#70](https://github.com/chromaui/chromatic-cli/pull/70) ([@ndelangen](https://github.com/ndelangen))
- Fix/url shims should be writable [#71](https://github.com/chromaui/chromatic-cli/pull/71) ([@ndelangen](https://github.com/ndelangen))
- REMOVE implementation [#67](https://github.com/chromaui/chromatic-cli/pull/67) ([@ndelangen](https://github.com/ndelangen))
- Release review PR [#61](https://github.com/chromaui/chromatic-cli/pull/61) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]) [@tmeasday](https://github.com/tmeasday) [@benjaminkay93](https://github.com/benjaminkay93))
- Add --exit-once-sent-to-chromatic flag [#63](https://github.com/chromaui/chromatic-cli/pull/63) ([@benjaminkay93](https://github.com/benjaminkay93) [@ndelangen](https://github.com/ndelangen))
- Use prBranch when available [#60](https://github.com/chromaui/chromatic-cli/pull/60) ([@ndelangen](https://github.com/ndelangen))
- IMPROVE logging when git fails [#55](https://github.com/chromaui/chromatic-cli/pull/55) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- Fix/4 incorrect url [#6](https://github.com/chromaui/chromatic-cli/pull/6) ([@ndelangen](https://github.com/ndelangen))
- Fix/2 cannot use tunnel [#5](https://github.com/chromaui/chromatic-cli/pull/5) ([@ndelangen](https://github.com/ndelangen))
- ADD a workflow that runs on windows [#56](https://github.com/chromaui/chromatic-cli/pull/56) ([@ndelangen](https://github.com/ndelangen))
- v3.1.0 [#54](https://github.com/chromaui/chromatic-cli/pull/54) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- ADD unfetch as a fetch polyfill, as it's not in JSDom by default? [#51](https://github.com/chromaui/chromatic-cli/pull/51) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- Allow use of Intl without new operator [#53](https://github.com/chromaui/chromatic-cli/pull/53) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- ADD svg polyfills [#52](https://github.com/chromaui/chromatic-cli/pull/52) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))
- Merge branch 'master' into release/v1 [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- CHANGE default of exitZeroOnChanges to true [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- CHANGE name of the action [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- UPGRADE to latest of chromatic-cli [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- 3.0.3 ([@ndelangen](https://github.com/ndelangen))
- release v1 [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- REFACTOR to apply environment variables for correct sha & branch && CHANGE when a deployment is considered failed [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- ADD some debugging info [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- IMPROVE readme && More error handling [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- FIX readme [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- handle hard failure deployment [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- set options to maybe [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- ADD some data into options to see what happens [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- log the options for debugging [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- FIX the entrypoint, cannot invoke main [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- compile to commonjs, because typescript is not playing along [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- compile to esm & support esm at runtime && compile to es2017 - cause why not [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- actually do chromatic stuff [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- ADD a deployment, do stuff in chromatic-cli, and complete deployment [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- experiment with deployment status & url [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- CHANGE to no required_contexts [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- experiment with deployments [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- ADD token [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- CHANGE to use github toolkit only [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- Experimenting with github api [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- FIX yaml [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- SPLIT unit tests into it's own action [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- REMOVE test that were boilerplate [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- CHANGE test name && use yarn [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- CHANGE options to be for chromatic [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- initial commit [#226](https://github.com/chromaui/chromatic-cli/pull/226) ([@ndelangen](https://github.com/ndelangen))
- Release 3.0.2 [#38](https://github.com/chromaui/chromatic-cli/pull/38) ([@tmeasday](https://github.com/tmeasday) [@ndelangen](https://github.com/ndelangen) [@NMinhNguyen](https://github.com/NMinhNguyen))
- Add LICENSE file [#39](https://github.com/chromaui/chromatic-cli/pull/39) ([@ndelangen](https://github.com/ndelangen) [@NMinhNguyen](https://github.com/NMinhNguyen))
- FIX 34 - respect the CHROMA_* env variables [#36](https://github.com/chromaui/chromatic-cli/pull/36) ([@ndelangen](https://github.com/ndelangen))
- Log upload success [#35](https://github.com/chromaui/chromatic-cli/pull/35) ([@ndelangen](https://github.com/ndelangen) [@tmeasday](https://github.com/tmeasday))
- FIX missing addons info in debug [#37](https://github.com/chromaui/chromatic-cli/pull/37) ([@ndelangen](https://github.com/ndelangen))
- v3.0.0 [#29](https://github.com/chromaui/chromatic-cli/pull/29) ([@ndelangen](https://github.com/ndelangen) [@tmeasday](https://github.com/tmeasday))
- Fix/paths [#28](https://github.com/chromaui/chromatic-cli/pull/28) ([@ndelangen](https://github.com/ndelangen))
- Fix/24 correct warn logging [#25](https://github.com/chromaui/chromatic-cli/pull/25) ([@ndelangen](https://github.com/ndelangen))
- Fix/indent [#20](https://github.com/chromaui/chromatic-cli/pull/20) ([@ndelangen](https://github.com/ndelangen))
- Exit hard after success, do not wait for bulky logs [#19](https://github.com/chromaui/chromatic-cli/pull/19) ([@ndelangen](https://github.com/ndelangen))
- CHANGE default loglevel to 'error' and make it configurable [#18](https://github.com/chromaui/chromatic-cli/pull/18) ([@ndelangen](https://github.com/ndelangen))
- Fix/4 incorrect url still [#16](https://github.com/chromaui/chromatic-cli/pull/16) ([@ndelangen](https://github.com/ndelangen))
- Fix/3 force exit again [#7](https://github.com/chromaui/chromatic-cli/pull/7) ([@ndelangen](https://github.com/ndelangen) [@tmeasday](https://github.com/tmeasday))
- Final touches ([@ndelangen](https://github.com/ndelangen))
- v1.0.0-debug.3 ([@ndelangen](https://github.com/ndelangen))
- FIX serializers ([@ndelangen](https://github.com/ndelangen))
- CHANGE package name to storybook-chromatic ([@ndelangen](https://github.com/ndelangen))
- REMOVE refactor ([@ndelangen](https://github.com/ndelangen))
- FIX v5 detection ([@ndelangen](https://github.com/ndelangen))
- ADD support for multiple app_code flags, last one wins ([@ndelangen](https://github.com/ndelangen))
- CHANGE the timeout limit for ContentLoadEvent ([@ndelangen](https://github.com/ndelangen))
- REMOVE module entrypoint as it's broken in IE11 ([@ndelangen](https://github.com/ndelangen))
- ADD version to log ([@ndelangen](https://github.com/ndelangen))
- FIX review comments ([@ndelangen](https://github.com/ndelangen))
- ADD dist to git && ADD ci check is dist is valid && FIX for JSDOM not having correct userAgent ([@ndelangen](https://github.com/ndelangen))
- apply https://github.com/chromaui/chromatic/commit/6498379171eb4ce2ae39d25eff8e9b9c4bb2fa67 ([@ndelangen](https://github.com/ndelangen))
- ADD documentation about environment variables ([@ndelangen](https://github.com/ndelangen))
- IMPROVE formatting ([@ndelangen](https://github.com/ndelangen))
- Update README.md ([@ndelangen](https://github.com/ndelangen))
- ADD demo image ([@ndelangen](https://github.com/ndelangen))
- version 1.0.0-debug.1 ([@ndelangen](https://github.com/ndelangen))
- ADD information on usage with npx ([@ndelangen](https://github.com/ndelangen))
- FIX linting ([@ndelangen](https://github.com/ndelangen))
- ADD e2e to CI ([@ndelangen](https://github.com/ndelangen))
- FIX publish script ([@ndelangen](https://github.com/ndelangen))
- apply https://github.com/chromaui/chromatic/commit/1b08684a56f2136310c34a0f22667e0a48316f62 ([@ndelangen](https://github.com/ndelangen))
- ADD versioning info ([@ndelangen](https://github.com/ndelangen))
- Update README.md ([@zol](https://github.com/zol))
- ADD ability to pass flags into publish script && document publishing procedure ([@ndelangen](https://github.com/ndelangen))
- IMPROVE readme ([@ndelangen](https://github.com/ndelangen))
- first open source commit, I had to remove history, because there were passwords in it [#81](https://github.com/chromaui/chromatic-cli/pull/81) ([@ndelangen](https://github.com/ndelangen))

#### ⚠️ Pushed to `main`

- Fix util scripts ([@ghengeveld](https://github.com/ghengeveld))
- Update changelog ([@ghengeveld](https://github.com/ghengeveld))
- 7.2.0 ([@tmeasday](https://github.com/tmeasday))
- Step package.json back ([@tmeasday](https://github.com/tmeasday))
- 7.2.0-next.1 ([@tmeasday](https://github.com/tmeasday))
- 7.2.0-next.0 ([@tmeasday](https://github.com/tmeasday))
- 7.1.0 ([@ghengeveld](https://github.com/ghengeveld))
- 7.1.0 ([@tmeasday](https://github.com/tmeasday))
- 7.1.0-next.0 ([@tmeasday](https://github.com/tmeasday))
- 7.0.0 ([@ghengeveld](https://github.com/ghengeveld))
- 7.0.0-next.0 ([@ghengeveld](https://github.com/ghengeveld))
- Update CHANGELOG.md ([@thafryer](https://github.com/thafryer))
- 6.24.1 ([@thafryer](https://github.com/thafryer))
- 6.24.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.23.1 ([@ghengeveld](https://github.com/ghengeveld))
- 6.23.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.23.0 ([@tmeasday](https://github.com/tmeasday))
- 6.23.0-next.0 ([@tmeasday](https://github.com/tmeasday))
- 6.22.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.21.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.20.0 ([@thafryer](https://github.com/thafryer))
- 6.19.9 ([@thafryer](https://github.com/thafryer))
- 6.19.8 ([@thafryer](https://github.com/thafryer))
- 6.19.7 ([@ghengeveld](https://github.com/ghengeveld))
- 6.19.6 ([@tmeasday](https://github.com/tmeasday))
- Update Changelog ([@tmeasday](https://github.com/tmeasday))
- 6.19.5 ([@tmeasday](https://github.com/tmeasday))
- Update changelog ([@tmeasday](https://github.com/tmeasday))
- Update changelog again ([@tmeasday](https://github.com/tmeasday))
- 6.19.4 ([@tmeasday](https://github.com/tmeasday))
- 6.19.3 ([@tmeasday](https://github.com/tmeasday))
- Update CHANGELOG ([@tmeasday](https://github.com/tmeasday))
- 6.19.2 ([@tmeasday](https://github.com/tmeasday))
- 6.19.2-canary.0 ([@tmeasday](https://github.com/tmeasday))
- Only override flags if set ([@tmeasday](https://github.com/tmeasday))
- 6.19.1 ([@tmeasday](https://github.com/tmeasday))
- Ensure we publish all JS files in `dist/` ([@tmeasday](https://github.com/tmeasday))
- Update type locations ([@tmeasday](https://github.com/tmeasday))
- 6.19.0 ([@tmeasday](https://github.com/tmeasday))
- 6.18.1 ([@tmeasday](https://github.com/tmeasday))
- Fix lockfile ([@ghengeveld](https://github.com/ghengeveld))
- Revert yarn lockfile and package changes ([@ghengeveld](https://github.com/ghengeveld))
- 6.18.0 ([@ghengeveld](https://github.com/ghengeveld))
- Configure modern Yarn to use Yarn 1 (for now) ([@ghengeveld](https://github.com/ghengeveld))
- 6.17.4 ([@thafryer](https://github.com/thafryer))
- 6.17.1 ([@ghengeveld](https://github.com/ghengeveld))
- Bump snyk-nodejs-lockfile-parser ([@ghengeveld](https://github.com/ghengeveld))
- remove flag on main ([@ethriel3695](https://github.com/ethriel3695))
- Move flag to correct position ([@ethriel3695](https://github.com/ethriel3695))
- add flag ([@ethriel3695](https://github.com/ethriel3695))
- Update webpack node targets ([@ethriel3695](https://github.com/ethriel3695))
- 6.17.0 ([@thafryer](https://github.com/thafryer))
- 6.16.0 ([@thafryer](https://github.com/thafryer))
- 6.15.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.14.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.13.1 ([@ghengeveld](https://github.com/ghengeveld))
- 6.13.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.12.0 ([@ghengeveld](https://github.com/ghengeveld))
- Use 'prepare' lifecycle hook rather than 'prepublishOnly' ([@ghengeveld](https://github.com/ghengeveld))
- Fix deprecated npm hook ([@ghengeveld](https://github.com/ghengeveld))
- Drop action changelog and fix action readme ([@ghengeveld](https://github.com/ghengeveld))
- 6.11.4 ([@ghengeveld](https://github.com/ghengeveld))
- 6.11.3 ([@skitterm](https://github.com/skitterm))
- 6.11.2 ([@skitterm](https://github.com/skitterm))
- Update CHANGELOG.md ([@skitterm](https://github.com/skitterm))
- 6.11.1 ([@tmeasday](https://github.com/tmeasday))
- Version number was wrong ([@tmeasday](https://github.com/tmeasday))
- Merge branch 'tom/ap-2470-add-debug-to-chromatic-action' ([@tmeasday](https://github.com/tmeasday))
- 6.10.5 ([@tmeasday](https://github.com/tmeasday))
- 6.10.2 ([@ghengeveld](https://github.com/ghengeveld))
- 6.10.2 ([@thafryer](https://github.com/thafryer))
- 6.10.1 ([@tmeasday](https://github.com/tmeasday))
- Update Changelog for release ([@tmeasday](https://github.com/tmeasday))
- 6.10.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.9.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.8.1 ([@ghengeveld](https://github.com/ghengeveld))
- Update CHANGELOG.md ([@ghengeveld](https://github.com/ghengeveld))
- 6.8.0 ([@ghengeveld](https://github.com/ghengeveld))
- Make sure we publish the oss-licenses.json file ([@ghengeveld](https://github.com/ghengeveld))
- Clean output dir when building, add oss-licenses.json and add explainer comment to top of action/main.js ([@ghengeveld](https://github.com/ghengeveld))
- Update bug_report.md ([@ghengeveld](https://github.com/ghengeveld))
- Add issue templates ([@ghengeveld](https://github.com/ghengeveld))
- Create SUPPORT.md ([@ghengeveld](https://github.com/ghengeveld))
- Create SECURITY.md ([@ghengeveld](https://github.com/ghengeveld))
- 6.7.4 ([@ghengeveld](https://github.com/ghengeveld))
- 6.7.3 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Merge branch 'main' of https://github.com/chromaui/chromatic-cli ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Update CHANGELOG.md ([@JonathanKolnik](https://github.com/JonathanKolnik))
- 6.7.2 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Allow releasing only the action and make sure we build it even if we don't publish to npm ([@ghengeveld](https://github.com/ghengeveld))
- 6.7.0 ([@ghengeveld](https://github.com/ghengeveld))
- Update release.js ([@ghengeveld](https://github.com/ghengeveld))
- 6.6.4 ([@ghengeveld](https://github.com/ghengeveld))
- Fix release script ([@ghengeveld](https://github.com/ghengeveld))
- Restore npm dist-tag command by explicitly passing --otp ([@ghengeveld](https://github.com/ghengeveld))
- 6.6.3 ([@ghengeveld](https://github.com/ghengeveld))
- Fix split on undefined ([@ghengeveld](https://github.com/ghengeveld))
- 6.6.2 ([@ghengeveld](https://github.com/ghengeveld))
- Fix setting dist-tag after latest release ([@ghengeveld](https://github.com/ghengeveld))
- 6.6.1 ([@ghengeveld](https://github.com/ghengeveld))
- Use chromaui/action-next to test against production ([@ghengeveld](https://github.com/ghengeveld))
- Force default npm registry (not yarn registry) ([@ghengeveld](https://github.com/ghengeveld))
- Support promoting canary to next ([@ghengeveld](https://github.com/ghengeveld))
- 6.5.4 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- 6.5.4-next.0 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- [skip] 6.5.4 ([@JonathanKolnik](https://github.com/JonathanKolnik))
- 6.5.3 ([@ghengeveld](https://github.com/ghengeveld))
- 6.5.2 ([@ghengeveld](https://github.com/ghengeveld))
- 6.5.1 ([@ghengeveld](https://github.com/ghengeveld))
- Fix: Cannot read property 'startsWith' of null ([@ghengeveld](https://github.com/ghengeveld))
- 6.5.0 ([@ghengeveld](https://github.com/ghengeveld))
- Update storyName and make a visual change ([@ghengeveld](https://github.com/ghengeveld))
- Add smoke test for Node 16 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.3 ([@ghengeveld](https://github.com/ghengeveld))
- Also upload build-storybook.log artifact ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.3-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.3 unreleased ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.2 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.2-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- Update when to use --storybook-base-dir ([@ghengeveld](https://github.com/ghengeveld))
- Fix how paths are normalized ([@ghengeveld](https://github.com/ghengeveld))
- Remove unused import ([@ghengeveld](https://github.com/ghengeveld))
- Formatting ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.1 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.1-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.0 ([@ghengeveld](https://github.com/ghengeveld))
- Fix chalk ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.0-canary.2 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.0-canary.1 ([@ghengeveld](https://github.com/ghengeveld))
- 6.4.0-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.4 ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.3 ([@ghengeveld](https://github.com/ghengeveld))
- Add test for array flags ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.3-canary.1 ([@ghengeveld](https://github.com/ghengeveld))
- Restore warnings ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.3-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- Filter empty input from array ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.2 ([@ghengeveld](https://github.com/ghengeveld))
- Disable externals warning ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.1 ([@ghengeveld](https://github.com/ghengeveld))
- Disable untraced warning ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.0 unreleased ([@ghengeveld](https://github.com/ghengeveld))
- Fix bailed message ([@ghengeveld](https://github.com/ghengeveld))
- 6.3.0-canary.1 ([@ghengeveld](https://github.com/ghengeveld))
- Avoid optional chaining and target node12 ([@ghengeveld](https://github.com/ghengeveld))
- Update README.md ([@ghengeveld](https://github.com/ghengeveld))
- 6.2.3 ([@ghengeveld](https://github.com/ghengeveld))
- Can't use optional chaining in node12 ([@ghengeveld](https://github.com/ghengeveld))
- 6.2.2 ([@ghengeveld](https://github.com/ghengeveld))
- Fix test ([@ghengeveld](https://github.com/ghengeveld))
- Rewrite GraphQL client error handling ([@ghengeveld](https://github.com/ghengeveld))
- 6.2.1 ([@codykaup](https://github.com/codykaup))
- 6.2.1 ([@ghengeveld](https://github.com/ghengeveld))
- 6.2.0 ([@ghengeveld](https://github.com/ghengeveld))
- 6.2.0 ([@ndelangen](https://github.com/ndelangen))
- Add missing mock ([@ghengeveld](https://github.com/ghengeveld))
- 6.1.0 ([@ghengeveld](https://github.com/ghengeveld))
- Drop 'v' prefix because it looks weird with semver ranges ([@ghengeveld](https://github.com/ghengeveld))
- 6.0.6 ([@ghengeveld](https://github.com/ghengeveld))
- 6.0.5 and 6.0.6 ([@ghengeveld](https://github.com/ghengeveld))
- 6.0.3 ([@ghengeveld](https://github.com/ghengeveld))
- Simplify optional getStorybookInfo ([@ghengeveld](https://github.com/ghengeveld))
- Merge branch 'main' into next ([@ghengeveld](https://github.com/ghengeveld))
- update changelog ([@ndelangen](https://github.com/ndelangen))
- 5.10.2 ([@ndelangen](https://github.com/ndelangen))
- 5.10.1 ([@tmeasday](https://github.com/tmeasday))
- 5.10.0 ([@ghengeveld](https://github.com/ghengeveld))
- 5.10.0-canary.3 ([@ghengeveld](https://github.com/ghengeveld))
- Upgrade Storybook ([@ghengeveld](https://github.com/ghengeveld))
- Add stats-to-story-files and trim-stats-file scripts ([@ghengeveld](https://github.com/ghengeveld))
- Update dist ([@ghengeveld](https://github.com/ghengeveld))
- 5.10.0-canary.2 ([@ghengeveld](https://github.com/ghengeveld))
- 5.10.0-canary.1 ([@ghengeveld](https://github.com/ghengeveld))
- 5.10.0-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- 5.10.0-next.0 ([@ghengeveld](https://github.com/ghengeveld))
- Use Node LTS version for CircleCI ([@ghengeveld](https://github.com/ghengeveld))
- Remove logging ([@ghengeveld](https://github.com/ghengeveld))
- Debugging ([@ghengeveld](https://github.com/ghengeveld))
- Log error ([@ghengeveld](https://github.com/ghengeveld))
- Test ([@ghengeveld](https://github.com/ghengeveld))
- Nullify changedFiles rather than unsetting it ([@ghengeveld](https://github.com/ghengeveld))
- Set initial mock value ([@ghengeveld](https://github.com/ghengeveld))
- Skip externals test ([@ghengeveld](https://github.com/ghengeveld))
- Revert "Revert "Extract to function"" ([@ghengeveld](https://github.com/ghengeveld))
- Revert "Extract to function" ([@ghengeveld](https://github.com/ghengeveld))
- Fix yml ([@ghengeveld](https://github.com/ghengeveld))
- Fix story ([@ghengeveld](https://github.com/ghengeveld))
- master -> main ([@ghengeveld](https://github.com/ghengeveld))
- Fix support for Windows path separators in configDir and staticDir ([@ghengeveld](https://github.com/ghengeveld))
- Use version as commit message ([@ghengeveld](https://github.com/ghengeveld))
- 5.9.2 ([@ghengeveld](https://github.com/ghengeveld))
- Branch name should not contain owner name prefix ([@ghengeveld](https://github.com/ghengeveld))
- 5.9.1 ([@ghengeveld](https://github.com/ghengeveld))
- 5.9.0 ([@ghengeveld](https://github.com/ghengeveld))
- Merge branch 'master' into next ([@ghengeveld](https://github.com/ghengeveld))
- Disallow publishing prerelease as action ([@ghengeveld](https://github.com/ghengeveld))
- 5.9.0-next.0 ([@ghengeveld](https://github.com/ghengeveld))
- 5.9.0 - unreleased ([@ghengeveld](https://github.com/ghengeveld))
- 5.8.3 ([@ghengeveld](https://github.com/ghengeveld))
- Use setup-node action ([@ghengeveld](https://github.com/ghengeveld))
- Set LOG_LEVEL ([@ghengeveld](https://github.com/ghengeveld))
- Use canary action ([@ghengeveld](https://github.com/ghengeveld))
- Automatically publish action after npm publish ([@ghengeveld](https://github.com/ghengeveld))
- 5.8.2 ([@ghengeveld](https://github.com/ghengeveld))
- 5.8.1 ([@ghengeveld](https://github.com/ghengeveld))
- Merge branch 'next' ([@ghengeveld](https://github.com/ghengeveld))
- Fix tests ([@ghengeveld](https://github.com/ghengeveld))
- Add link to changelog ([@ghengeveld](https://github.com/ghengeveld))
- 5.8.0 ([@ghengeveld](https://github.com/ghengeveld))
- Revert "Fix chromatic token" ([@ghengeveld](https://github.com/ghengeveld))
- Fix chromatic token ([@ghengeveld](https://github.com/ghengeveld))
- 5.7.1 ([@ghengeveld](https://github.com/ghengeveld))
- 5.7.1-canary.0 ([@ghengeveld](https://github.com/ghengeveld))
- Better logging when Storybook validation fails ([@ghengeveld](https://github.com/ghengeveld))
- Add missing dependency and upgrade Storybook to latest RC ([@ghengeveld](https://github.com/ghengeveld))
- 5.7.0 ([@ghengeveld](https://github.com/ghengeveld))
- We're already at 5.6.3 ([@ghengeveld](https://github.com/ghengeveld))
- Update tag warning ([@ghengeveld](https://github.com/ghengeveld))
- Adopt prerelease scheme from 'auto' ([@ghengeveld](https://github.com/ghengeveld))
- Update compiled action ([@ghengeveld](https://github.com/ghengeveld))
- Merge branch 'master' into next ([@ndelangen](https://github.com/ndelangen))
- 5.6.2 ([@ndelangen](https://github.com/ndelangen))
- fix dist ([@ndelangen](https://github.com/ndelangen))
- Revert "Add missing flags in action config" ([@ghengeveld](https://github.com/ghengeveld))
- Add missing flags in action config ([@ghengeveld](https://github.com/ghengeveld))
- Show owner name in git info message ([@ghengeveld](https://github.com/ghengeveld))
- Update lockfile ([@ghengeveld](https://github.com/ghengeveld))
- 5.6.1 ([@ghengeveld](https://github.com/ghengeveld))
- Release 5.6.1 ([@ghengeveld](https://github.com/ghengeveld))
- Update localtunnel dependency to fix Axios vulnerability ([@ghengeveld](https://github.com/ghengeveld))
- 5.6.1-rc.0 ([@ghengeveld](https://github.com/ghengeveld))
- 5.6.0 ([@ghengeveld](https://github.com/ghengeveld))
- Add npm version badge. ([@ghengeveld](https://github.com/ghengeveld))
- 5.6.0-rc.0 ([@ghengeveld](https://github.com/ghengeveld))
- 5.5.0 ([@ndelangen](https://github.com/ndelangen))
- v4.0.3 ([@ghengeveld](https://github.com/ghengeveld))
- 4.0.3 ([@ghengeveld](https://github.com/ghengeveld))
- Add note about migrating the package. ([@ghengeveld](https://github.com/ghengeveld))
- Update CHANGELOG.md ([@tmeasday](https://github.com/tmeasday))
- v4.0.2 ([@tmeasday](https://github.com/tmeasday))
- Fix my fix ([@tmeasday](https://github.com/tmeasday))
- Version 4.0.1 ([@tmeasday](https://github.com/tmeasday))
- Fix script command for package.json ([@tmeasday](https://github.com/tmeasday))
- Merge remote-tracking branch 'origin/next' ([@tmeasday](https://github.com/tmeasday))
- Avoid wrapping expected errors with our support message. ([@ghengeveld](https://github.com/ghengeveld))
- version ([@ndelangen](https://github.com/ndelangen))
- Fix getRandomValues ([@jakubriedl](https://github.com/jakubriedl))
- Updates README for 2.0 ([@zol](https://github.com/zol))
- Get rid of the 'param-case' package. ([@ghengeveld](https://github.com/ghengeveld))
- FIX tests ([@ndelangen](https://github.com/ndelangen))
- CORRECT next version ([@ndelangen](https://github.com/ndelangen))
- CHANGE dist ([@ndelangen](https://github.com/ndelangen))
- FIX lockfile ([@ndelangen](https://github.com/ndelangen))
- Merge branch 'master' of github.com:chromaui/chromatic-cli ([@ndelangen](https://github.com/ndelangen))
- Mark options for tunneled builds as deprecated ([@ghengeveld](https://github.com/ghengeveld))
- 3.4.1 ([@ndelangen](https://github.com/ndelangen))
- 3.4.0 ([@ndelangen](https://github.com/ndelangen))
- FIX publish script ([@ndelangen](https://github.com/ndelangen))
- 3.3.0 ([@ndelangen](https://github.com/ndelangen))
- ADD changelog ([@ndelangen](https://github.com/ndelangen))
- Merge branch 'next' ([@ndelangen](https://github.com/ndelangen))
- 3.1.0 ([@ndelangen](https://github.com/ndelangen))
- Add link to issues in readme ([@tmeasday](https://github.com/tmeasday))
- Add repo links to package.json ([@tmeasday](https://github.com/tmeasday))
- init repo ([@ndelangen](https://github.com/ndelangen))

#### 📝 Documentation

- FIX #119 - better messages during reporting in CLI [#125](https://github.com/chromaui/chromatic-cli/pull/125) ([@ndelangen](https://github.com/ndelangen) [@tmeasday](https://github.com/tmeasday))
- REMOVE references to options that would use the tunnel [#69](https://github.com/chromaui/chromatic-cli/pull/69) ([@ndelangen](https://github.com/ndelangen) [@github-actions[bot]](https://github.com/github-actions[bot]))

#### 🔩 Dependency Updates

- Bump http-cache-semantics from 4.1.0 to 4.1.1 [#711](https://github.com/chromaui/chromatic-cli/pull/711) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump webpack from 5.72.1 to 5.76.0 [#725](https://github.com/chromaui/chromatic-cli/pull/725) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump json5 from 1.0.1 to 1.0.2 in /subdir [#705](https://github.com/chromaui/chromatic-cli/pull/705) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump json5 from 1.0.1 to 1.0.2 [#704](https://github.com/chromaui/chromatic-cli/pull/704) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump minimatch from 3.0.4 to 3.1.2 [#693](https://github.com/chromaui/chromatic-cli/pull/693) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump decode-uri-component from 0.2.0 to 0.2.2 [#687](https://github.com/chromaui/chromatic-cli/pull/687) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump qs from 6.5.2 to 6.5.3 [#688](https://github.com/chromaui/chromatic-cli/pull/688) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump decode-uri-component from 0.2.0 to 0.2.2 in /subdir [#690](https://github.com/chromaui/chromatic-cli/pull/690) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump express from 4.17.1 to 4.18.2 in /subdir [#691](https://github.com/chromaui/chromatic-cli/pull/691) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump express from 4.17.1 to 4.18.2 [#692](https://github.com/chromaui/chromatic-cli/pull/692) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump loader-utils from 1.4.0 to 1.4.2 in /subdir [#679](https://github.com/chromaui/chromatic-cli/pull/679) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump loader-utils from 1.4.0 to 1.4.2 [#678](https://github.com/chromaui/chromatic-cli/pull/678) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump node-fetch from 3.0.0 to 3.2.10 [#644](https://github.com/chromaui/chromatic-cli/pull/644) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@thafryer](https://github.com/thafryer))
- Bump terser from 4.8.0 to 4.8.1 in /subdir [#609](https://github.com/chromaui/chromatic-cli/pull/609) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump minimist from 1.2.5 to 1.2.6 in /subdir [#555](https://github.com/chromaui/chromatic-cli/pull/555) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump @actions/core from 1.5.0 to 1.9.1 [#631](https://github.com/chromaui/chromatic-cli/pull/631) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump minimist from 1.2.5 to 1.2.6 [#553](https://github.com/chromaui/chromatic-cli/pull/553) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump shell-quote from 1.7.2 to 1.7.3 [#594](https://github.com/chromaui/chromatic-cli/pull/594) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump node-fetch from 2.6.6 to 2.6.7 in /subdir [#511](https://github.com/chromaui/chromatic-cli/pull/511) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump moment from 2.29.1 to 2.29.4 [#601](https://github.com/chromaui/chromatic-cli/pull/601) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump terser from 4.8.0 to 4.8.1 [#607](https://github.com/chromaui/chromatic-cli/pull/607) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump follow-redirects from 1.14.7 to 1.14.9 [#528](https://github.com/chromaui/chromatic-cli/pull/528) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump ansi-html from 0.0.7 to 0.0.8 [#545](https://github.com/chromaui/chromatic-cli/pull/545) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump url-parse from 1.5.3 to 1.5.10 [#538](https://github.com/chromaui/chromatic-cli/pull/538) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump follow-redirects from 1.14.4 to 1.14.7 [#498](https://github.com/chromaui/chromatic-cli/pull/498) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bundle code into a single file without dependencies [#393](https://github.com/chromaui/chromatic-cli/pull/393) ([@ndelangen](https://github.com/ndelangen))
- Bump postcss from 7.0.35 to 7.0.36 [#367](https://github.com/chromaui/chromatic-cli/pull/367) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump trim-newlines from 3.0.0 to 3.0.1 [#363](https://github.com/chromaui/chromatic-cli/pull/363) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump ws from 7.4.1 to 7.4.6 [#354](https://github.com/chromaui/chromatic-cli/pull/354) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump hosted-git-info from 2.8.8 to 2.8.9 [#339](https://github.com/chromaui/chromatic-cli/pull/339) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump lodash from 4.17.20 to 4.17.21 [#338](https://github.com/chromaui/chromatic-cli/pull/338) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump ssri from 6.0.1 to 6.0.2 [#322](https://github.com/chromaui/chromatic-cli/pull/322) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump elliptic from 6.5.3 to 6.5.4 [#302](https://github.com/chromaui/chromatic-cli/pull/302) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump node-notifier from 8.0.0 to 8.0.1 [#228](https://github.com/chromaui/chromatic-cli/pull/228) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump ini from 1.3.5 to 1.3.8 [#224](https://github.com/chromaui/chromatic-cli/pull/224) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Upgrades [#223](https://github.com/chromaui/chromatic-cli/pull/223) ([@ndelangen](https://github.com/ndelangen))
- improve and upgrade dependencies [#200](https://github.com/chromaui/chromatic-cli/pull/200) ([@ndelangen](https://github.com/ndelangen))
- Bump node-fetch from 2.6.0 to 2.6.1 [#185](https://github.com/chromaui/chromatic-cli/pull/185) ([@dependabot[bot]](https://github.com/dependabot[bot]) [@ghengeveld](https://github.com/ghengeveld))
- Bump lodash from 4.17.15 to 4.17.19 [#161](https://github.com/chromaui/chromatic-cli/pull/161) ([@dependabot[bot]](https://github.com/dependabot[bot]))
- Bump websocket-extensions from 0.1.3 to 0.1.4 [#147](https://github.com/chromaui/chromatic-cli/pull/147) ([@dependabot[bot]](https://github.com/dependabot[bot]))

#### Authors: 54

- [@108EAA0A](https://github.com/108EAA0A)
- [@dependabot[bot]](https://github.com/dependabot[bot])
- [@github-actions[bot]](https://github.com/github-actions[bot])
- [@jonniebigodes](https://github.com/jonniebigodes)
- [@RobertStanyon](https://github.com/RobertStanyon)
- [@Sealos](https://github.com/Sealos)
- Aarón García Hervás ([@aarongarciah](https://github.com/aarongarciah))
- Adrian Macneil ([@amacneil](https://github.com/amacneil))
- Andrew Leedham ([@AndrewLeedham](https://github.com/AndrewLeedham))
- Andrew Ortwein ([@andrewortwein](https://github.com/andrewortwein))
- Anıl Anar ([@anilanar](https://github.com/anilanar))
- Benjamin Kay ([@benjaminkay93](https://github.com/benjaminkay93))
- Bryan Joseph ([@bryanjos](https://github.com/bryanjos))
- Cody Kaup ([@codykaup](https://github.com/codykaup))
- Daniel Green ([@radfahrer](https://github.com/radfahrer))
- Dany Castillo ([@dcastil](https://github.com/dcastil))
- David Lichtsteiner ([@l10rdev](https://github.com/l10rdev))
- Dominic Nguyen ([@domyen](https://github.com/domyen))
- Felix Becker ([@felixfbecker](https://github.com/felixfbecker))
- Gert Hengeveld ([@ghengeveld](https://github.com/ghengeveld))
- Helio Machado ([@0x2b3bfa0](https://github.com/0x2b3bfa0))
- Ian VanSchooten ([@IanVS](https://github.com/IanVS))
- Jack Howard ([@JackHowa](https://github.com/JackHowa))
- Jakub Riedl ([@jakubriedl](https://github.com/jakubriedl))
- Jarel Fryer ([@thafryer](https://github.com/thafryer))
- John Hobbs ([@jmhobbs](https://github.com/jmhobbs))
- Jono Kolnik ([@JonathanKolnik](https://github.com/JonathanKolnik))
- Kevin Killingsworth ([@coderkevin](https://github.com/coderkevin))
- Kyle Gach ([@kylegach](https://github.com/kylegach))
- Kyle Suss ([@kylesuss](https://github.com/kylesuss))
- Kyler Jensen ([@kylerjensen](https://github.com/kylerjensen))
- kyo9bo ([@kk3939](https://github.com/kk3939))
- Lyle Underwood ([@lyleunderwood](https://github.com/lyleunderwood))
- Machisté N. Quintana ([@mnquintana](https://github.com/mnquintana))
- Mark Newell ([@alright-fine](https://github.com/alright-fine))
- Matt Travi ([@travi](https://github.com/travi))
- Matthew Weeks ([@weeksling](https://github.com/weeksling))
- Minh Nguyen ([@NMinhNguyen](https://github.com/NMinhNguyen))
- Norbert de Langen ([@ndelangen](https://github.com/ndelangen))
- Oliver Lloyd ([@oliverlloyd](https://github.com/oliverlloyd))
- Patrick McDougle ([@patrick-mcdougle](https://github.com/patrick-mcdougle))
- Paul Elliott ([@paulelliott](https://github.com/paulelliott))
- pro_shunsuke ([@proshunsuke](https://github.com/proshunsuke))
- Reuben Ellis ([@ethriel3695](https://github.com/ethriel3695))
- Sasan Farrokh ([@SasanFarrokh](https://github.com/SasanFarrokh))
- Simon Taggart ([@SiTaggart](https://github.com/SiTaggart))
- Steel Fu ([@steel](https://github.com/steel))
- Steven Kitterman ([@skitterm](https://github.com/skitterm))
- Tim Helfensdörfer ([@thelfensdrfer](https://github.com/thelfensdrfer))
- Tom Coleman ([@tmeasday](https://github.com/tmeasday))
- Yann Braga ([@yannbf](https://github.com/yannbf))
- Yngve Bakken Nilsen ([@yngvebn](https://github.com/yngvebn))
- Yuta Imanishi ([@nisshii0313](https://github.com/nisshii0313))
- Zoltan Olah ([@zol](https://github.com/zol))

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
