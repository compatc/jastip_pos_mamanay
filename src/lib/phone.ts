export function digits(s: string): string {
  return (s || "").replace(/\D/g, "");
}

export function phoneEquals(a: string, b: string): boolean {
  const da = digits(a);
  const db = digits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const zeroForm = (d: string) => (d.startsWith("62") ? "0" + d.slice(2) : d);
  return zeroForm(da) === zeroForm(db);
}
