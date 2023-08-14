import { Context } from '../types';
import { emailHash } from './emailHash';

export function localBuildsSpecifier(ctx: Pick<Context, 'options' | 'git'>) {
  if (ctx.options.isLocalBuild) return { localBuildEmailHash: emailHash(ctx.git.gitUserEmail) };

  // For global builds, we only want local builds from the committer (besides global builds)
  if (ctx.git.committerEmail) return { localBuildEmailHash: emailHash(ctx.git.committerEmail) };

  // If we don't know, we fall back to *no local builds at all*
  return { isLocalBuild: false };
}
