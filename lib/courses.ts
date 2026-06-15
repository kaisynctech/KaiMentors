export function formatDuration(seconds: number | null) {
  if (!seconds) return "Duration not set";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return remaining ? `${minutes}m ${remaining}s` : `${minutes} min`;
}
