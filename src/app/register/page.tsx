"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/utils/context/AppContext";
import { ArrowRight, Lock, Mail, ShieldAlert, Sparkles, User, Phone, KeyRound } from "lucide-react";
import Link from "next/link";

export default function RegisterAliadoPage() {
  const router = useRouter();
  const { registerAliado, isDemoMode } = useApp();
  
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email || !phone || !password || !code) {
      setErrorMsg("Todos los campos son obligatorios.");
      return;
    }
    
    setLoading(true);
    setErrorMsg("");

    try {
      await registerAliado(fullName, email, phone, password, code);
      // Tras un registro exitoso, redirigimos al dashboard porque ya inicia sesión
      router.push("/dashboard");
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "Error al registrar el aliado. Verifica tu código.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center py-12 px-6 relative overflow-hidden select-none">
      {/* Background glow filters */}
      <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full bg-blue-500/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-15%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none" />

      <div className="max-w-md w-full bg-white/[0.03] backdrop-blur-xl border border-white/5 p-8 md:p-10 rounded-3xl shadow-2xl relative z-10 flex flex-col">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-3xl mb-4">
            🤝
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
            Nuevo Aliado
          </h2>
          <p className="mt-1 text-xs text-slate-400 font-semibold tracking-wider uppercase">
            Únete a la Red PensiónFlow
          </p>
        </div>

        {errorMsg && (
          <div className="mb-5 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Código de Invitación
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-emerald-500">
                <KeyRound className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ej. AL-2026-F9B48123"
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 focus:border-emerald-500 focus:bg-emerald-500/10 outline-none text-emerald-400 font-bold tracking-widest rounded-xl text-sm transition-all focus:ring-1 focus:ring-emerald-500 uppercase placeholder:normal-case placeholder:tracking-normal placeholder:font-normal"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Nombre Completo
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Tu nombre"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-blue-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Teléfono
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Phone className="h-4 w-4" />
                </span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10 dígitos"
                  disabled={loading}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-blue-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ej: roberto@asesores.com"
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-blue-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-blue-500"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={loading}
                className="w-full pl-10 pr-4 py-3 bg-white/5 hover:bg-white/[0.07] border border-white/5 focus:border-blue-500 focus:bg-white/[0.08] outline-none text-white rounded-xl text-sm transition-all focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2"
          >
            {loading ? "Registrando..." : "Crear Cuenta"}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-white/5 pt-6">
          <p className="text-xs text-slate-400">
            ¿Ya tienes una cuenta activa?{" "}
            <Link href="/login" className="text-emerald-400 hover:text-emerald-300 font-bold transition-colors">
              Iniciar sesión aquí
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
