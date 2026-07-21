export function getTodayString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekEndingSaturdayString(baseDate: Date = new Date()): string {
  const target = new Date(baseDate);
  const day = target.getDay();
  const daysToSaturday = (6 - day + 7) % 7;
  target.setDate(target.getDate() + daysToSaturday);
  const year = target.getFullYear();
  const month = String(target.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(target.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

export function formatSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
