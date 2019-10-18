"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const index_1 = require("storybook-chromatic/bin/tester/index");
const verify_option_1 = require("storybook-chromatic/bin/lib/verify-option");
const maybe = (a) => {
    if (!a) {
        return undefined;
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
            core_1.info(JSON.stringify(event, null, 2));
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
async function chromatic(options) {
    const { exitCode, url } = await index_1.runTest(await verify_option_1.verifyOptions(options));
    return {
        url,
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
    let deployment_id = NaN;
    const api = getApi();
    const commit = getCommit(github_1.context);
    if (!api || !commit) {
        return;
    }
    const { branch, repo, owner, sha } = commit;
    core_1.info(JSON.stringify({ commit }, null, 2));
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
        const deployment = await api.repos.createDeployment({
            repo,
            owner,
            ref: branch,
            environment: 'chromatic',
            required_contexts: [],
        });
        deployment_id = deployment.data.id;
        await api.repos.createDeploymentStatus({
            repo,
            owner,
            deployment_id,
            state: 'pending',
        });
        process.env.CHROMATIC_SHA = sha;
        process.env.CHROMATIC_BRANCH = branch;
        const { url, code } = await chromatic({
            appCode,
            fromCI: true,
            interactive: false,
            exitZeroOnChanges: true,
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
        });
        await api.repos.createDeploymentStatus({
            repo,
            owner,
            deployment_id,
            state: 'success',
            environment_url: url
        });
        core_1.setOutput('url', url);
        core_1.setOutput('code', code.toString());
        if (code !== 0) {
            core_1.setFailed('go to ' + url + ' to view the failed|rejected|pending snapshots');
        }
    }
    catch (e) {
        e.message && core_1.error(e.message);
        e.stack && core_1.error(e.stack);
        e.description && core_1.error(e.description);
        if (typeof deployment_id === 'number' && !isNaN(deployment_id)) {
            try {
                await api.repos.createDeploymentStatus({
                    repo,
                    owner,
                    deployment_id,
                    state: 'success',
                });
            }
            catch (e) {
                //
            }
        }
        core_1.setFailed(e.message);
    }
}
run();
