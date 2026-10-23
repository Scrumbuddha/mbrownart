export function formatCents(cents: number): string {
  const dollars = Math.trunc(cents / 100);
  const rem = Math.abs(cents % 100);
  if (rem === 0) return `$${dollars}`;
  return `$${dollars}.${String(rem).padStart(2, "0")}`;
}
