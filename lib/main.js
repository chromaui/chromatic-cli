"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@actions/core");
const github_1 = require("@actions/github");
const index_1 = require("storybook-chromatic/bin/tester/index");
const verify_option_1 = require("storybook-chromatic/bin/lib/verify-option");
async function run() {
    try {
        const token = core_1.getInput('token');
        const github = new github_1.GitHub(token);
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
        const { data: { id } } = await github.repos.createDeployment(Object.assign(Object.assign({}, github_1.context.repo), { ref: github_1.context.sha, environment: 'staging', required_contexts: [] }));
        github.repos.createDeploymentStatus(Object.assign(Object.assign({}, github_1.context.repo), { deployment_id: id, state: "in_progress" }));
        try {
            core_1.info('options: ' + JSON.stringify({
                buildScriptName,
                scriptName,
                exec,
                doNotStart,
                storybookPort,
                storybookUrl,
                storybookBuildDir,
                storybookHttps,
                storybookCert,
                storybookKey,
                storybookCa,
            }, null, 2));
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
            core_1.info('!!appCode' + JSON.stringify(!!appCode));
            core_1.info('!appCode' + JSON.stringify(!appCode));
            core_1.info('appCode.length' + JSON.stringify(appCode.length));
            core_1.info('appCode[0]' + JSON.stringify(appCode[0]));
            const exitCode = await index_1.runTest(verify_option_1.verifyOptions({
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
            }));
            const url = 'https://example.com?real';
            const status = exitCode === 0 ? 'success' : 'failure';
            github.repos.createDeploymentStatus(Object.assign(Object.assign({}, github_1.context.repo), { deployment_id: id, state: status, environment_url: url, log_url: 'https://example.com?log' }));
            core_1.setOutput('url', url);
        }
        catch (e) {
            e.message && core_1.error(e.message);
            e.stack && core_1.error(e.stack);
            e.description && core_1.error(e.description);
            github.repos.createDeploymentStatus(Object.assign(Object.assign({}, github_1.context.repo), { deployment_id: id, state: 'failure' }));
            core_1.setFailed(e.message);
        }
    }
    catch (e) {
        core_1.setFailed(e.message);
    }
}
run();
