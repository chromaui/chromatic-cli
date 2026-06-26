import { dedent } from 'ts-dedent';

export default () =>
  dedent`
    No frontend files were changed, so TurboSnap skipped taking any snapshots. This build will not be displayed in Chromatic.
  `;
