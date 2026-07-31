import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStore } from "../stores/useStore";

const isSupabaseConfigured =
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_URL !== "https://your-project.supabase.co";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setUser = useStore((s) => s.setUser);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!isSupabaseConfigured) return;
    setError("");
    setMessage("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: name.trim() || email } },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session) {
      if (data.user) {
        setUser({
          id: data.user.id,
          email: data.user.email || "",
          name: name.trim() || data.user.email || "User",
          auth_source: "supabase",
        });
      }
      navigate("/orders");
    } else {
      setMessage(
        "Akun berhasil dibuat. Cek email kamu untuk konfirmasi, lalu login."
      );
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-pink-50 via-white to-rose-50 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-20 -right-20 w-72 h-72 bg-pink-200/40 rounded-full blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-rose-200/30 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-40 h-40 bg-pink-100/50 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="bg-white/80 backdrop-blur-xl shadow-xl shadow-pink-100/50 border border-pink-100/60 rounded-3xl p-8">
          <div className="flex flex-col items-center mb-8">
            <img src="/logo.png" alt="Jastip_mamanay" className="w-20 h-20 rounded-2xl mb-4 shadow-lg shadow-pink-300/40 object-contain bg-pink-50 border border-pink-100" />
            <h1 className="text-3xl font-bold text-gray-800">
              Jastip_mamanay
            </h1>
            <p className="text-gray-400 text-base mt-1">
              {isSupabaseConfigured
                ? "Buat akun baru"
                : "Mode Offline"}
            </p>
            {!isSupabaseConfigured && (
              <p className="text-gray-300 text-xs mt-0.5">
                Pendaftaran hanya aktif jika Supabase terhubung
              </p>
            )}
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                Nama
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
                placeholder="Nama kamu"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
                placeholder="email@contoh.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 bg-pink-50/50 border border-pink-100 rounded-2xl text-gray-800 placeholder-gray-400 text-base focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300 transition-all"
                placeholder="Minimal 6 karakter"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-500 text-base">{error}</p>
              </div>
            )}

            {message && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                <p className="text-green-600 text-sm leading-relaxed">{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full py-3.5 bg-gradient-to-r from-pink-400 to-rose-500 hover:from-pink-500 hover:to-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-2xl transition-all shadow-lg shadow-pink-300/30 active:scale-[0.98]"
            >
              {loading ? "Mendaftar..." : "Daftar"}
            </button>
          </form>

          <p className="text-center text-gray-400 text-sm mt-6">
            Sudah punya akun?{" "}
            <Link to="/login" className="text-pink-500 font-semibold hover:text-pink-600">
              Masuk
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
