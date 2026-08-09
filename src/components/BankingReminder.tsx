"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp, getBankingCompletion } from "@/utils/context/AppContext";
import BankingDataForm from "@/components/BankingDataForm";
import { Landmark, Coins, X } from "lucide-react";

// Recordatorio de datos de cobro. Se monta una sola vez en el layout raíz (junto
// a GlobalChat) y sigue apareciendo DURANTE toda la sesión a quien todavía no
// tenga registrado cómo se le paga.
//
// "Más tarde" NO es un descarte definitivo: solo pausa el aviso SNOOZE_MINUTES
// y vuelve a salir mientras los datos sigan faltando. La única forma de que deje
// de aparecer es completarlos (o que Dirección los cargue). Es a propósito: sin
// datos de cobro el usuario no puede recibir su dinero, así que el recordatorio
// tiene que ser insistente, no un aviso de una sola vez que se ignora y se olvida.
//
// Trae el formulario dentro también a propósito: un recordatorio que solo dice
// "ve a Configuración" se ignora. Aquí se resuelve en el momento y se cierra solo
// al guardar. Nunca bloquea la operación: siempre se puede posponer.

export const BANKING_REMINDER_KEY = "pensionflow_banking_reminder_snooze";

// Cuánto se calla el aviso al darle "Más tarde".
const SNOOZE_MINUTES = 10;
const SNOOZE_MS = SNOOZE_MINUTES * 60 * 1000;

// Cada cuánto se revisa si ya venció la pausa.
const CHECK_MS = 30 * 1000;

export default function BankingReminder() {
  const { user, isProvisionalSession, isLoading } = useApp();
  const pathname = usePathname() || "";
  const [open, setOpen] = useState(false);

  const banking = getBankingCompletion(user);
  const hiddenRoute = /^\/(login|register|update-password)(\/|$)/.test(pathname);
  // El rol `finanzas` administra el dinero de los demás pero no cobra en el
  // libro mayor (`comision_eventos.rol_beneficiario` no lo admite, ver
  // 20260808000001): pedirle datos de cobro que nadie va a usar es solo ruido.
  const cobraEnPlataforma = user?.role !== "finanzas";
  const shouldRemind =
    !!user && !isLoading && !isProvisionalSession && !hiddenRoute && cobraEnPlataforma && !banking.complete;

  useEffect(() => {
    if (!shouldRemind || !user) {
      setOpen(false);
      return;
    }

    // La pausa se guarda como "<id de usuario>:<timestamp de vencimiento>". Se
    // ata al id para que, si entra otra persona en la misma pestaña, no herede
    // la pausa de la anterior.
    const snoozedUntil = (): number => {
      try {
        const raw = sessionStorage.getItem(BANKING_REMINDER_KEY);
        if (!raw) return 0;
        const [id, ts] = raw.split(":");
        return id === user.id ? Number(ts) || 0 : 0;
      } catch {
        // Sin sessionStorage (modo privado estricto) no podríamos recordar la
        // pausa y el aviso saldría en bucle: mejor mostrarlo una sola vez.
        return open ? 0 : Number.MAX_SAFE_INTEGER;
      }
    };

    const check = () => setOpen(Date.now() >= snoozedUntil());

    // El primer aviso lleva un pequeño retraso: deja que termine la hidratación
    // y cualquier redirección de rol, para que no parpadee sobre la pantalla de
    // carga. Después basta con vigilar el vencimiento de la pausa.
    const first = window.setTimeout(check, 1200);
    const interval = window.setInterval(check, CHECK_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRemind, user]);

  // "Más tarde" / cerrar: pausa el aviso, no lo elimina.
  const snooze = () => {
    try {
      if (user) sessionStorage.setItem(BANKING_REMINDER_KEY, `${user.id}:${Date.now() + SNOOZE_MS}`);
    } catch {}
    setOpen(false);
  };

  // Al guardar ya no hace falta ninguna pausa: el aviso deja de aplicar solo.
  const resolved = () => {
    try {
      sessionStorage.removeItem(BANKING_REMINDER_KEY);
    } catch {}
    setOpen(false);
  };

  if (!open || !user) return null;

  const isAM = user.role === "account_manager";
  const isDirector = user.role === "director";
  const isBinance = banking.mode === "binance";

  const accentSoft = isAM
    ? "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
    : isDirector
    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
    : "bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400";

  const Icon = isBinance ? Coins : Landmark;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-[28px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl">
        {/* Encabezado */}
        <div className="flex items-start gap-4 p-6 pb-5 border-b border-slate-100 dark:border-slate-850">
          <div className={`h-12 w-12 shrink-0 rounded-2xl flex items-center justify-center ${accentSoft}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-[0.12em] leading-none">
              Recordatorio
            </span>
            <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight mt-2 leading-snug">
              Aún no registras tus datos de cobro
            </h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed mt-1.5">
              {isBinance
                ? "Sin tu ID de Binance no podemos enviarte tus pagos. Toma menos de un minuto."
                : "Sin tus datos bancarios no podemos depositarte tus comisiones. Toma menos de un minuto."}
            </p>
          </div>
          <button
            onClick={snooze}
            className="shrink-0 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
            aria-label="Cerrar recordatorio"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Formulario (se cierra solo al guardar) */}
        <div className="p-6">
          <BankingDataForm
            onSaved={resolved}
            submitLabel="Guardar y continuar"
            footerNote={
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={snooze}
                  className="self-start text-[12px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors underline underline-offset-4 decoration-slate-300 dark:decoration-slate-700"
                >
                  Más tarde
                </button>
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 leading-snug">
                  Te lo recordaremos de nuevo en unos minutos.
                </span>
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}
