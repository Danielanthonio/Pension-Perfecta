"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/utils/context/AppContext";
import ClosersOverview from "@/components/closers/ClosersOverview";

// Quién entra aquí:
//   · director/admin → el tablero completo
//   · closer         → se le manda a SU ficha; no ve a los demás closers
//   · aliado         → el layout de /admin ya lo devuelve a /dashboard
//   · account manager→ fuera: el módulo no forma parte de su operación, y el RLS
//                      del backend tampoco le daría los datos
function ClosersGate() {
  const { user, isLoading } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.role === "closer") router.replace(`/admin/closers/${user.id}`);
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando closers…</div>;
  }

  if (user.role === "closer") {
    return <div className="p-6 text-sm text-slate-400">Abriendo tu ficha…</div>;
  }

  if (user.role !== "director") {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          No tienes permiso para ver el módulo Closers.
        </p>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          Pide acceso a la Dirección si necesitas consultar estas métricas.
        </p>
      </div>
    );
  }

  return <ClosersOverview />;
}

export default function ClosersPage() {
  // ClosersOverview lee los filtros de la URL con useSearchParams.
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando closers…</div>}>
      <ClosersGate />
    </Suspense>
  );
}
