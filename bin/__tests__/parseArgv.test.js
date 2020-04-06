import { getStorybookConfiguration } from '../storybook/get-configuration';
import { parseArgv } from '../main';

jest.mock('../constants', () => ({
  CHROMATIC_CREATE_TUNNEL: true,
  CHROMATIC_PROJECT_TOKEN: 'env-code',
}));

jest.mock('jsonfile', () => ({
  readFileSync: () => ({
    scripts: {
      storybook: 'start-storybook -p 1337',
      otherStorybook: 'start-storybook -p 7070',
      notStorybook: 'lint',
      'build-storybook': 'build-storybook',
      otherBuildStorybook: 'build-storybook',
    },
  }),
}));

process.env.CHROMATIC_PROJECT_TOKEN = 'test';

describe('await parseArgv', () => {
  it('sets reasonable defaults', async () => {
    expect(await parseArgv(['--project-token', 'cli-code'])).toMatchObject({
      projectToken: 'cli-code',
      buildScriptName: 'build-storybook',
      noStart: true,
      fromCI: false,
      autoAcceptChanges: undefined,
      exitZeroOnChanges: undefined,
      exitOnceUploaded: undefined,
      interactive: true,
      verbose: false,
      createTunnel: true,
      originalArgv: ['--project-token', 'cli-code'],
    });
  });

  it('picks up project-token from environment', async () => {
    expect(await parseArgv([])).toMatchObject({
      projectToken: 'env-code',
    });
  });

  it('allows you to override defaults for boolean options', async () => {
    expect(
      await parseArgv([
        '--ci',
        '--auto-accept-changes',
        '--exit-zero-on-changes',
        '--exit-once-uploaded',
        '--skip',
        '--debug',
        '--no-interactive',
      ])
    ).toMatchObject({
      skip: true,
      fromCI: true,
      autoAcceptChanges: true,
      exitZeroOnChanges: true,
      exitOnceUploaded: true,
      verbose: true,
      interactive: false,
      createTunnel: true,
    });
  });

  it('picks up default start script', async () => {
    expect(await parseArgv(['-s'])).toMatchObject({
      scriptName: 'storybook',
      url: 'http://localhost:1337/iframe.html',
      noStart: false,
    });
  });

  it('allows you to specify alternate build script', async () => {
    expect(await parseArgv(['--build-script-name', 'otherBuildStorybook'])).toMatchObject({
      buildScriptName: 'otherBuildStorybook',
    });
  });

  it('allows you to specify alternate script, still picks up port', async () => {
    expect(await parseArgv(['--script-name', 'otherStorybook'])).toMatchObject({
      scriptName: 'otherStorybook',
      url: 'http://localhost:7070/iframe.html',
      noStart: false,
    });
  });

  it('allows you to specify alternate script, that does not start Storybook, if you set port', async () => {
    expect(
      await parseArgv(['--script-name', 'notStorybook', '--storybook-port', '6060'])
    ).toMatchObject({
      scriptName: 'notStorybook',
      url: 'http://localhost:6060/iframe.html',
    });
  });

  it('throws if you try to specify a script name that is not a Storybook, if you do NOT set port', async () => {
    await expect(parseArgv(['--script-name', 'notStorybook'])).rejects.toThrow(/must pass a port/);
  });

  it('allows you to specify alternate command if you set port', async () => {
    expect(
      await parseArgv(['--exec', 'storybook-command', '--storybook-port', '6060'])
    ).toMatchObject({
      exec: 'storybook-command',
      url: 'http://localhost:6060/iframe.html',
    });
  });

  it('throws if you try to specify a command name, if you do NOT set port', async () => {
    await expect(parseArgv(['--exec', 'storybook-command'])).rejects.toThrow(/must pass a port/);
  });

  it('throws if you try to pass a script or command name and a url', async () => {
    await expect(
      parseArgv(['--exec', 'storybook-command', '--storybook-url', 'http://foo.bar'])
    ).rejects.toThrow(/Can only use one of --exec, --storybook-url/);

    await expect(
      parseArgv(['--script-name', 'storybook', '--storybook-url', 'http://foo.bar'])
    ).rejects.toThrow(/Can only use one of --script-name, --storybook-url/);
  });

  it('throws if you try to pass a script or command name and a build script', async () => {
    await expect(parseArgv(['--exec', 'storybook-command', '-b', 'build-command'])).rejects.toThrow(
      /Can only use one of --build-script-name, --exec/
    );

    await expect(parseArgv(['--script-name', 'storybook', '-b', 'build-command'])).rejects.toThrow(
      /Can only use one of --build-script-name, --script-name/
    );
  });

  it('throws if you try to pass a script or command name and a directory', async () => {
    await expect(
      parseArgv(['--exec', 'storybook-command', '--storybook-build-dir', '/tmp/dir'])
    ).rejects.toThrow(/Can only use one of --exec, --storybook-build-dir/);

    await expect(
      parseArgv(['--script-name', 'storybook', '--storybook-build-dir', '/tmp/dir'])
    ).rejects.toThrow(/Can only use one of --script-name, --storybook-build-dir/);
  });

  it('throws if you try to pass a build script and a directory', async () => {
    await expect(
      parseArgv(['-b', '/tmp/dir', '--storybook-build-dir', '/tmp/dir'])
    ).rejects.toThrow(/Can only use one of --build-script-name, --storybook-build-dir/);
  });

  it('allows you to set a URL without path', async () => {
    expect(await parseArgv(['--storybook-url', 'https://google.com'])).toMatchObject({
      noStart: true,
      url: 'https://google.com/iframe.html',
      createTunnel: false,
    });
  });

  it('allows you to set a URL with a path', async () => {
    expect(await parseArgv(['--storybook-url', 'https://google.com/foo'])).toMatchObject({
      noStart: true,
      url: 'https://google.com/foo/iframe.html',
      createTunnel: false,
    });
  });

  it('allows you to set a URL with iframe.html already set', async () => {
    expect(
      await parseArgv(['--storybook-url', 'https://google.com/iframe.html?param=foo'])
    ).toMatchObject({
      noStart: true,
      url: 'https://google.com/iframe.html?param=foo',
      createTunnel: false,
    });
  });
});

describe('getStorybookConfiguration', () => {
  it('handles short names', async () => {
    const port = getStorybookConfiguration('start-storybook -p 9001', '-p', '--port');
    expect(port).toBe('9001');
  });
  it('handles long names', async () => {
    const port = getStorybookConfiguration('start-storybook --port 9001', '-p', '--port');
    expect(port).toBe('9001');
  });
  it('handles equals', async () => {
    const port = getStorybookConfiguration('start-storybook --port=9001', '-p', '--port');
    expect(port).toBe('9001');
  });
  it('handles double space', async () => {
    const port = getStorybookConfiguration('start-storybook --port  9001', '-p', '--port');
    expect(port).toBe('9001');
  });

  it('handles complex scripts', async () => {
    const port = getStorybookConfiguration(
      "node verify-node-version.js && concurrently --raw --kill-others 'yarn relay --watch' 'start-storybook -s ./public -p 9001'",
      '-p',
      '--port'
    );
    expect(port).toBe('9001');
  });
});
