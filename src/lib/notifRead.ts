// State "sudah dibaca" untuk panel Notifikasi Admin.
// Tabel notifications tidak punya kolom read (tanpa SQL/DDL) → simpan lokal.
export type NotifCat = "payment" | "order" | "shipping";

const READ_KEY = "notif_read_v1";
const AUTO_READ_MS = 30 * 24 * 60 * 60 * 1000; // >30 hari dianggap sudah dibaca

type ReadMap = Record<string, number>;

export function catOf(type: string | null | undefined): NotifCat {
  const t = (type || "").toLowerCase();
  if (t === "shipping") return "shipping";
  if (t === "new_order" || t === "order" || t === "order_baru") return "order";
  return "payment";
}

function loadRead(): ReadMap {
  try {
    return JSON.parse(localStorage.getItem(READ_KEY) || "{}");
  } catch {
    return {};
  }
}

export function markRead(id: string): void {
  const m = loadRead();
  m[id] = Date.now();
  try {
    localStorage.setItem(READ_KEY, JSON.stringify(m));
  } catch {
    // penuh / private mode — abaikan
  }
}

export function isRead(id: string, createdAt: string): boolean {
  const m = loadRead();
  if (m[id]) return true;
  const t = Date.parse(createdAt || "");
  if (!isNaN(t) && Date.now() - t > AUTO_READ_MS) return true;
  return false;
}

export function countUnread(rows: { id: string; created_at: string }[]): number {
  return rows.filter((r) => !isRead(r.id, r.created_at)).length;
}
