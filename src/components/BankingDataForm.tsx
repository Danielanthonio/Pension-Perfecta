"use client";

import React, { useState, useEffect } from "react";
import { useApp, getBankingMode } from "@/utils/context/AppContext";
import {
  Landmark,
  CreditCard,
  Hash,
  User,
  Mail,
  Coins,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  Loader2,
} from "lucide-react";

// Ficha de cobro del usuario. Es UNA sola fuente de verdad reutilizada en dos
// lugares: la pestaña "Datos Bancarios" de Configuración y el recordatorio que
// salta al iniciar sesión. Así el aliado puede resolverlo sin salir del aviso.
//
// Qué se pide depende del rol (ver getBankingMode en AppContext):
//   * aliado                     → banco, cuenta, CLABE, tarjeta (opcional),
//                                  titular y correo para avisos de pago.
//   * director / account_manager → ID de Binance.

interface BankingDataFormProps {
  /** Se dispara tras guardar con éxito (el recordatorio lo usa para cerrarse). */
  onSaved?: () => void;
  /** Texto del botón de guardado. */
  submitLabel?: string;
  /** Nota al pie junto al botón. Si se omite, se muestra la de privacidad. */
  footerNote?: React.ReactNode;
}

type Errors = Partial<Record<string, string>>;

const onlyDigits = (v: string) => v.replace(/\D/g, "");

// ---------------------------------------------------------------------------
// Campo de texto reutilizable. Vive a nivel de módulo (NO dentro del componente)
// para que React no lo remonte en cada tecla y el input no pierda el foco.
// ---------------------------------------------------------------------------
function TextField({
  label,
  icon: Icon,
  value,
  onChange,
  placeholder,
  required,
  hint,
  error,
  maxLength,
  inputMode,
  type = "text",
  mono,
  focusBorder,
  trailing,
  autoFocus,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "email";
  type?: string;
  mono?: boolean;
  focusBorder: string;
  trailing?: React.ReactNode;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="flex items-baseline gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.06em] mb-2 leading-none">
        <span>{label}</span>
        {required ? (
          <span className="text-rose-500 font-black" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="text-[10px] font-semibold normal-case tracking-normal text-slate-400 dark:text-slate-500">
            (opcional)
          </span>
        )}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          inputMode={inputMode}
          autoFocus={autoFocus}
          autoComplete="off"
          className={`w-full pl-11 ${trailing ? "pr-11" : "pr-4"} py-3 bg-slate-50 dark:bg-slate-950 focus:bg-white dark:focus:bg-slate-900 border ${
            error ? "border-rose-400 dark:border-rose-500/60" : "border-slate-200 dark:border-slate-800"
          } ${focusBorder} outline-none rounded-xl text-[13px] font-semibold leading-normal text-slate-800 dark:text-slate-100 placeholder:font-medium placeholder:text-slate-400 dark:placeholder:text-slate-600 transition-colors ${
            mono ? "font-mono tabular-nums tracking-[0.08em]" : "tracking-[0.01em]"
          }`}
        />
        {trailing && <div className="absolute right-2.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {error ? (
        <p className="flex items-start gap-1.5 text-[11px] font-bold text-rose-500 dark:text-rose-400 mt-1.5 leading-snug">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          {error}
        </p>
      ) : hint ? (
        <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500 mt-1.5 leading-snug">{hint}</p>
      ) : null}
    </div>
  );
}

export default function BankingDataForm({ onSaved, submitLabel, footerNote }: BankingDataFormProps) {
  const { user, updateUserProfile } = useApp();

  const [banco, setBanco] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [clabe, setClabe] = useState("");
  const [tarjeta, setTarjeta] = useState("");
  const [titular, setTitular] = useState("");
  const [emailPagos, setEmailPagos] = useState("");
  const [binanceId, setBinanceId] = useState("");

  const [showTarjeta, setShowTarjeta] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!user) return;
    setBanco(user.banco || "");
    setCuenta(user.cuenta_bancaria || "");
    setClabe(user.clabe || "");
    setTarjeta(user.numero_tarjeta || "");
    setTitular(user.titular_cuenta || user.full_name || "");
    setEmailPagos(user.email_pagos || user.email || "");
    setBinanceId(user.binance_id || "");
  }, [user]);

  if (!user) return null;

  const isAM = user.role === "account_manager";
  const isDirector = user.role === "director";
  const mode = getBankingMode(user);

  const primaryBg = isAM
    ? "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400"
    : isDirector
    ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
    : "bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400";

  const focusBorder = isAM
    ? "focus:border-blue-500"
    : isDirector
    ? "focus:border-emerald-500"
    : "focus:border-indigo-500";

  const accentText = isAM
    ? "text-blue-600 dark:text-blue-400"
    : isDirector
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-indigo-600 dark:text-indigo-400";

  const validate = (): Errors => {
    const e: Errors = {};

    if (mode === "binance") {
      const id = binanceId.trim();
      if (!id) e.binanceId = "Escribe tu ID de Binance para poder pagarte.";
      else if (id.length < 5) e.binanceId = "El ID de Binance parece demasiado corto.";
      else if (!/^[A-Za-z0-9._@-]+$/.test(id)) e.binanceId = "El ID solo puede llevar letras, números y . _ - @";
      return e;
    }

    if (!banco.trim()) e.banco = "Indica el banco donde recibes tus pagos.";
    if (!cuenta.trim()) e.cuenta = "Escribe tu número de cuenta.";
    else if (cuenta.length < 6) e.cuenta = "El número de cuenta parece incompleto.";

    if (!clabe.trim()) e.clabe = "La CLABE es obligatoria: es con lo que se hace la transferencia.";
    else if (clabe.length !== 18) e.clabe = `La CLABE debe tener exactamente 18 dígitos (llevas ${clabe.length}).`;

    if (!titular.trim()) e.titular = "Escribe el nombre completo del titular de la cuenta.";
    else if (titular.trim().length < 5) e.titular = "Escribe el nombre completo, tal como aparece en el banco.";

    if (tarjeta && (tarjeta.length < 15 || tarjeta.length > 19))
      e.tarjeta = "Un número de tarjeta tiene entre 15 y 19 dígitos.";

    if (emailPagos.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailPagos.trim()))
      e.emailPagos = "Ese correo no parece válido.";

    return e;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setSaveError("");
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (mode === "binance") {
        await updateUserProfile({
          binance_id: binanceId.trim(),
          datos_bancarios_updated_at: now,
        });
      } else {
        await updateUserProfile({
          banco: banco.trim(),
          cuenta_bancaria: cuenta.trim(),
          clabe: clabe.trim(),
          numero_tarjeta: tarjeta.trim() || null,
          titular_cuenta: titular.trim(),
          email_pagos: emailPagos.trim() || null,
          datos_bancarios_updated_at: now,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3500);
      onSaved?.();
    } catch (err: any) {
      console.error("Error guardando datos bancarios:", err);
      setSaveError(
        err?.message?.includes("column")
          ? "La base de datos aún no tiene los campos de cobro. Avisa a Dirección."
          : "No se pudieron guardar tus datos de cobro. Inténtalo de nuevo."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Encabezado explicativo */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-150 dark:border-slate-850">
        {mode === "binance" ? (
          <Coins className={`h-5 w-5 shrink-0 mt-0.5 ${accentText}`} />
        ) : (
          <Landmark className={`h-5 w-5 shrink-0 mt-0.5 ${accentText}`} />
        )}
        <p className="text-[12px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
          {mode === "binance" ? (
            <>
              Tus pagos se envían por <strong className="font-bold text-slate-700 dark:text-slate-200">Binance</strong>.
              Registra tu ID para que Administración pueda depositarte sin pedírtelo cada vez.
            </>
          ) : (
            <>
              Aquí registras <strong className="font-bold text-slate-700 dark:text-slate-200">a dónde te depositamos</strong> tus
              comisiones. Revisa bien la CLABE: es el dato con el que viaja la transferencia.
            </>
          )}
        </p>
      </div>

      {mode === "binance" ? (
        <TextField
          label="ID de Binance"
          icon={Coins}
          value={binanceId}
          onChange={(v) => setBinanceId(v.trim())}
          placeholder="Ej. 384920175"
          required
          hint="Es el ID numérico de tu cuenta (Binance › Perfil). También se acepta tu Pay ID o correo registrado."
          error={errors.binanceId}
          maxLength={64}
          focusBorder={focusBorder}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-5">
            <TextField
              label="Banco"
              icon={Landmark}
              value={banco}
              onChange={setBanco}
              placeholder="Ej. BBVA, Banorte, Santander"
              required
              error={errors.banco}
              maxLength={60}
              focusBorder={focusBorder}
            />
            <TextField
              label="Número de cuenta"
              icon={Hash}
              value={cuenta}
              onChange={(v) => setCuenta(onlyDigits(v))}
              placeholder="Solo números"
              required
              error={errors.cuenta}
              maxLength={20}
              inputMode="numeric"
              mono
              focusBorder={focusBorder}
            />
          </div>

          <TextField
            label="CLABE interbancaria"
            icon={CreditCard}
            value={clabe}
            onChange={(v) => setClabe(onlyDigits(v))}
            placeholder="18 dígitos"
            required
            hint={
              clabe.length > 0 && clabe.length < 18
                ? `Llevas ${clabe.length} de 18 dígitos.`
                : "18 dígitos, sin espacios ni guiones. Es la clave con la que se hace el depósito."
            }
            error={errors.clabe}
            maxLength={18}
            inputMode="numeric"
            mono
            focusBorder={focusBorder}
          />

          <TextField
            label="Número de tarjeta"
            icon={CreditCard}
            value={tarjeta}
            onChange={(v) => setTarjeta(onlyDigits(v))}
            placeholder="Solo si cobras a tarjeta"
            hint="No es necesario si ya diste tu CLABE."
            error={errors.tarjeta}
            maxLength={19}
            inputMode="numeric"
            type={showTarjeta ? "text" : "password"}
            mono
            focusBorder={focusBorder}
            trailing={
              <button
                type="button"
                onClick={() => setShowTarjeta((s) => !s)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
                aria-label={showTarjeta ? "Ocultar número de tarjeta" : "Mostrar número de tarjeta"}
              >
                {showTarjeta ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <TextField
            label="Nombre del titular"
            icon={User}
            value={titular}
            onChange={setTitular}
            placeholder="Como aparece en el banco"
            required
            hint="Si la cuenta no está a tu nombre, escribe el nombre de quien la recibe."
            error={errors.titular}
            maxLength={120}
            focusBorder={focusBorder}
          />

          <TextField
            label="Correo para notificaciones de pago"
            icon={Mail}
            value={emailPagos}
            onChange={setEmailPagos}
            placeholder="correo@ejemplo.com"
            hint="A este correo llegan los avisos cuando se libera un pago."
            error={errors.emailPagos}
            maxLength={120}
            inputMode="email"
            focusBorder={focusBorder}
          />
        </>
      )}

      {saveError && (
        <p className="flex items-start gap-2 text-[12px] font-bold text-rose-600 dark:text-rose-400 leading-snug">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px" />
          {saveError}
        </p>
      )}

      <div className="pt-1 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        {saved ? (
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[12px] font-bold">
            <CheckCircle className="h-4 w-4 shrink-0" /> Datos de cobro guardados
          </div>
        ) : (
          footerNote ?? (
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-semibold leading-snug">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Solo Administración ve estos datos, para pagarte.
            </div>
          )
        )}

        <button
          type="submit"
          disabled={saving}
          className={`shrink-0 px-6 py-3 ${primaryBg} text-white font-extrabold rounded-xl text-[12px] tracking-[0.02em] transition-all flex items-center justify-center gap-2 active:scale-95`}
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Guardando..." : submitLabel || "Guardar datos de cobro"}
        </button>
      </div>
    </form>
  );
}
