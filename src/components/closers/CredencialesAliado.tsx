"use client";

// Credenciales de acceso de un aliado, para dictárselas cuando las pierde.
//
// Por qué esto no lee el perfil y ya: el RLS de Postgres es ciego a COLUMNAS, y
// la política que le deja a un closer ver a sus aliados atribuidos le entrega la
// fila entera. Quien decide si estas credenciales se pueden ver es la función
// `credenciales_aliado` de la base (20260804000000), que solo responde a
// Dirección, al Account Manager o al closer que ABRIÓ esa cuenta —no al que
// simplemente la tiene atribuida (§8/§9)— y deja constancia de la consulta en la
// auditoría. La pantalla obedece; la barrera está abajo.
//
// La contraseña se muestra oculta de entrada: estas pantallas se abren delante
// de otras personas y en llamadas compartidas.

import React, { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Eye, EyeOff, Key, Loader2, X } from "lucide-react";
import { useApp } from "@/utils/context/AppContext";

export function CredencialesAliado({
  aliadoId,
  aliadoNombre,
  onCerrar,
}: {
  aliadoId: string;
  aliadoNombre: string;
  onCerrar: () => void;
}) {
  const { credencialesAliado } = useApp();

  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [datos, setDatos] = useState<{ email: string; password: string | null } | null>(null);
  const [visible, setVisible] = useState(false);
  const [copiado, setCopiado] = useState<"email" | "pass" | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await credencialesAliado(aliadoId);
        if (vivo) setDatos(r);
      } catch (err: any) {
        if (vivo) setErrorMsg(err?.message || "No se pudieron consultar las credenciales.");
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [aliadoId, credencialesAliado]);

  const copiar = async (texto: string, cual: "email" | "pass") => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      /* si el navegador lo bloquea, el dato está a la vista de todos modos */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onCerrar} />
      <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center shrink-0">
              <Key className="h-4 w-4" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Credenciales de acceso</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{aliadoNombre}</p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {cargando ? (
            <div className="py-6 flex items-center justify-center gap-2 text-slate-400 dark:text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs font-semibold">Consultando…</span>
            </div>
          ) : errorMsg ? (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
              <p className="text-[11px] text-rose-700 dark:text-rose-300">{errorMsg}</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Correo
                  </span>
                  <span className="block text-xs font-mono font-bold text-slate-800 dark:text-white truncate">
                    {datos?.email || "—"}
                  </span>
                </div>
                <button
                  onClick={() => copiar(datos?.email || "", "email")}
                  className="shrink-0 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {copiado === "email" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Contraseña provisional
                  </span>
                  <span className="block text-xs font-mono font-bold text-slate-800 dark:text-white truncate">
                    {!datos?.password ? "—" : visible ? datos.password : "••••••••••"}
                  </span>
                </div>
                {datos?.password && (
                  <button
                    onClick={() => setVisible((v) => !v)}
                    title={visible ? "Ocultar" : "Mostrar"}
                    className="shrink-0 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => copiar(datos?.password || "", "pass")}
                  disabled={!datos?.password}
                  className="shrink-0 px-2.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 disabled:opacity-40 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {copiado === "pass" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>

              {!datos?.password && (
                // Es lo normal en cuanto el aliado se cambia la contraseña: la
                // provisional deja de existir y ya nadie puede recuperarla.
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                  No hay contraseña provisional guardada. O el aliado ya la cambió, o su cuenta se creó sin
                  una. Para devolverle el acceso, pídele a Dirección que le genere una nueva.
                </p>
              )}

              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Esta consulta queda registrada con tu nombre y la hora. Dicta las credenciales solo al
                  titular de la cuenta.
                </p>
              </div>
            </>
          )}

          <button
            onClick={onCerrar}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
