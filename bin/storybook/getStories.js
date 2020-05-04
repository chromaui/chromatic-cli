import minimatch from 'minimatch';
import pluralize from 'pluralize';
import getRuntimeSpecs from '../tester/runtimes';

export async function getStories(log, { only, list, isolatorUrl, verbose, allowConsoleErrors }) {
  let predicate = () => true;
  if (only) {
    const match = only.match(/(.*):([^:]*)/);
    if (!match) {
      throw new Error(`--only argument must provided in the form "componentName:storyName"`);
    }
    log.debug(`Running only story '${match[2]}' of component '${match[1]}'`);
    predicate = ({ name, component: { name: componentName } }) =>
      minimatch(name, match[2]) && minimatch(componentName, match[1]);
  }
  let listStory = story => story;
  if (list) {
    log.debug('Listing available stories:');
    listStory = story => {
      const {
        name,
        component: { name: componentName },
      } = story;
      log.debug(`${componentName}:${name}`);
      return story;
    };
  }
  const runtimeSpecs = (await getRuntimeSpecs(isolatorUrl, log, { verbose, allowConsoleErrors }))
    .map(listStory)
    .filter(predicate);

  if (runtimeSpecs.length === 0) {
    throw new Error('Cannot run a build with no stories. Please add some stories!');
  }

  log.debug(`Found ${pluralize('story', runtimeSpecs.length, true)}`);
  return runtimeSpecs;
}
