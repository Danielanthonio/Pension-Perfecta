"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, UserRole } from "@/utils/context/AppContext";
import { ArrowRight, Lock, Mail, ShieldAlert, Sparkles, Heart } from "lucide-react";

export default function RoleSelectionPage() {
  const router = useRouter();
  const { login, isDemoMode } = useApp();
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleDemoLogin = async (email: string, role: UserRole) => {
    setLoading(true);
    setErrorMsg("");
    try {
      await login(email, role);
      if (role === "director") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setErrorMsg("Ocurrió un error al iniciar sesión en el entorno de pruebas.");
    } finally {
      setLoading(false);
    }
  };

  const handleFormLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) {
      setErrorMsg("Ingresa tu correo electrónico.");
      return;
    }
    setLoading(true);
    setErrorMsg("");

    // Detect role from email or assign default
    const isDirectorEmail = emailInput.toLowerCase().includes("director") || emailInput.toLowerCase().includes("admin");
    const role: UserRole = isDirectorEmail ? "director" : "aliado";

    try {
      const realRole = await login(emailInput, role, passwordInput);
      if (realRole === "director") {
        router.push("/admin");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setErrorMsg("Credenciales inválidas o error de red.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-teal-900 flex items-center justify-center py-12 px-6 relative overflow-hidden select-none">
      {/* Background glow filters */}
      <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full bg-emerald-500/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[60%] h-[60%] rounded-full bg-teal-500/10 blur-[150px] pointer-events-none" />

      <div className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/5 p-8 md:p-10 rounded-3xl shadow-2xl relative z-10 flex flex-col">
        {/* Brand Header */}
        <div className="text-center mb-8 flex flex-col items-center">
          <Heart className="h-12 w-12 text-emerald-400 fill-emerald-400/20 mb-4" strokeWidth={2} />
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Pensión Perfecta
          </h2>
          <p className="mt-1 text-xs text-slate-400 font-semibold tracking-wider uppercase">
            Portal Operativo Ley 73
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Demo Impersonation Portal */}
        <div className="bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-slate-900/5 border border-emerald-500/20 rounded-2xl p-5 mb-6 relative overflow-hidden group">
          <div className="absolute top-[-30px] right-[-30px] w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-125 transition-transform" />
          <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5 mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            Consola Demo • 1-Clic
          </h3>

          <div className="space-y-3">
            <button
              onClick={() => handleDemoLogin("roberto@asesores.com", "aliado")}
              disabled={loading}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.05] border border-white/5 hover:border-white/10 text-white rounded-xl transition-all font-medium text-xs md:text-sm group/btn"
            >
              <div className="text-left">
                <span className="block font-bold text-slate-200">Ingresar como Aliado</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">Roberto Asesor (Captura e histórico)</span>
              </div>
              <ArrowRight className="h-4 w-4 text-emerald-400 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>

            <button
              onClick={() => handleDemoLogin("eduardo@pensionflow.com", "director")}
              disabled={loading}
              className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] active:bg-white/[0.05] border border-white/5 hover:border-white/10 text-white rounded-xl transition-all font-medium text-xs md:text-sm group/btn"
            >
              <div className="text-left">
                <span className="block font-bold text-slate-200">Ingresar como Director</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">Eduardo Operaciones (Simulador y Pipeline)</span>
              </div>
              <ArrowRight className="h-4 w-4 text-teal-400 group-hover/btn:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>

        {/* Separator */}
        <div className="relative flex items-center justify-center my-4">
          <div className="border-t border-white/5 w-full" />
          <span className="absolute bg-[#0b1b18] px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
            O ingresar correo
          </span>
        </div>

        {/* Traditional Credentials Form */}
        <form onSubmit={handleFormLogin} className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Correo Electrónico
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Mail className="h-4 w-4" />
              </span>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="ej: roberto@asesores.com"
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Contraseña
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <Lock className="h-4 w-4" />
              </span>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-emerald-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-500/10 flex items-center justify-center gap-2"
          >
            {loading ? "Accediendo..." : "Iniciar Sesión"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-[10px] text-slate-500 font-medium">
            Entorno {isDemoMode ? "de Evaluación Local 💡" : "de Producción Supabase ⚡"}
          </p>
        </div>
      </div>
    </div>
  );
}
