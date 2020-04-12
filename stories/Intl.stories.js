import React, { Component } from 'react';
import {
  IntlProvider,
  FormattedMessage,
  createIntlCache,
  createIntl,
  injectIntl,
} from 'react-intl';

class MyComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      name: 'Eric',
      unreadCount: 1000,
    };
  }

  render() {
    const { name, unreadCount } = this.state;

    return (
      <p>
        <FormattedMessage
          id="welcome"
          defaultMessage={`Hello {name}, you have {unreadCount, number} {unreadCount, plural,
                      one {message}
                      other {messages}
                    }`}
          values={{ name: <b>{name}</b>, unreadCount }}
        />
      </p>
    );
  }
}

export default {
  title: 'Intl',
  component: MyComponent,
  decorators: [
    StoryFn => (
      <IntlProvider locale="en">
        <StoryFn />
      </IntlProvider>
    ),
  ],
};

console.log(Intl.DateTimeFormat.supportedLocalesOf(['ban']));

const cache = createIntlCache();
const intl = createIntl(
  {
    locale: 'fr-FR',
    messages: {},
  },
  cache
);

export const TestCase = () => {
  console.log(intl);

  const NewComponent = injectIntl(MyComponent);

  return <NewComponent />;
};
