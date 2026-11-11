import { test } from 'vitest';
import { render } from 'vitest-browser-react';

import { Button } from './Button';

test('Button', async () => {
  await render(<Button label="Button" />);
});
