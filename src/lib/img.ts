const R2_BASE = "https://pub-383108e3bad04ba994957fa1155847a8.r2.dev";

export function imgUrl(u?: string | null): string {
  if (!u) return "";
  if (u.startsWith(R2_BASE)) return "/img" + u.slice(R2_BASE.length);
  return u;
}
