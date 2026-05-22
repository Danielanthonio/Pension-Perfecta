"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/utils/context/AppContext";
import { motion } from "framer-motion";
import { Heart, Lock, ShieldAlert, CheckCircle2 } from "lucide-react";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const { updateUserPassword } = useApp();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      await updateUserPassword(password);
      setSuccessMsg("¡Contraseña actualizada con éxito! Redirigiendo al login...");
      setTimeout(() => {
        router.push("/login");
      }, 2500);
    } catch (err: any) {
      console.error("Update password error:", err);
      setErrorMsg("Error al actualizar la contraseña. Es posible que el enlace haya expirado.");
    } finally {
      setLoading(false);
    }
  };

  const formVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "easeOut" } },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-teal-900 flex items-center justify-center py-12 px-6 relative overflow-hidden select-none">
      {/* Ambient backgrounds */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        variants={formVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md bg-slate-900/40 backdrop-blur-2xl rounded-[32px] border border-white/5 shadow-2xl p-8 relative z-10 flex flex-col min-h-[450px]"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="flex justify-center"
          >
            <Heart className="h-12 w-12 text-emerald-400 fill-emerald-400/20 mb-3 cursor-pointer" strokeWidth={1.5} />
          </motion.div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Actualizar Clave
          </h2>
          <p className="mt-1 text-[10px] text-slate-400 font-bold tracking-widest uppercase">
            Ingresa tu nueva contraseña segura
          </p>
        </div>

        {errorMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <p>{errorMsg}</p>
          </motion.div>
        )}
        {successMsg && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs font-semibold flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleUpdate} className="space-y-4 flex-1 flex flex-col justify-center">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Nueva Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading || !!successMsg}
                className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Confirmar Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading || !!successMsg}
                className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !!successMsg}
            className="w-full mt-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
          >
            {loading ? "Guardando..." : "Actualizar Contraseña"}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
