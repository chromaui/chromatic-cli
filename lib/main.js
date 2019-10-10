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
        core_1.info('deployment_id: ' + id);
        github.repos.createDeploymentStatus(Object.assign(Object.assign({}, github_1.context.repo), { deployment_id: id, state: "in_progress" }));
        const exitCode = await index_1.runTest(verify_option_1.verifyOptions({
            appCode,
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
        core_1.setFailed(e.message);
    }
}
run();
