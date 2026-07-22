export function StatusBadge({ value, title }: { value?: string | null; title?: string | null }) {
  const normalized = (value ?? 'UNKNOWN').toLowerCase().replaceAll('_', '-');
  const label = (value ?? 'Unknown').replaceAll('_', ' ');
  return (
    <span
      className={`badge badge-${normalized}${title ? ' badge-has-tooltip' : ''}`}
      title={title || undefined}
      aria-label={title ? `${label}: ${title}` : label}
    >
      {label}
    </span>
  );
}
