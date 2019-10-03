/* eslint-disable no-underscore-dangle */
/* eslint-env browser */
import deprecate from 'util-deprecate';
import dedent from 'ts-dedent';

import isChromatic from './isChromatic';

const CHROMATIC_PARAMETERS = [
  'viewports',
  'delay',
  'disable',
  'noScroll',
  'diffThreshold',
  'pauseAnimationAtEnd',
];

function specFromStory({ id, kind, name, parameters: { chromatic } = {} }) {
  const param = value => (typeof value === 'function' ? value({ id, kind, name }) : value);
  return {
    storyId: id,
    name,
    component: {
      name: kind,
      displayName: kind.split(/\||\/|\./).slice(-1)[0],
    },
    parameters:
      chromatic &&
      CHROMATIC_PARAMETERS.reduce(
        (acc, key) => (chromatic[key] ? { ...acc, [key]: param(chromatic[key]) } : acc),
        {}
      ),
  };
}

const extract = global => {
  const { __STORYBOOK_CLIENT_API__ } = global;

  if (!__STORYBOOK_CLIENT_API__) {
    throw new Error(
      `Chromatic requires Storybook version at least 3.4. Please update your Storybook!`
    );
  }

  const storyStore = __STORYBOOK_CLIENT_API__._storyStore;

  // Storybook 5+ API
  if (storyStore.extract) {
    return Object.values(storyStore.extract()).map(specFromStory);
  }

  // Storybook 4- API
  return __STORYBOOK_CLIENT_API__
    .getStorybook()
    .map(({ kind, stories }) =>
      stories.map(({ name }) =>
        specFromStory({
          kind,
          name,
          parameters:
            storyStore.getStoryAndParameters &&
            storyStore.getStoryAndParameters(kind, name).parameters,
        })
      )
    )
    .reduce((a, b) => [...a, ...b], []); // flatten
};

deprecate(
  () => {
    global.__renderChromaticSpec__ = Object.assign(
      async ({ storyId, name: story, component: { name: kind } }) => {
        const { __STORYBOOK_CLIENT_API__, __STORYBOOK_ADDONS_CHANNEL__ } = global;

        if (!__STORYBOOK_CLIENT_API__ && !__STORYBOOK_ADDONS_CHANNEL__) {
          throw new Error(
            `Chromatic requires Storybook version at least 3.4. Please update your Storybook!`
          );
        }

        const sanitize = string => {
          return (
            string
              .toLowerCase()
              // eslint-disable-next-line no-useless-escape
              .replace(/[ ’–—―′¿'`~!@#$%^&*()_|+\-=?;:'",.<>\{\}\[\]\\\/]/gi, '-')
              .replace(/-+/g, '-')
              .replace(/^-+/, '')
              .replace(/-+$/, '')
          );
        };

        const sanitizeSafe = (string, part) => {
          const sanitized = sanitize(string);
          if (sanitized === '') {
            throw new Error(`Invalid ${part} '${string}', must include alphanumeric characters`);
          }
          return sanitized;
        };

        const toId = (k, n) => `${sanitizeSafe(k, 'kind')}--${sanitizeSafe(n, 'name')}`;

        const channel = __STORYBOOK_ADDONS_CHANNEL__;
        const storyStore = __STORYBOOK_CLIENT_API__._storyStore;

        // In Storybook 5+ we can be sure of the emitting, and we need to use a storyId API
        if (storyStore.extract) {
          return new Promise((resolve, reject) => {
            channel.on('storyRendered', () => resolve(document.getElementById('root')));
            channel.on('storyUnchanged', () => resolve(document.getElementById('root')));
            channel.on('storyErrored', error => reject(error));
            channel.on('storyThrewException', error => reject(error));
            channel.on('storyMissing', () => reject(new Error('storyMissing')));

            channel.emit('setCurrentStory', { storyId: storyId || toId(kind, story) });
          });
        }

        // We need to emulate the event sent by the manager to the preview.
        // In SB@4+ if we emit a message on the channel it will get picked up by the preview
        // (note that we are on the preview side). However, in SB@3.4, perhaps more correctly,
        // if we emit a message, it won't be picked up by the preview. So we need to reach
        // in and simulate receiving an event
        channel._handleEvent({
          type: 'setCurrentStory',
          args: [{ kind, story }],
          from: 'chromatic',
        });

        // If the story has rendered with an error, SB does not return any kind of error
        // (we will fix this...) However, in the meantime, you can pick this up via a class on the body
        if (document.body.classList.contains('sb-show-errordisplay')) {
          const message = document.getElementById('error-message').textContent;
          const stack = document.getElementById('error-stack').textContent;
          const error = new Error(message);
          error.stack = stack;
          throw error;
        }

        return document.getElementById('root');
      },
      { isDeprecated: true }
    );
    global.__chromaticRuntimeSpecs__ = Object.assign(async () => extract(global), {
      isDeprecated: true,
    });
  },
  dedent`
    You're importing 'storybook-chromatic' in your config.js
    This is no longer necessary!

    If you're importing { isChromatic } in your stories, please change that to:
    "import isChromatic from "storybook-chromatic/isChromatic";"
  `
)();

export { isChromatic };
