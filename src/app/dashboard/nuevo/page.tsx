"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/utils/context/AppContext";
import {
  Plus,
  Cloud,
  FileCheck,
  Save,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  User,
  Hash,
  Mail,
  Phone,
  FileText,
} from "lucide-react";

export default function SubirProspecto() {
  const router = useRouter();
  const { addProspect } = useApp();

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [nss, setNss] = useState("");
  const [curp, setCurp] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notesAliado, setNotesAliado] = useState("");

  // File Upload State Simulations
  const [aforeFileName, setAforeFileName] = useState("");
  const [aforeProgress, setAforeProgress] = useState(0);
  const [aforeUploading, setAforeUploading] = useState(false);

  const [imssFileName, setImssFileName] = useState("");
  const [imssProgress, setImssProgress] = useState(0);
  const [imssUploading, setImssUploading] = useState(false);

  const [aforeFileDataUrl, setAforeFileDataUrl] = useState("");
  const [imssFileDataUrl, setImssFileDataUrl] = useState("");

  // Errors / Submitting
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // Real-time Validations
  const nssValid = nss.length === 11 && /^\d+$/.test(nss);
  const curpValid = curp.length === 18 && /^[A-Z0-9]+$/i.test(curp);
  const nameValid = fullName.trim().length > 4;
  const phoneValid = phone.trim().length >= 10;
  const emailValid = email.trim().includes("@");
  
  const hasDocuments = aforeFileName !== "" || imssFileName !== "";
  const uploadsInProgress = aforeUploading || imssUploading;
  const filesReady = (!aforeFileName || aforeFileDataUrl !== "") && (!imssFileName || imssFileDataUrl !== "");
  const formIsValid = nameValid && nssValid && curpValid && phoneValid && emailValid && hasDocuments && !uploadsInProgress && filesReady;

  const simulateFileUpload = (type: "afore" | "imss", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file as Base64 Data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        if (type === "afore") {
          setAforeFileDataUrl(event.target.result as string);
        } else {
          setImssFileDataUrl(event.target.result as string);
        }
      }
    };
    reader.readAsDataURL(file);

    if (type === "afore") {
      setAforeUploading(true);
      setAforeProgress(0);
      setAforeFileName(file.name);

      const interval = setInterval(() => {
        setAforeProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setAforeUploading(false);
            return 100;
          }
          return prev + 10;
        });
      }, 100);
    } else {
      setImssUploading(true);
      setImssProgress(0);
      setImssFileName(file.name);

      const interval = setInterval(() => {
        setImssProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setImssUploading(false);
            return 100;
          }
          return prev + 10;
        });
      }, 100);
    }
  };

  const handleSave = async () => {
    setFormSubmitted(true);
    if (!formIsValid) {
      if (!hasDocuments) {
        setErrorMsg("Es obligatorio subir al menos un documento para enviar a evaluación técnica (AFORE o IMSS).");
      } else {
        setErrorMsg("Por favor corrige los datos del prospecto antes de continuar.");
      }
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      await addProspect(
        {
          full_name: fullName,
          nss,
          curp: curp.toUpperCase(),
          phone,
          email,
          notes_aliado: notesAliado,
        },
        aforeFileName ? { name: aforeFileName, dataUrl: aforeFileDataUrl } : undefined,
        imssFileName ? { name: imssFileName, dataUrl: imssFileDataUrl } : undefined
      );

      // Successful redirect to evaluation list
      router.push("/dashboard");
    } catch (err) {
      setErrorMsg("Ocurrió un error al registrar el prospecto.");
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16 select-none animate-fade-in">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <span className="text-[10px] text-blue-500 font-bold uppercase tracking-widest">Nuevo Expediente</span>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">Captura de Prospecto Ley 73</h1>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 p-4 rounded-2xl text-xs font-semibold flex items-center gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Personal Data */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <User className="h-4.5 w-4.5 text-blue-500" />
                Información del Prospecto
              </h2>
              <span className="text-[10px] font-bold text-slate-400">* Obligatorio</span>
            </div>

            <div className="p-6 space-y-5">
              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nombre Completo *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <User className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ej: Juan Pérez García"
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-xl text-xs font-semibold outline-none focus:bg-white transition-all ${
                      formSubmitted && !nameValid ? "border-red-400 focus:ring-1 focus:ring-red-400" : "border-slate-200 focus:border-blue-500"
                    } ${highlightFields ? "ring-2 ring-emerald-400 bg-emerald-50/50 transition-all duration-500" : ""}`}
                  />
                </div>
                {formSubmitted && !nameValid && (
                  <span className="text-[10px] text-red-500 font-semibold mt-1 block">El nombre es demasiado corto.</span>
                )}
              </div>

              {/* NSS & CURP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* NSS */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                    <span>Número de Seguridad Social (NSS) *</span>
                    <span title="11 dígitos de tu carnet del IMSS">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Hash className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      maxLength={11}
                      value={nss}
                      onChange={(e) => setNss(e.target.value.replace(/\D/g, ""))}
                      placeholder="11 dígitos"
                      className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-xl text-xs font-semibold outline-none focus:bg-white transition-all ${
                        formSubmitted && !nssValid ? "border-red-400 focus:ring-1 focus:ring-red-400" : "border-slate-200 focus:border-blue-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 bg-emerald-50/50 transition-all duration-500" : ""}`}
                    />
                    {nss.length > 0 && (
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        {nssValid ? (
                          <CheckCircle className="h-4.5 w-4.5 text-emerald-500 animate-scale-in" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">{nss.length}/11</span>
                        )}
                      </span>
                    )}
                  </div>
                  {formSubmitted && !nssValid && (
                    <span className="text-[10px] text-red-500 font-semibold mt-1 block">El NSS debe tener exactamente 11 dígitos numéricos.</span>
                  )}
                </div>

                {/* CURP */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                    <span>Clave Única de Registro (CURP) *</span>
                    <span title="18 caracteres alfanuméricos">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 cursor-help" />
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <FileText className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      maxLength={18}
                      value={curp}
                      onChange={(e) => setCurp(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                      placeholder="18 caracteres alfanuméricos"
                      className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-xl text-xs font-semibold outline-none focus:bg-white transition-all ${
                        formSubmitted && !curpValid ? "border-red-400 focus:ring-1 focus:ring-red-400" : "border-slate-200 focus:border-blue-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 bg-emerald-50/50 transition-all duration-500" : ""}`}
                    />
                    {curp.length > 0 && (
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        {curpValid ? (
                          <CheckCircle className="h-4.5 w-4.5 text-emerald-500 animate-scale-in" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400">{curp.length}/18</span>
                        )}
                      </span>
                    )}
                  </div>
                  {formSubmitted && !curpValid && (
                    <span className="text-[10px] text-red-500 font-semibold mt-1 block">El CURP debe tener exactamente 18 caracteres alfanuméricos.</span>
                  )}
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Teléfono *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className="h-4 w-4" />
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="ej: 5512345678"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-xl text-xs font-semibold outline-none focus:bg-white transition-all ${
                        formSubmitted && !phoneValid ? "border-red-400 focus:ring-1 focus:ring-red-400" : "border-slate-200 focus:border-blue-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 bg-emerald-50/50 transition-all duration-500" : ""}`}
                    />
                  </div>
                  {formSubmitted && !phoneValid && (
                    <span className="text-[10px] text-red-500 font-semibold mt-1 block">Ingresa un número telefónico de 10 dígitos.</span>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Email *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ej: pedro@gmail.com"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 border rounded-xl text-xs font-semibold outline-none focus:bg-white transition-all ${
                        formSubmitted && !emailValid ? "border-red-400 focus:ring-1 focus:ring-red-400" : "border-slate-200 focus:border-blue-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 bg-emerald-50/50 transition-all duration-500" : ""}`}
                    />
                  </div>
                  {formSubmitted && !emailValid && (
                    <span className="text-[10px] text-red-500 font-semibold mt-1 block">Ingresa un correo electrónico válido.</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notas adicionales del cliente</label>
                <textarea
                  rows={3}
                  value={notesAliado}
                  onChange={(e) => setNotesAliado(e.target.value)}
                  placeholder="Escribe comentarios, dudas o incidencias iniciales relevantes..."
                  className="w-full border border-slate-200 rounded-xl p-3 bg-slate-50 hover:bg-slate-100/80 outline-none text-xs font-semibold focus:bg-white focus:border-blue-500 transition-all resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Document Upload and Validation rules */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50">
              <h2 className="text-xs font-bold text-slate-600 uppercase tracking-widest flex items-center gap-2">
                <FileCheck className="h-4.5 w-4.5 text-blue-500" />
                Carga Expediente *
              </h2>
            </div>

            <div className="p-6 space-y-5">
              <span className="text-[10px] text-slate-400 font-medium block leading-normal">
                Sube reportes PDF o imágenes legibles. Es **obligatorio** subir al menos uno para iniciar.
              </span>

              {/* Dropzone 1: Afore */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">1. Estado de Cuenta AFORE</label>
                <div className="relative border border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-slate-100/60 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative overflow-hidden group">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => simulateFileUpload("afore", e)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {aforeFileName ? (
                    <div className="w-full flex flex-col items-center animate-scale-in">
                      <FileCheck className={`h-8 w-8 ${aforeUploading ? "text-blue-400" : "text-emerald-500"}`} />
                      <span className="text-[11px] font-bold text-slate-700 mt-2 truncate w-full max-w-[150px]">{aforeFileName}</span>
                      {aforeUploading ? (
                        <div className="w-full mt-3 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-100" style={{ width: `${aforeProgress}%` }} />
                        </div>
                      ) : (
                        <span className="text-[9px] text-emerald-600 font-bold mt-1.5">Cargado con éxito ✅</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <Cloud className="h-8 w-8 text-slate-400 mb-2 group-hover:text-blue-500 group-hover:scale-105 transition-all" />
                      <span className="text-[11px] font-bold text-slate-700">Subir AFORE</span>
                      <span className="text-[9px] text-slate-400 mt-0.5">PDF o imagen (.jpg, .png)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Dropzone 2: IMSS */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">2. Reporte Semanas IMSS</label>
                <div className="relative border border-dashed border-slate-300 hover:border-blue-400 bg-slate-50 hover:bg-slate-100/60 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative overflow-hidden group">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => simulateFileUpload("imss", e)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {imssFileName ? (
                    <div className="w-full flex flex-col items-center animate-scale-in">
                      <FileCheck className={`h-8 w-8 ${imssUploading ? "text-blue-400" : "text-emerald-500"}`} />
                      <span className="text-[11px] font-bold text-slate-700 mt-2 truncate w-full max-w-[150px]">{imssFileName}</span>
                      {imssUploading ? (
                        <div className="w-full mt-3 bg-slate-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-100" style={{ width: `${imssProgress}%` }} />
                        </div>
                      ) : (
                        <span className="text-[9px] text-emerald-600 font-bold mt-1.5">Cargado con éxito ✅</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <Cloud className="h-8 w-8 text-slate-400 mb-2 group-hover:text-blue-500 group-hover:scale-105 transition-all" />
                      <span className="text-[11px] font-bold text-slate-700">Subir IMSS</span>
                      <span className="text-[9px] text-slate-400 mt-0.5">Reporte digital oficial</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Submission Action Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {!hasDocuments ? (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-full border border-red-150 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Sube AFORE o IMSS para desbloquear
            </span>
          ) : formIsValid ? (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-150 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4" /> Todos los campos validados
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-150 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Completa campos obligatorios
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-250 text-slate-600 text-xs font-bold rounded-xl transition-colors"
          >
            Regresar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formIsValid || uploadsInProgress}
            className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/10 border border-blue-450 hover:scale-[1.02] active:scale-[0.98] transform transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Registrando..." : "Enviar a Evaluación"}
          </button>
        </div>
      </div>
    </div>
  );
}
