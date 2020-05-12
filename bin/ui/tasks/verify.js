export const initial = {
  status: 'initial',
  title: 'Verify your Storybook',
};

export const pending = ctx => ({
  status: 'pending',
  title: 'Verifying your Storybook',
  output: 'This may take a few minutes',
});

export const listing = ctx => ({
  status: 'pending',
  title: 'Listing available stories:',
  output: `${ctx.component.name}:${ctx.name}`,
});

export const runOnly = ctx => ({
  status: 'pending',
  title: `Running only story '${ctx.storyName}' of component '${ctx.componentName}'`,
});

export const invalidOnly = ctx => ({
  status: 'error',
  title: 'Verifying your Storybook',
  output: `Invalid --only argument: must provided in the form "componentName:storyName"`,
});

export const success = ctx => ({
  status: 'success',
  title: ctx.isPublishOnly ? `Published your Storybook` : `Started build ${ctx.build.number}`,
  output: ctx.isOnboarding
    ? `Continue setup at ${ctx.build.app.setupUrl}`
    : `View build details at ${ctx.build.webUrl}`,
});

export const failed = ctx => ({
  status: 'error',
  title: 'Verifying your Storybook',
  output: ctx.options.only
    ? 'Cannot run a build with no stories. Change or omit the --only predicate.'
    : 'Cannot run a build with no stories. Please add some stories!',
});
