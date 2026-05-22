"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RedirectToRegister() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/login?state=register");
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin mb-4" />
        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Redirigiendo al portal unificado...</p>
      </div>
    </div>
  );
}
