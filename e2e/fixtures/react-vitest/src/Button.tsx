import { Badge } from './Badge';

export function Button({ label }: { label: string }) {
  return (
    <button type="button">
      {label} <Badge text="New" />
    </button>
  );
}
