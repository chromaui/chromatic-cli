import { capitalize } from '@myorg/shared';
import { Badge } from './Badge';

export function Button({ label }: { label: string }) {
  return (
    <button type="button">
      {capitalize(label)} <Badge text="New" />
    </button>
  );
}
