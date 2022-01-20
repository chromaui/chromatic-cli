import { Env } from './lib/getEnv';
import { Options } from './lib/getOptions';
import { Logger } from './lib/log';
import { Flags } from './lib/parseArgs';

export interface Context {
  env: Env;
  log: Logger;
  pkg: {
    name: string;
    version: string;
    description: string;
    bugs: { url: string; email: string };
    docs: string;
  };
  sessionId: string;
  packageJson: { [key: string]: any };
  packagePath: string;
  argv: string[];
  flags: Flags;
  options: Options;
  title: string;
  exitCode: number;
  exitCodeKey: string;
  userError?: boolean;
  runtimeErrors?: Error[];
  runtimeWarnings?: Error[];
  stopApp?: () => void;
  closeTunnel?: () => void;

  git: {
    version: string;
  };
  storybook: Record<string, any>;
  spawnParams: Record<string, any>;
  isolatorUrl: string;
  cachedUrl: string;
  build: {
    id: string;
    number: number;
    webUrl: string;
  };
  buildLogFile: string;
}
