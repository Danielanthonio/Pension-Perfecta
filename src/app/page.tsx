"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";

export default function Home() {
  const router = useRouter();

  // Interceptar la redirección de Supabase para recuperación de contraseña o confirmación
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      // Supabase manda un 'code' al resetear clave.
      if (params.get("code") || window.location.hash.includes("type=recovery")) {
        router.push("/update-password");
      }
    }
  }, [router]);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-teal-900 text-white overflow-hidden relative flex flex-col justify-between selection:bg-emerald-500 selection:text-white">
      {/* Dynamic Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-7xl w-full mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2.5">
          <Heart className="h-8 w-8 text-emerald-400 fill-emerald-400/20" strokeWidth={2.5} />
          <div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Pensión Perfecta
            </span>
          </div>
        </div>
      </header>

      {/* Welcome Hero Content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-4xl mx-auto px-6 text-center relative z-10 py-12">
        <div className="space-y-6 animate-fade-in-up">
          <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-tight bg-gradient-to-r from-white via-slate-155 to-slate-300 bg-clip-text text-transparent">
            Bienvenidos al Portal
          </h1>
          <h2 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-350 to-emerald-400 bg-clip-text text-transparent pb-2">
            Pensión perfecta
          </h2>
          <p className="text-lg md:text-2xl text-slate-300 font-medium italic mt-8 tracking-wide">
            "Tu valor es incalculable, no lo olvides"
          </p>
        </div>

        <div className="mt-12">
          <Link
            href="/login"
            className="group relative inline-flex items-center justify-center px-12 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl text-lg font-bold shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
          >
            <span>Ingresar</span>
            <ArrowRight className="w-5.5 h-5.5 ml-2.5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-xs text-slate-500 relative z-10 border-t border-white/5 bg-slate-950/20">
        © {new Date().getFullYear()} Pensión Perfecta. Todos los derechos reservados.
      </footer>
    </main>
  );
}
