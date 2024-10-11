import tracedAffectedFiles from './tracedAffectedFiles';

export default {
  title: 'CLI/Messages/Info',
};

const rootPath = './chromatic-cli';
const tracedPaths = [
  'src/app/dashboard/index.ts + 3 modules\nsrc/app/settings/Settings.stories.tsx + 2 modules',
  'src/app/dashboard/index.ts + 3 modules\nsrc/app/payment/Payment.stories.tsx',
  'src/app/dashboard/index.ts + 3 modules\nsrc/actions/index.ts\nsrc/app/components/Login.story.tsx + 1 modules',
  'src/app/dashboard/index.ts + 3 modules\nsrc/actions/index.ts\nsrc/app/index.ts\nsrc/app/settings/Settings.stories.tsx + 2 modules',
  'src/app/dashboard/index.ts + 3 modules\nsrc/actions/utils.ts + 5 modules\nsrc/app/components/Provider.tsx\nsrc/app/payment/Modal.tsx + 2 modules\nsrc/app/payment/Modal.stories.tsx',
];

const modulesByName = {
  'src/app/dashboard/index.ts + 3 modules': {
    id: 1,
    name: 'src/app/dashboard/index.ts + 3 modules',
    modules: [
      { name: 'src/hooks/useTiming.ts' },
      { name: 'src/hooks/useMeasure.ts' },
      { name: 'src/hooks/useEvent.ts' },
    ],
  },
  'src/app/settings/Settings.stories.tsx + 2 modules': {
    id: 2,
    name: 'src/app/settings/Settings.stories.tsx + 2 modules',
    modules: [{ name: 'src/app/settings/Settings.tsx' }, { name: 'src/app/settings/DarkMode.tsx' }],
  },
  'src/app/components/Login.story.tsx + 1 modules': {
    id: 3,
    name: 'src/app/components/Login.story.tsx + 1 modules',
    modules: [{ name: 'src/app/components/Login.tsx' }],
  },
  'src/actions/utils.ts + 5 modules': {
    id: 4,
    name: 'src/actions/utils.ts + 5 modules',
    modules: [
      { name: 'src/actions/state.ts' },
      { name: 'src/actions/iframe.ts' },
      { name: 'src/utils/auth/login.ts' },
      { name: 'src/utils/auth/authorize.ts' },
      { name: 'src/utils/comments/index.ts' },
    ],
  },
  'src/app/payment/Modal.tsx + 2 modules': {
    id: 5,
    name: 'src/app/payment/Modal.tsx + 2 modules',
    modules: [{ name: 'src/app/components/Modal.tsx' }, { name: 'src/actions/state.ts' }],
  },
};

const moduleNames = tracedPaths.map((path) => path.split('\n').reverse()[0]);
const affectedModules = Object.fromEntries(
  moduleNames.map((name) => [
    name,
    modulesByName[name] ? modulesByName[name].modules.map((m) => m.name) : [name],
  ])
);

export const TracedAffectedFiles = () =>
  tracedAffectedFiles(
    {
      options: { storybookBaseDir: 'src' },
      turboSnap: { tracedPaths: new Set(tracedPaths) },
    } as any,
    {
      changedFiles: ['src/app/dashboard/index.ts'],
      affectedModules,
    } as any
  );

export const TracedAffectedFilesExpanded = () =>
  tracedAffectedFiles(
    {
      options: { traceChanged: 'expanded' },
      turboSnap: { rootPath, tracedPaths: new Set(tracedPaths) },
    } as any,
    {
      changedFiles: ['src/app/dashboard/index.ts'],
      affectedModules,
      modulesByName,
      normalize: (f) => f,
    }
  );

export const TracedAffectedFilesExpandedBailed = () =>
  tracedAffectedFiles(
    {
      options: { traceChanged: 'expanded' },
      turboSnap: {
        rootPath,
        tracedPaths: new Set(tracedPaths),
        bailReason: {
          changedStorybookFiles: ['.storybook/preview.tsx', '.storybook/preview.less'],
        },
      },
    } as any,
    {
      changedFiles: ['src/app/dashboard/index.ts'],
      affectedModules,
      modulesByName,
      normalize: (f) => f,
    }
  );

export const TracedAffectedFilesCompact = () =>
  tracedAffectedFiles(
    {
      options: { traceChanged: 'compact' },
    } as any,
    {
      changedFiles: ['src/app/dashboard/index.ts'],
      affectedModules,
    } as any
  );
