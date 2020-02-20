"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const index_1 = require("storybook-chromatic/bin/tester/index");
const verify_option_1 = require("storybook-chromatic/bin/lib/verify-option");
const maybe = (a, b = undefined) => {
    if (!a) {
        return b;
    }
    try {
        return JSON.parse(a);
    }
    catch (e) {
        return a;
    }
};
const getCommit = (event) => {
    switch (event.eventName) {
        case 'pull_request': {
            return {
                // @ts-ignore
                owner: event.payload.repository.owner.login,
                // @ts-ignore
                repo: event.payload.repository.name,
                // @ts-ignore
                branch: event.payload.pull_request.head.ref,
                // @ts-ignore
                ref: event.ref || event.payload.pull_request.head.ref,
                // @ts-ignore
                sha: event.payload.pull_request.head.sha,
            };
        }
        case 'push': {
            return {
                // @ts-ignore
                owner: event.payload.repository.owner.login,
                // @ts-ignore
                repo: event.payload.repository.name,
                branch: event.payload.ref.replace('refs/heads/', ''),
                ref: event.payload.ref,
                sha: event.payload.after,
            };
        }
        default:
            {
                core_1.setFailed(event.eventName + ' event is not supported in this action');
                return null;
            }
            ;
    }
};
async function runChromatic(options) {
    const { exitCode, exitUrl } = await index_1.runTest(await verify_option_1.verifyOptions(options));
    return {
        url: exitUrl,
        code: exitCode,
    };
}
const getApi = () => {
    try {
        const token = core_1.getInput('token');
        return new github_1.GitHub(token);
    }
    catch (e) {
        core_1.setFailed(e.message);
        return null;
    }
};
async function run() {
    const api = getApi();
    const commit = getCommit(github_1.context);
    if (!api || !commit) {
        return;
    }
    const { branch, sha } = commit;
    try {
        const appCode = core_1.getInput('appCode');
        const buildScriptName = core_1.getInput('buildScriptName');
        const scriptName = core_1.getInput('scriptName');
        const exec = core_1.getInput('exec');
        const doNotStart = core_1.getInput('doNotStart');
        const storybookPort = core_1.getInput('storybookPort');
        const storybookUrl = core_1.getInput('storybookUrl');
        const storybookBuildDir = core_1.getInput('storybookBuildDir');
        const storybookHttps = core_1.getInput('storybookHttps');
        const storybookCert = core_1.getInput('storybookCert');
        const storybookKey = core_1.getInput('storybookKey');
        const storybookCa = core_1.getInput('storybookCa');
        const autoAcceptChanges = core_1.getInput('autoAcceptChanges');
        const allowConsoleErrors = core_1.getInput('allowConsoleErrors');
        const exitZeroOnChanges = core_1.getInput('exitZeroOnChanges');
        const exitOnceUploaded = core_1.getInput('exitOnceUploaded');
        const ignoreLastBuildOnBranch = core_1.getInput('ignoreLastBuildOnBranch');
        process.env.CHROMATIC_SHA = sha;
        process.env.CHROMATIC_BRANCH = branch;
        const chromatic = runChromatic({
            appCode,
            buildScriptName: maybe(buildScriptName),
            scriptName: maybe(scriptName),
            exec: maybe(exec),
            doNotStart: maybe(doNotStart),
            storybookPort: maybe(storybookPort),
            storybookUrl: maybe(storybookUrl),
            storybookBuildDir: maybe(storybookBuildDir),
            storybookHttps: maybe(storybookHttps),
            storybookCert: maybe(storybookCert),
            storybookKey: maybe(storybookKey),
            storybookCa: maybe(storybookCa),
            fromCI: true,
            interactive: false,
            autoAcceptChanges: maybe(autoAcceptChanges),
            exitZeroOnChanges: maybe(exitZeroOnChanges, true),
            exitOnceUploaded: maybe(exitOnceUploaded, false),
            allowConsoleErrors: maybe(allowConsoleErrors, false),
            ignoreLastBuildOnBranch: maybe(ignoreLastBuildOnBranch),
        });
        const [{ url, code }] = await Promise.all([
            chromatic,
        ]);
        core_1.setOutput('url', url);
        core_1.setOutput('code', code.toString());
    }
    catch (e) {
        e.message && core_1.error(e.message);
        e.stack && core_1.error(e.stack);
        e.description && core_1.error(e.description);
        core_1.setFailed(e.message);
    }
}
run();
