import { useEffect, useState } from "react";
import { useStore } from "../stores/useStore";
import { supabase } from "../lib/supabase";
import {
  Wrench,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  PackageSearch,
  UserCheck,
  Loader2,
  Users,
  RotateCcw,
  Info,
} from "lucide-react";

interface OrphanOrder {
  id: string;
  customer_id: string;
  customer_name?: string;
  status: string;
  total: number;
  order_type: string;
  created_at: string;
  items?: string;
}

interface AuditResult {
  product_id: string;
  name: string;
  unit: string;
  current_stock: number;
  computed_stock: number;
  movement_count: number;
  dup_count: number;
  qty_mismatch_count: number;
  chain_break_count: number;
  has_issue: boolean;
}

function rupiah(n: number): string {
  return "Rp " + (n || 0).toLocaleString("id-ID");
}

function sortMovements(rows: any[]) {
  return [...rows].sort((a, b) => {
    const da = a.date || "";
    const db = b.date || "";
    if (da !== db) return da < db ? -1 : 1;
    const ia = Number(a.invoice_no || 0);
    const ib = Number(b.invoice_no || 0);
    if (ia !== ib) return ia - ib;
    const ca = a.created_at || "";
    const cb = b.created_at || "";
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
}

export default function Maintenance() {
  const products = useStore((s) => s.products);
  const loadProducts = useStore((s) => s.loadProducts);

  const [orphans, setOrphans] = useState<OrphanOrder[] | null>(null);
  const [orphanLoading, setOrphanLoading] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveredCount, setRecoveredCount] = useState(0);
  const [orphanError, setOrphanError] = useState("");

  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const [auditError, setAuditError] = useState("");

  useEffect(() => {
    loadProducts();
  }, []);

  async function checkOrphans() {
    setOrphanLoading(true);
    setOrphanError("");
    setRecoveredCount(0);
    try {
      const { data, error } = await supabase.rpc("list_orphan_orders");
      if (error) throw error;
      setOrphans((data as OrphanOrder[]) || []);
    } catch (e: any) {
      setOrphanError(
        e?.message?.includes("list_orphan_orders")
          ? "Fungsi SQL belum dibuat. Jalankan supabase/tools_notifications.sql di SQL Editor Supabase dulu."
          : e?.message || "Gagal memeriksa order yatim."
      );
      setOrphans(null);
    } finally {
      setOrphanLoading(false);
    }
  }

  async function recoverOrphans() {
    if (!orphans || orphans.length === 0) return;
    setRecovering(true);
    setOrphanError("");
    try {
      const { data, error } = await supabase.rpc("recover_orphan_orders");
      if (error) throw error;
      setRecoveredCount((data as OrphanOrder[])?.length || 0);
      setOrphans([]);
      await useStore.getState().loadAllOrders();
    } catch (e: any) {
      setOrphanError(
        e?.message?.includes("recover_orphan_orders")
          ? "Fungsi SQL belum dibuat. Jalankan supabase/tools_notifications.sql di SQL Editor Supabase dulu."
          : e?.message || "Gagal memulihkan order yatim."
      );
    } finally {
      setRecovering(false);
    }
  }

  async function runAudit() {
    setAuditLoading(true);
    setAuditError("");
    setAuditResults([]);
    try {
      const { data: movs } = await supabase.from("stock_movements").select("*");
      const prodMap = new Map(products.map((p) => [p.id, p]));
      const byProduct = new Map<string, any[]>();
      for (const m of movs || []) {
        if (!m.product_id) continue;
        const arr = byProduct.get(m.product_id);
        if (arr) arr.push(m);
        else byProduct.set(m.product_id, [m]);
      }

      const orderMovIds = new Set<string>();
      for (const m of movs || []) {
        if (m.order_id && (m.transaction_type === "Penjualan" || m.transaction_type === "Pembelian")) {
          orderMovIds.add(m.order_id);
        }
      }
      const { data: itemRows } =
        orderMovIds.size > 0
          ? await supabase
              .from("order_items")
              .select("order_id, product_id, quantity")
              .in("order_id", [...orderMovIds])
          : { data: [] };
      const itemByOrder = new Map<string, Map<string, number>>();
      (itemRows || []).forEach((it: { order_id: string; product_id: string; quantity: number }) => {
        let m = itemByOrder.get(it.order_id);
        if (!m) {
          m = new Map();
          itemByOrder.set(it.order_id, m);
        }
        m.set(it.product_id, (m.get(it.product_id) || 0) + Number(it.quantity || 0));
      });

      const results: AuditResult[] = [];
      for (const [pid, rawRows] of byProduct) {
        const prod = prodMap.get(pid);
        const sorted = sortMovements(rawRows);

        const keepLatestIdx = new Map<string, number>();
        for (let i = 0; i < sorted.length; i++) {
          const m = sorted[i];
          if (m.order_id && (m.transaction_type === "Penjualan" || m.transaction_type === "Pembelian")) {
            keepLatestIdx.set(m.order_id + "|" + m.transaction_type, i);
          }
        }
        const keep = new Set(keepLatestIdx.values());
        const working = sorted.filter((_, i) => keep.has(i));
        const dupCount = sorted.length - working.length;

        let running = working.length > 0 ? Number(working[0].qty_after) : Number(prod?.stock || 0);
        let chainBreaks = 0;
        let qtyMismatch = 0;
        for (let i = 0; i < working.length; i++) {
          const m = working[i];
          if (i > 0) running = running + Number(m.qty);
          if (m.order_id && (m.transaction_type === "Penjualan" || m.transaction_type === "Pembelian")) {
            const expectQty = itemByOrder.get(m.order_id)?.get(pid);
            if (expectQty != null) {
              const expectSigned = m.transaction_type === "Penjualan" ? -expectQty : expectQty;
              if (Number(m.qty) !== Number(expectSigned)) qtyMismatch++;
            }
          }
          if (Number(m.qty_after) !== running) chainBreaks++;
        }
        const computed = running;
        const hasIssue =
          dupCount > 0 || qtyMismatch > 0 || chainBreaks > 0 || (prod != null && Number(prod.stock) !== computed);
        results.push({
          product_id: pid,
          name: prod?.name || "?",
          unit: prod?.unit || "",
          current_stock: prod ? Number(prod.stock) : computed,
          computed_stock: computed,
          movement_count: sorted.length,
          dup_count: dupCount,
          qty_mismatch_count: qtyMismatch,
          chain_break_count: chainBreaks,
          has_issue: hasIssue,
        });
      }
      results.sort((a, b) => Number(b.has_issue) - Number(a.has_issue));
      setAuditResults(results);
    } catch (e: any) {
      setAuditError(e?.message || "Gagal menjalankan audit stok.");
    } finally {
      setAuditLoading(false);
    }
  }

  async function fixProduct(pid: string) {
    setFixingId(pid);
    setAuditError("");
    try {
      const { data: movs } = await supabase.from("stock_movements").select("*").eq("product_id", pid);
      const sorted = sortMovements(movs || []);

      const keepLatestId = new Map<string, string>();
      const delIds: string[] = [];
      for (const m of sorted) {
        if (m.order_id && (m.transaction_type === "Penjualan" || m.transaction_type === "Pembelian")) {
          const key = m.order_id + "|" + m.transaction_type;
          if (keepLatestId.has(key)) delIds.push(m.id);
          else keepLatestId.set(key, m.id);
        }
      }
      if (delIds.length > 0) {
        await supabase.from("stock_movements").delete().in("id", delIds);
      }

      const { data: movs2 } = await supabase.from("stock_movements").select("*").eq("product_id", pid);
      const working = sortMovements(movs2 || []);
      const orderIds = [
        ...new Set(
          working
            .filter((m) => m.order_id && (m.transaction_type === "Penjualan" || m.transaction_type === "Pembelian"))
            .map((m) => m.order_id)
        ),
      ];
      const { data: itemRows } =
        orderIds.length > 0
          ? await supabase
              .from("order_items")
              .select("order_id, quantity")
              .eq("product_id", pid)
              .in("order_id", orderIds)
          : { data: [] };
      const itemQty = new Map<string, number>();
      (itemRows || []).forEach((it: { order_id: string; quantity: number }) => {
        itemQty.set(it.order_id, (itemQty.get(it.order_id) || 0) + Number(it.quantity || 0));
      });

      for (const m of working) {
        if (m.order_id && (m.transaction_type === "Penjualan" || m.transaction_type === "Pembelian")) {
          const expected = itemQty.get(m.order_id);
          if (expected != null) {
            const signed = m.transaction_type === "Penjualan" ? -expected : expected;
            if (Number(m.qty) !== Number(signed)) {
              await supabase.from("stock_movements").update({ qty: signed }).eq("id", m.id);
              m.qty = signed;
            }
          }
        }
      }

      let running = working.length > 0 ? Number(working[0].qty_after) : 0;
      for (let i = 0; i < working.length; i++) {
        const m = working[i];
        if (i > 0) running = running + Number(m.qty);
        if (Number(m.qty_after) !== running) {
          await supabase.from("stock_movements").update({ qty_after: running }).eq("id", m.id);
          m.qty_after = running;
        }
      }

      await supabase.from("products").update({ stock: running }).eq("id", pid);
      await loadProducts();
      await runAudit();
    } catch (e: any) {
      setAuditError(e?.message || `Gagal memperbaiki produk.`);
    } finally {
      setFixingId(null);
    }
  }

  async function fixAll() {
    setFixingAll(true);
    setAuditError("");
    try {
      for (const r of auditResults) {
        if (!r.has_issue) continue;
        await fixProduct(r.product_id);
      }
    } finally {
      setFixingAll(false);
    }
  }

  const issueResults = auditResults.filter((r) => r.has_issue);
  const okCount = auditResults.length - issueResults.length;
  const totalDup = auditResults.reduce((s, r) => s + r.dup_count, 0);
  const totalMismatch = auditResults.reduce((s, r) => s + r.qty_mismatch_count + r.chain_break_count, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-5 pt-4 pb-3 relative z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Wrench className="w-5 h-5 text-pink-500" />
            <h2 className="text-xl font-bold text-gray-800">Perawatan Data</h2>
          </div>
        </div>
        <p className="text-sm text-gray-400">
          Periksa & perbaiki stok produk, dan pulihkan order yang tersimpan tanpa akun.
        </p>
      </div>

      <main className="px-5 pb-6 relative z-10 flex-1 overflow-y-auto space-y-5">
        {/* ORDER YATIM */}
        <section className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-pink-500" />
              <h3 className="font-bold text-gray-800">Order Yatim</h3>
            </div>
            <button
              onClick={checkOrphans}
              disabled={orphanLoading}
              className="px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1"
            >
              {orphanLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Periksa
            </button>
          </div>

          {orphanError && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl p-3 mb-3">{orphanError}</p>
          )}

          {orphans === null ? (
            <p className="text-sm text-gray-400">
              Order dengan akun kosong / "offline-user" tidak muncul di aplikasi. Tap "Periksa" untuk melihatnya.
            </p>
          ) : orphans.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Tidak ada order yatim.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Ditemukan {orphans.length} order yatim.
              </div>
              <div className="max-h-56 overflow-y-auto space-y-1.5 mb-3 pr-1">
                {orphans.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between bg-pink-50/40 border border-pink-100/60 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-semibold text-gray-700 truncate">
                        {o.customer_name || "Tanpa pelanggan"}
                      </p>
                      {o.items && (
                        <p className="text-[11px] text-gray-500 truncate">{o.items}</p>
                      )}
                      <p className="text-[11px] text-gray-400">
                        {o.order_type} · {o.status} ·{" "}
                        {new Date(o.created_at).toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-gray-700 shrink-0">{rupiah(Number(o.total))}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={recoverOrphans}
                disabled={recovering}
                className="w-full py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 flex items-center justify-center gap-2"
              >
                {recovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                Pulihkan ke Akun Ini
              </button>
              {recoveredCount > 0 && (
                <p className="text-xs text-emerald-600 mt-2 text-center">
                  {recoveredCount} order dipulihkan.
                </p>
              )}
            </>
          )}
        </section>

        {/* AUDIT STOK */}
        <section className="bg-white/80 border border-pink-100/60 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PackageSearch className="w-4 h-4 text-pink-500" />
              <h3 className="font-bold text-gray-800">Audit & Perbaiki Stok</h3>
            </div>
            <button
              onClick={runAudit}
              disabled={auditLoading}
              className="px-3 py-1.5 bg-pink-50 hover:bg-pink-100 text-pink-600 rounded-xl text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-1"
            >
              {auditLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Audit
            </button>
          </div>

          {auditError && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl p-3 mb-3">{auditError}</p>
          )}

          {auditResults.length === 0 && !auditLoading && (
            <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Memeriksa riwayat stok tiap produk: duplikat, selisih jumlah dengan pesanan, dan rantai stok yang
                tidak nyambung. Tap "Audit" untuk mulai.
              </span>
            </div>
          )}

          {auditResults.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Aman</p>
                  <p className="text-base font-bold text-emerald-600">{okCount}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Bermasalah</p>
                  <p className="text-base font-bold text-amber-600">{issueResults.length}</p>
                </div>
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-center">
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Duplikat</p>
                  <p className="text-base font-bold text-rose-500">{totalDup}</p>
                </div>
              </div>

              {issueResults.length > 0 ? (
                <>
                  <div className="space-y-2 mb-3">
                    {issueResults.map((r) => (
                      <div key={r.product_id} className="bg-amber-50/40 border border-amber-100 rounded-xl p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                            <p className="text-[11px] text-gray-400">
                              Stok terisi {r.current_stock} · Seharusnya {r.computed_stock}
                              {r.movement_count > 0 ? ` · ${r.movement_count} riwayat` : ""}
                            </p>
                            {(r.dup_count > 0 || r.qty_mismatch_count > 0 || r.chain_break_count > 0) && (
                              <p className="text-[11px] text-amber-600 mt-0.5">
                                {r.dup_count > 0 && `${r.dup_count} duplikat`}
                                {r.dup_count > 0 && (r.qty_mismatch_count > 0 || r.chain_break_count > 0) && " · "}
                                {r.qty_mismatch_count > 0 && `${r.qty_mismatch_count} selisih qty`}
                                {r.qty_mismatch_count > 0 && r.chain_break_count > 0 && " · "}
                                {r.chain_break_count > 0 && `${r.chain_break_count} rantai putus`}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => fixProduct(r.product_id)}
                            disabled={fixingId !== null || fixingAll}
                            className="shrink-0 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                          >
                            {fixingId === r.product_id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5" />
                            )}
                            Perbaiki
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={fixAll}
                    disabled={fixingAll || fixingId !== null}
                    className="w-full py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 flex items-center justify-center gap-2"
                  >
                    {fixingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    Perbaiki Semua ({issueResults.length})
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Semua {auditResults.length} produk konsisten.
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
