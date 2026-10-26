export const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n / 100,
  );
export const pct = (n: number | null) =>
  n === null ? "—" : `${(n / 100).toFixed(1)}%`;
export function remaining(date: string) {
  const hours = (Date.parse(date) - Date.now()) / 3600000;
  return hours <= 0
    ? "Ended"
    : hours < 1
      ? `${Math.ceil(hours * 60)}m left`
      : hours < 24
        ? `${Math.floor(hours)}h ${Math.floor((hours % 1) * 60)}m left`
        : `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h left`;
}
