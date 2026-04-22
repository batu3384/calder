export function formatRelativeTimestamp(timestamp?: string): string {
  if (!timestamp) return 'No sync yet';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'No sync yet';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) {
    return `Updated ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffMs < 60_000) return 'Updated just now';
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 60) return `Updated ${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Updated ${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `Updated ${diffDays}d ago`;
  return `Updated ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}
