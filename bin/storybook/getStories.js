import minimatch from 'minimatch';
import getRuntimeSpecs from '../tester/runtimes';
import log from '../lib/log';
import { pluralize } from '../lib/pluralize';

export async function getStories({ only, list, isolatorUrl, verbose }) {
  let predicate = () => true;
  let listStory = story => story;

  if (only) {
    const match = only.match(/(.*):([^:]*)/);
    if (!match) {
      throw new Error(`--only argument must provided in the form "componentName:storyName"`);
    }
    log.info(`Running only story '${match[2]}' of component '${match[1]}'`);
    predicate = ({ name, component: { name: componentName } }) =>
      minimatch(name, match[2]) && minimatch(componentName, match[1]);
  }

  if (list) {
    log.info('Listing available stories:');
    listStory = story => {
      const {
        name,
        component: { name: componentName },
      } = story;
      log.info(`${componentName}:${name}`);
      return story;
    };
  }

  const { specs, options } = await getRuntimeSpecs(isolatorUrl, { verbose });

  const runtimeSpecs = specs.map(listStory).filter(predicate);

  if (runtimeSpecs.length === 0) {
    throw new Error('Cannot run a build with no stories. Please add some stories!');
  }

  log.info(`Found ${pluralize(runtimeSpecs.length, 'story')}`);
  return { runtimeSpecs, options };
}
