import { Context } from '../../dist/node';

const routerPackages = [
  'react-router',
  'react-router-dom',
  'remix',
  '@tanstack/react-router',
  'expo-router',
  '@reach/router',
  'react-easy-router',
  '@remix-run/router',
  'wouter',
  'wouter-preact',
  'preact-router',
  'vue-router',
  'unplugin-vue-router',
  '@angular/router',
  '@solidjs/router',

  // metaframeworks that imply routing
  'next',
  'react-scripts',
  'gatsby',
  'nuxt',
  '@sveltejs/kit',
];

export function getHasRouter(packageJson: Context['packageJson']) {
  // NOTE: we just check real dependencies; if it is in dev dependencies, it may just be an example
  return !!Object.keys(packageJson?.dependencies ?? {}).find((depName) =>
    routerPackages.includes(depName)
  );
}
