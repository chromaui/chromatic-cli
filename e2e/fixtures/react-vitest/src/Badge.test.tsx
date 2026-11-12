import { test } from 'vitest';
import { render } from 'vitest-browser-react';

import { Badge } from './Badge';

test('Badge', async () => {
  await render(<Badge text="New" />);
});
