// Formattazione valuta/numeri in italiano (EUR).
const eur = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
});

export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return eur.format(value);
}

const weekFmt = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// week_start è la data del lunedì (stringa YYYY-MM-DD).
export function formatWeek(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  return weekFmt.format(new Date(y, m - 1, d));
}
