"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
exports.__esModule = true;
var core_1 = require("@actions/core");
var github_1 = require("@actions/github");
var jsonfile_1 = require("jsonfile");
var pkg_up_1 = __importDefault(require("pkg-up"));
var uuid_1 = require("uuid");
var path_1 = __importDefault(require("path"));
var getEnv_1 = __importDefault(require("../bin/lib/getEnv"));
var log_1 = require("../bin/lib/log");
var parseArgs_1 = __importDefault(require("../bin/lib/parseArgs"));
var main_1 = require("../bin/main");
var maybe = function (a, b) {
    if (b === void 0) { b = undefined; }
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
var getCommit = function (event) {
    switch (event.eventName) {
        case 'pull_request':
        case 'pull_request_review':
        case 'pull_request_target': {
            return {
                owner: event.payload.repository.owner.login,
                repo: event.payload.repository.name,
                branch: event.payload.pull_request.head.ref,
                ref: event.ref || event.payload.pull_request.head.ref,
                sha: event.payload.pull_request.head.sha
            };
        }
        case 'push': {
            return {
                owner: event.payload.repository.owner.login,
                repo: event.payload.repository.name,
                branch: event.payload.ref.replace('refs/heads/', ''),
                ref: event.payload.ref,
                sha: event.payload.after
            };
        }
        default: {
            core_1.setFailed(event.eventName + " event is not supported in this action");
            return null;
        }
    }
};
function runChromatic(options) {
    var _a, _b, _c;
    return __awaiter(this, void 0, void 0, function () {
        var sessionId, env, log, packagePath, packageJson, ctx;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    sessionId = uuid_1.v4();
                    env = getEnv_1["default"]();
                    log = log_1.createLogger(sessionId, env);
                    return [4 /*yield*/, pkg_up_1["default"]()];
                case 1:
                    packagePath = _d.sent();
                    return [4 /*yield*/, jsonfile_1.readFile(packagePath)];
                case 2:
                    packageJson = _d.sent();
                    ctx = __assign(__assign({}, parseArgs_1["default"]([])), { packagePath: packagePath,
                        packageJson: packageJson,
                        env: env,
                        log: log,
                        sessionId: sessionId, flags: options });
                    return [4 /*yield*/, main_1.runAll(ctx)];
                case 3:
                    _d.sent();
                    return [2 /*return*/, {
                            url: (_a = ctx.build) === null || _a === void 0 ? void 0 : _a.webUrl,
                            code: ctx.exitCode,
                            buildUrl: (_b = ctx.build) === null || _b === void 0 ? void 0 : _b.webUrl,
                            storybookUrl: (_c = ctx.build) === null || _c === void 0 ? void 0 : _c.cachedUrl
                        }];
            }
        });
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var commit, branch, sha, projectToken, workingDir, buildScriptName, scriptName, exec, skip, only, onlyChanged, doNotStart, storybookPort, storybookUrl, storybookBuildDir, storybookHttps, storybookCert, storybookKey, storybookCa, preserveMissing, autoAcceptChanges, allowConsoleErrors, exitZeroOnChanges, exitOnceUploaded, ignoreLastBuildOnBranch, output, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    commit = getCommit(github_1.context);
                    if (!commit) {
                        return [2 /*return*/];
                    }
                    branch = commit.branch, sha = commit.sha;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    projectToken = core_1.getInput('projectToken') || core_1.getInput('appCode');
                    workingDir = core_1.getInput('workingDir');
                    buildScriptName = core_1.getInput('buildScriptName');
                    scriptName = core_1.getInput('scriptName');
                    exec = core_1.getInput('exec');
                    skip = core_1.getInput('skip');
                    only = core_1.getInput('only');
                    onlyChanged = core_1.getInput('onlyChanged');
                    doNotStart = core_1.getInput('doNotStart');
                    storybookPort = core_1.getInput('storybookPort');
                    storybookUrl = core_1.getInput('storybookUrl');
                    storybookBuildDir = core_1.getInput('storybookBuildDir');
                    storybookHttps = core_1.getInput('storybookHttps');
                    storybookCert = core_1.getInput('storybookCert');
                    storybookKey = core_1.getInput('storybookKey');
                    storybookCa = core_1.getInput('storybookCa');
                    preserveMissing = core_1.getInput('preserveMissing');
                    autoAcceptChanges = core_1.getInput('autoAcceptChanges');
                    allowConsoleErrors = core_1.getInput('allowConsoleErrors');
                    exitZeroOnChanges = core_1.getInput('exitZeroOnChanges');
                    exitOnceUploaded = core_1.getInput('exitOnceUploaded');
                    ignoreLastBuildOnBranch = core_1.getInput('ignoreLastBuildOnBranch');
                    process.env.CHROMATIC_SHA = sha;
                    process.env.CHROMATIC_BRANCH = branch;
                    process.chdir(path_1["default"].join(process.cwd(), workingDir || ''));
                    return [4 /*yield*/, runChromatic({
                            projectToken: projectToken,
                            workingDir: maybe(workingDir),
                            buildScriptName: maybe(buildScriptName),
                            scriptName: maybe(scriptName),
                            exec: maybe(exec),
                            skip: maybe(skip),
                            only: maybe(only),
                            onlyChanged: maybe(onlyChanged),
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
                            preserveMissing: maybe(preserveMissing),
                            autoAcceptChanges: maybe(autoAcceptChanges),
                            exitZeroOnChanges: maybe(exitZeroOnChanges, true),
                            exitOnceUploaded: maybe(exitOnceUploaded, false),
                            allowConsoleErrors: maybe(allowConsoleErrors, false),
                            ignoreLastBuildOnBranch: maybe(ignoreLastBuildOnBranch)
                        })];
                case 2:
                    output = _a.sent();
                    core_1.setOutput('url', output.url);
                    core_1.setOutput('buildUrl', output.buildUrl);
                    core_1.setOutput('storybookUrl', output.storybookUrl);
                    core_1.setOutput('code', output.code.toString());
                    if (output.code !== 0) {
                        core_1.setFailed('non-zero exit code');
                    }
                    process.exit(output.code);
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    if (e_1.message)
                        core_1.error(e_1.message);
                    if (e_1.stack)
                        core_1.error(e_1.stack);
                    if (e_1.description)
                        core_1.error(e_1.description);
                    core_1.setFailed(e_1.message);
                    process.exit(1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
run();
