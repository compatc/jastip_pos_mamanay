import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStore } from "../stores/useStore";
import ConfirmationModal from "../components/ConfirmationModal";

export default function Profile() {
  const navigate = useNavigate();
  const { user, setUser } = useStore();

  const [name, setName] = useState(user?.name || "");
  const [nameMsg, setNameMsg] = useState("");
  const [nameErr, setNameErr] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [passErr, setPassErr] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailErr, setEmailErr] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameErr("");
    setNameMsg("");
    if (!name.trim()) { setNameErr("Nama tidak boleh kosong"); return; }
    setSavingName(true);
    const { error } = await supabase.auth.updateUser({
      data: { name: name.trim() },
    });
    if (error) {
      setNameErr(error.message);
    } else {
      if (user) {
        setUser({ ...user, name: name.trim() });
      }
      setNameMsg("Nama berhasil diperbarui");
    }
    setSavingName(false);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPassErr("");
    setPassMsg("");
    if (password.length < 6) { setPassErr("Password minimal 6 karakter"); return; }
    if (password !== password2) { setPassErr("Konfirmasi password tidak sama"); return; }
    setSavingPass(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setPassErr(error.message);
    } else {
      setPassMsg("Password berhasil diganti");
      setPassword("");
      setPassword2("");
    }
    setSavingPass(false);
  }

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr("");
    setEmailMsg("");
    if (!email.trim()) { setEmailErr("Email tidak boleh kosong"); return; }
    setSavingEmail(true);
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    if (error) {
      setEmailErr(error.message);
    } else {
      setEmailMsg(
        "Permintaan ganti email terkirim. Cek email baru kamu untuk konfirmasi (jika verifikasi email aktif)."
      );
      setEmail("");
    }
    setSavingEmail(false);
  }

  async function handleDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_my_account");
    if (error) {
      alert("Gagal menutup akun: " + error.message);
      setDeleting(false);
      setConfirmDelete(false);
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    setUser(null);
    localStorage.clear();
    window.location.href = "/login";
  }

  const inputCls =
    "w-full px-4 py-3 bg-pink-50/50 border border-pink-100 rounded-xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all";
  const labelCls =
    "block text-sm font-semibold text-gray-500 mb-1.5 uppercase tracking-wider";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <h2 className="text-2xl font-bold text-gray-800">Profil</h2>

        <div className="bg-white/80 backdrop-blur-xl border border-pink-100/60 rounded-2xl p-5 shadow-lg shadow-pink-100/30">
          <p className="text-base text-gray-500">Akun login</p>
          <p className="text-lg font-semibold text-gray-800 break-all">{user?.email}</p>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-pink-100/60 rounded-2xl p-5 shadow-lg shadow-pink-100/30">
          <h3 className="text-lg font-bold text-gray-800 mb-3">Nama</h3>
          <form onSubmit={handleSaveName} className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Nama kamu"
            />
            {nameErr && <p className="text-red-500 text-sm">{nameErr}</p>}
            {nameMsg && <p className="text-green-600 text-sm">{nameMsg}</p>}
            <button
              type="submit"
              disabled={savingName}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
            >
              {savingName ? "Menyimpan..." : "Simpan Nama"}
            </button>
          </form>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-pink-100/60 rounded-2xl p-5 shadow-lg shadow-pink-100/30">
          <h3 className="text-lg font-bold text-gray-800 mb-3">Ganti Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className={labelCls}>Password Baru</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="Minimal 6 karakter"
              />
            </div>
            <div>
              <label className={labelCls}>Ulangi Password</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className={inputCls}
                placeholder="Ulangi password baru"
              />
            </div>
            {passErr && <p className="text-red-500 text-sm">{passErr}</p>}
            {passMsg && <p className="text-green-600 text-sm">{passMsg}</p>}
            <button
              type="submit"
              disabled={savingPass}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
            >
              {savingPass ? "Mengganti..." : "Ganti Password"}
            </button>
          </form>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-pink-100/60 rounded-2xl p-5 shadow-lg shadow-pink-100/30">
          <h3 className="text-lg font-bold text-gray-800 mb-3">Ganti Email</h3>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="email@contoh.com"
            />
            {emailErr && <p className="text-red-500 text-sm">{emailErr}</p>}
            {emailMsg && <p className="text-green-600 text-sm leading-relaxed">{emailMsg}</p>}
            <button
              type="submit"
              disabled={savingEmail}
              className="w-full py-3 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-all shadow-lg shadow-pink-200/40 active:scale-[0.98]"
            >
              {savingEmail ? "Mengirim..." : "Ganti Email"}
            </button>
          </form>
        </div>

        <div className="bg-white/80 backdrop-blur-xl border border-red-200/70 rounded-2xl p-5 shadow-lg shadow-red-100/30">
          <h3 className="text-lg font-bold text-red-500 mb-1">Tutup Akun</h3>
          <p className="text-base text-gray-500 mb-3">
            Menghapus akun login beserta semua data kamu (order, pelanggan, produk, stok, akun kas/bank). Tidak bisa dibatalkan.
          </p>
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={deleting}
            className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-all active:scale-[0.98]"
          >
            {deleting ? "Menghapus..." : "Tutup Akun"}
          </button>
        </div>
      </div>

      <ConfirmationModal
        visible={confirmDelete}
        title="Tutup Akun?"
        message="Akun login dan SEMUA data kamu akan dihapus permanen. Tidak bisa dibatalkan."
        confirmLabel="Ya, Hapus"
        cancelLabel="Batal"
        onConfirm={handleDeleteAccount}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
