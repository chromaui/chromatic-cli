/**
 * Fixtures shared by the Storybook frame modules (`ui/tasks/*.frames.ts`) and the workflow stories.
 * They stand in for the slices of `Context` the task state functions read.
 */

export const environment = { CHROMATIC_INDEX_URL: 'https://index.chromatic.com' };

export const options = { projectToken: '3cm6b49xnld' };

// Only `version` and `docs` are read by the intro frame; the rest of `Context['pkg']` is irrelevant
// to the capture.
export const pkg = { version: '1.2.3', docs: 'https://www.chromatic.com/docs/' };
