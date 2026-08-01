"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { useApp } from "@/utils/context/AppContext";
import CloserDetail from "@/components/closers/CloserDetail";

// Un closer solo puede abrir SU propia ficha. El bloqueo real está en la base
// (las RPC `closers_overview` / `closer_aliados` son SECURITY DEFINER y
// comprueban el alcance por dentro); esto es la cortesía de UI, no la defensa.
function CloserDetailGate() {
  const params = useParams();
  const { user, isLoading } = useApp();
  const closerId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  if (isLoading || !user) {
    return <div className="p-6 text-sm text-slate-400">Cargando ficha…</div>;
  }

  const permitido = user.role === "director" || (user.role === "closer" && user.id === closerId);

  if (!permitido) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/70 dark:border-slate-800 shadow-sm px-6 py-14 text-center">
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          No tienes permiso para ver esta ficha.
        </p>
        <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
          Un closer solo puede consultar su propia información.
        </p>
      </div>
    );
  }

  return <CloserDetail closerId={closerId} />;
}

export default function CloserDetailPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando ficha…</div>}>
      <CloserDetailGate />
    </Suspense>
  );
}
