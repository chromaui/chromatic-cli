export const initial = {
  status: 'initial',
  title: 'Prepare workspace',
};

export const pending = (ctx) => ({
  status: 'pending',
  title: 'Preparing your workspace',
  output: `Ensuring your git workspace is clean and up-to-date`,
});

export const lookupMergeBase = (ctx) => ({
  status: 'pending',
  title: 'Preparing your workspace',
  output: `Looking up the git merge base for '${ctx.options.patchHeadRef}' on '${ctx.options.patchBaseRef}'`,
});

export const checkoutMergeBase = (ctx) => ({
  status: 'pending',
  title: 'Preparing your workspace',
  output: `Checking out merge base commit '${ctx.mergeBase.substr(0, 7)}'`,
});

export const installingDependencies = (ctx) => ({
  status: 'pending',
  title: 'Preparing your workspace',
  output: 'Installing dependencies',
});

export const success = (ctx) => ({
  status: 'success',
  title: `Prepared your workspace`,
  output: `Checked out commit '${ctx.mergeBase.substr(0, 7)}' on '${ctx.options.patchBaseRef}'`,
});
