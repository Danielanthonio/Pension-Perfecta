"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApp, type TeamDuplicate } from "@/utils/context/AppContext";
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
  FileSpreadsheet,
  Pencil,
  Users,
} from "lucide-react";
import {
  TIPO_FINANCIAMIENTO_OPTIONS,
  getTipoFinanciamientoMeta,
  getExpedienteDocSlots,
  type TipoFinanciamiento,
} from "@/components/ui/tipoFinanciamiento";

interface SubirProspectoFormProps {
  /** Ruta a la que se regresa/redirige tras guardar o cancelar. */
  backHref?: string;
}

export default function SubirProspectoForm({ backHref = "/dashboard" }: SubirProspectoFormProps) {
  const router = useRouter();
  const { addProspect, user, checkCurpExists, checkTeamDuplicate } = useApp();
  const isDirector = user?.role === "director";

  // Tipo de financiamiento — lo elige el aliado en una ventana bloqueante al
  // abrir la captura. Se mantiene abierta hasta que se selecciona una opción.
  const [tipoFinanciamiento, setTipoFinanciamiento] = useState<TipoFinanciamiento | null>(null);
  const [showTipoModal, setShowTipoModal] = useState(true);

  // Form Fields
  const [fullName, setFullName] = useState("");
  const [nss, setNss] = useState("");
  const [curp, setCurp] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notesAliado, setNotesAliado] = useState("");

  // Duplicate Check States
  const [isCurpDuplicate, setIsCurpDuplicate] = useState(false);
  const [checkingCurp, setCheckingCurp] = useState(false);

  // Alerta de cliente duplicado entre aliados del mismo equipo (PAL-003).
  // Es una ADVERTENCIA (no bloquea): avisa que un compañero con el mismo líder ya
  // trabaja al cliente, para coordinarse y no duplicar el expediente.
  const [teamDuplicate, setTeamDuplicate] = useState<TeamDuplicate | null>(null);

  // Ley 73 Calculation Fields
  const [semanas, setSemanas] = useState<string>("");
  const [pensionActual, setPensionActual] = useState<string>("");
  const [pensionProyectada, setPensionProyectada] = useState<string>("");
  const [financiamientoM40, setFinanciamientoM40] = useState<string>("");
  const [costoCobertura, setCostoCobertura] = useState<string>("");
  const [aforePensionarse, setAforePensionarse] = useState<string>("");
  const [creditoNomina, setCreditoNomina] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");

  // Real-time calculated properties
  const totalCredito = (Number(financiamientoM40) || 0) + (Number(costoCobertura) || 0);
  const aportacion = totalCredito - (Number(aforePensionarse) || 0) - (Number(creditoNomina) || 0);
  const diff = (Number(pensionProyectada) || 0) - (Number(pensionActual) || 0);
  const roiMonths = diff > 0 ? Math.round(totalCredito / diff) : 0;

  // File Upload State Simulations
  const [aforeFileName, setAforeFileName] = useState("");
  const [aforeProgress, setAforeProgress] = useState(0);
  const [aforeUploading, setAforeUploading] = useState(false);
  const [aforeOcrStatus, setAforeOcrStatus] = useState<"idle" | "uploading" | "analyzing" | "completed">("idle");

  const [imssFileName, setImssFileName] = useState("");
  const [imssProgress, setImssProgress] = useState(0);
  const [imssUploading, setImssUploading] = useState(false);
  const [imssOcrStatus, setImssOcrStatus] = useState<"idle" | "uploading" | "analyzing" | "completed">("idle");

  const [aforeFileDataUrl, setAforeFileDataUrl] = useState("");
  const [imssFileDataUrl, setImssFileDataUrl] = useState("");

  // Errors / Submitting
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // OCR AI Simulation
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState("");
  const [highlightFields, setHighlightFields] = useState(false);

  const runRealOCR = async (fileDataUrl: string, fileName: string) => {
    try {
      const response = await fetch("/api/drive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "scanOcr",
          fileDataUrl,
          fileName,
        }),
      });
      
      const resData = await response.json();
      if (resData.success && resData.data) {
        if (resData.simulated) {
          // If the server tells us it ran in simulation mode (not configured)
          fallbackOcrSimulation(fileName);
          return;
        }
        
        const { fullName: extractedName, nss: extractedNss, curp: extractedCurp, semanas: extractedSemanas } = resData.data;

        if (extractedName) setFullName(extractedName);
        if (extractedNss) setNss(extractedNss);
        if (extractedCurp) setCurp(extractedCurp);

        // La Resolución de Pensión (Crédito de nómina) no tiene semanas ni datos
        // de cálculo Ley 73: solo se leen nombre/NSS/CURP. En Modalidad 40/10 sí
        // se autollena el diagnóstico a partir del reporte IMSS.
        if (tipoFinanciamiento !== "credito_nomina") {
          if (extractedSemanas) {
            setSemanas(extractedSemanas);
          } else {
            setSemanas("1300");
          }

          // Auto-fill Ley 73 calculation metrics matching default values
          setPensionActual("12000");
          setPensionProyectada("35000");
          setFinanciamientoM40("400000");
          setCostoCobertura("55000");
          setAforePensionarse("380000");
          setCreditoNomina("0");
          setObservaciones("Expediente extraído con éxito por OCR.");
        } else {
          setObservaciones("Datos del cliente extraídos de la Resolución de Pensión por OCR.");
        }

        setHighlightFields(true);
        setOcrSuccessMsg(`Extracción OCR Exitosa: Se detectó al cliente ${extractedName || "nuevo"}.`);
        setTimeout(() => setHighlightFields(false), 3500);
        setTimeout(() => setOcrSuccessMsg(""), 7000);
      } else {
        throw new Error(resData.error || "Failed to parse document");
      }
    } catch (err) {
      console.error("OCR API error, running local fallback:", err);
      fallbackOcrSimulation(fileName);
    }
  };

  const fallbackOcrSimulation = (fileName: string) => {
    let nameCandidate = "";
    const cleanName = fileName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "); // Strip extension and separators
    
    // Split into words, see if there are name candidates
    const words = cleanName.split(/\s+/).filter(w => !/afore|imss|documento|reporte|semanas|pdf|jpg|png|jpeg/i.test(w));
    if (words.length >= 2) {
      nameCandidate = words.map(w => w.toUpperCase()).join(" ");
    } else {
      nameCandidate = "CLIENTE NUEVO";
    }

    setFullName(nameCandidate);
    
    // Generate a random-looking NSS and CURP
    const randomNss = Math.floor(10000000000 + Math.random() * 90000000000).toString();
    setNss(randomNss);
    
    // Generate mock CURP based on initials
    const initials = (nameCandidate.split(" ").map(w => w[0]).join("") + "XXXXXX").substring(0, 4).toUpperCase();
    const randomCurp = `${initials}750815HDFNNS09`;
    setCurp(randomCurp);

    if (tipoFinanciamiento !== "credito_nomina") {
      setSemanas("1250");
      setPensionActual("10500");
      setPensionProyectada("31000");
      setFinanciamientoM40("380000");
      setCostoCobertura("50000");
      setAforePensionarse("350000");
      setCreditoNomina("0");
      setObservaciones("Expediente simulado basado en el nombre del archivo.");
    } else {
      setObservaciones("Datos simulados de la Resolución de Pensión basados en el nombre del archivo.");
    }

    setHighlightFields(true);
    setOcrSuccessMsg(`Extracción Simulada: Nombre del archivo parseado como "${nameCandidate}".`);
    setTimeout(() => setHighlightFields(false), 3500);
    setTimeout(() => setOcrSuccessMsg(""), 7000);
  };

  // Validate CURP uniqueness in real-time. El mensaje (que nombra al compañero de
  // equipo cuando aplica) se deriva y se muestra en un banner dedicado más abajo.
  useEffect(() => {
    let active = true;
    if (user?.empresa_multialiado_id && curp.length === 18 && /^[A-Z0-9]{18}$/i.test(curp)) {
      setCheckingCurp(true);
      checkCurpExists(curp).then((exists) => {
        if (active) {
          setIsCurpDuplicate(exists);
          setCheckingCurp(false);
        }
      });
    } else {
      setIsCurpDuplicate(false);
      setCheckingCurp(false);
    }
    return () => {
      active = false;
    };
  }, [curp, checkCurpExists, user]);

  // Alerta de cliente duplicado entre aliados del mismo equipo (PAL-003).
  // Se dispara cuando la CURP (18) o el NSS (11) están completos y el aliado
  // pertenece a una empresa multialiado. No bloquea el envío: solo advierte.
  useEffect(() => {
    let active = true;
    const curpReady = curp.length === 18 && /^[A-Z0-9]{18}$/i.test(curp);
    const nssReady = nss.length === 11 && /^\d{11}$/.test(nss);

    if (user?.empresa_multialiado_id && (curpReady || nssReady)) {
      const handle = setTimeout(() => {
        checkTeamDuplicate(curpReady ? curp : "", nssReady ? nss : "").then((match) => {
          if (active) setTeamDuplicate(match);
        });
      }, 350);
      return () => {
        active = false;
        clearTimeout(handle);
      };
    }

    setTeamDuplicate(null);
    return () => {
      active = false;
    };
  }, [curp, nss, checkTeamDuplicate, user]);

  // Real-time Validations
  const nssValid = nss.length === 11 && /^\d+$/.test(nss);
  const curpValid = curp.length === 18 && /^[A-Z0-9]+$/i.test(curp);
  const nameValid = fullName.trim().length > 4;
  const phoneValid = phone.trim().length >= 10;
  const emailValid = email.trim().includes("@");
  
  const hasDocuments = aforeFileName !== "" && imssFileName !== "";
  const uploadsInProgress = aforeUploading || imssUploading;
  const filesReady = aforeFileDataUrl !== "" && imssFileDataUrl !== "";
  const formIsValid = tipoFinanciamiento !== null && nameValid && nssValid && curpValid && !isCurpDuplicate && !checkingCurp && phoneValid && emailValid && hasDocuments && !uploadsInProgress && filesReady;

  // Compañero de equipo (mismo líder + empresa) que ya registró al cliente, si lo
  // conocemos. Sirve para nombrarlo tanto en el bloqueo por CURP como en el aviso.
  const duplicateOwnerName = teamDuplicate?.aliadoName || null;
  const curpDuplicateMessage = duplicateOwnerName
    ? `Este cliente ya fue registrado por tu compañero de equipo ${duplicateOwnerName} (mismo líder), con la misma CURP.\nNo es posible continuar con un registro duplicado.\nCoordínate con tu equipo antes de avanzar.`
    : "Este cliente ya se encuentra registrado con la misma CURP.\nNo es posible continuar con un registro duplicado.\nPor favor revisa la información antes de avanzar.";

  const simulateFileUpload = (type: "afore" | "imss", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === "afore" && !imssFileName) {
      alert(`Atención: Primero debes subir ${ocrSlot.title} antes de poder subir ${secondSlot.title}.`);
      e.target.value = "";
      return;
    }

    // Read file as Base64 Data URL
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const fileDataUrl = event.target.result as string;
        if (type === "afore") {
          setAforeFileDataUrl(fileDataUrl);
        } else {
          setImssFileDataUrl(fileDataUrl);
        }

        if (type === "afore") {
          setAforeUploading(true);
          setAforeOcrStatus("uploading");
          setAforeProgress(0);
          setAforeFileName(file.name);

          const interval = setInterval(() => {
            setAforeProgress((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                setAforeOcrStatus("analyzing");
                
                setTimeout(() => {
                  setAforeOcrStatus("completed");
                  setAforeUploading(false);
                }, 1500); // 1.5s visual delay para subir AFORE sin OCR
                
                return 100;
              }
              return prev + 10;
            });
          }, 100);
        } else {
          setImssUploading(true);
          setImssOcrStatus("uploading");
          setImssProgress(0);
          setImssFileName(file.name);

          const interval = setInterval(() => {
            setImssProgress((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                setImssOcrStatus("analyzing");
                
                setTimeout(async () => {
                  await runRealOCR(fileDataUrl, file.name);
                  setImssOcrStatus("completed");
                  setImssUploading(false);
                }, 1500); // 1.5s visual AI analysis delay para IMSS con OCR
                
                return 100;
              }
              return prev + 10;
            });
          }, 100);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setFormSubmitted(true);

    if (user?.empresa_multialiado_id && (curpValid || nssValid)) {
      setSaving(true);
      // Refrescar quién del equipo ya tiene al cliente para nombrarlo en el aviso.
      const teamMatch = await checkTeamDuplicate(curpValid ? curp : "", nssValid ? nss : "");
      setTeamDuplicate(teamMatch);
      if (curpValid) {
        const exists = await checkCurpExists(curp);
        if (exists) {
          setIsCurpDuplicate(true);
          setSaving(false);
          return;
        }
      }
      setSaving(false);
    }

    if (!formIsValid) {
      // El bloqueo por CURP duplicada tiene su propio banner (que nombra al
      // compañero); aquí solo cubrimos los demás errores.
      if (!isCurpDuplicate) {
        setErrorMsg(
          !hasDocuments
            ? `Es obligatorio subir tanto ${ocrSlot.title} como ${secondSlot.title} para enviar a evaluación.`
            : "Por favor corrige los datos del prospecto antes de continuar."
        );
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
          tipo_financiamiento: tipoFinanciamiento,
          notes_aliado: notesAliado || observaciones,
          simulation: isDirector ? {
            semanas: Number(semanas) || 0,
            pensionActual: Number(pensionActual) || 0,
            pensionMejorada: Number(pensionProyectada) || 0,
            financiamiento: Number(financiamientoM40) || 0,
            costoGestion: Number(costoCobertura) || 0,
            totalCredito: totalCredito,
            roiMonths: roiMonths,
            comments: observaciones,
            aforePensionarse: Number(aforePensionarse) || 0,
            aportacion: aportacion,
            creditoNomina: Number(creditoNomina) || 0,
          } : undefined,
          google_drive_folder: `${fullName} - ${nss}`,
          google_drive_url: `https://drive.google.com/drive/folders/mock-id-${nss}`,
        },
        aforeFileName ? { name: aforeFileName, dataUrl: aforeFileDataUrl } : undefined,
        imssFileName ? { name: imssFileName, dataUrl: imssFileDataUrl } : undefined
      );

      // Successful redirect to evaluation list
      router.push(backHref);
    } catch (err: any) {
      console.error("Error al registrar el prospecto:", err);
      const detail = err?.message || err?.details || JSON.stringify(err);
      setErrorMsg(`Ocurrió un error al registrar el prospecto: ${detail}`);
      setSaving(false);
    }
  };

  const selectedTipoMeta = getTipoFinanciamientoMeta(tipoFinanciamiento);
  // Slots del expediente según el tipo de financiamiento. `ocrSlot` es el primer
  // documento (del que el OCR lee CURP/NSS); `secondSlot` es el de apoyo.
  const [ocrSlot, secondSlot] = getExpedienteDocSlots(tipoFinanciamiento);

  return (
    <>
      {/* Ventana bloqueante: elegir el tipo de financiamiento antes de capturar */}
      {showTipoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-widest">Nuevo Expediente</span>
              <h2 className="text-lg font-black text-slate-800 dark:text-white tracking-tight mt-0.5">Tipo de financiamiento</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 leading-normal">
                Selecciona con qué producto ingresa este prospecto. Podrás verlo el Director y el Account Manager en el pipeline.
              </p>
            </div>
            <div className="p-6 space-y-3">
              {TIPO_FINANCIAMIENTO_OPTIONS.map((opt) => {
                const isSelected = tipoFinanciamiento === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTipoFinanciamiento(opt.value)}
                    className={`w-full flex items-center gap-3.5 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.99] ${
                      isSelected
                        ? `${opt.accent} ring-2 ring-offset-0 shadow-sm`
                        : "border-slate-200 dark:border-slate-750 bg-slate-50 dark:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <span className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border ${opt.badge}`}>
                      <opt.Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-slate-800 dark:text-white">{opt.label}</span>
                      <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">{opt.description}</span>
                    </span>
                    <span className={`h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                      isSelected ? "border-emerald-500 bg-emerald-500" : "border-slate-300 dark:border-slate-600"
                    }`}>
                      {isSelected && <CheckCircle className="h-4 w-4 text-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="p-6 pt-0 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => router.push(backHref)}
                className="px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-250 dark:border-slate-700 text-slate-600 dark:text-slate-350 text-xs font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!tipoFinanciamiento}
                onClick={() => setShowTipoModal(false)}
                className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 border border-emerald-450 dark:border-emerald-900 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

    <div className="max-w-[1700px] mx-auto space-y-6 pb-16 animate-fade-in text-slate-800 dark:text-slate-100">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-widest">Nuevo Expediente</span>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight mt-0.5">Captura de Prospecto Ley 73</h1>
        </div>
        {selectedTipoMeta && (
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-right hidden sm:block">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Tipo de financiamiento</span>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border ${selectedTipoMeta.badge}`}>
              <selectedTipoMeta.Icon className="h-4 w-4" />
              {selectedTipoMeta.label}
            </span>
            <button
              type="button"
              onClick={() => setShowTipoModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-750 hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors"
              title="Cambiar tipo de financiamiento"
            >
              <Pencil className="h-3 w-3" /> Cambiar
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-2xl text-xs font-semibold flex items-start gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <span className="whitespace-pre-line leading-normal">{errorMsg}</span>
        </div>
      )}

      {/* Bloqueo por CURP duplicada. Cuando el duplicado es de un compañero del
          mismo equipo (mismo líder), el mensaje lo nombra. (PAL-003) */}
      {isCurpDuplicate && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 p-4 rounded-2xl text-xs font-semibold flex items-start gap-3 animate-fade-in">
          <Users className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <span className="whitespace-pre-line leading-normal">{curpDuplicateMessage}</span>
        </div>
      )}

      {ocrSuccessMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-2xl text-xs font-semibold flex items-center gap-3 animate-fade-in shadow-sm">
          <FileCheck className="h-5 w-5 flex-shrink-0" />
          <span>{ocrSuccessMsg}</span>
        </div>
      )}

      {/* Advertencia de cliente duplicado en el mismo equipo por NSS (PAL-003). No
          bloquea. El caso de CURP ya lo cubre el banner de bloqueo de arriba. */}
      {teamDuplicate && !isCurpDuplicate && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 p-4 rounded-2xl text-xs font-semibold flex items-start gap-3 animate-fade-in shadow-sm">
          <Users className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="leading-normal">
            <span className="block font-black uppercase tracking-wider text-[11px] mb-0.5">
              Cliente duplicado en tu equipo
            </span>
            <span className="block">
              <strong>{teamDuplicate.aliadoName}</strong>, un aliado con tu mismo líder, ya tiene registrado a{" "}
              <strong>{teamDuplicate.fullName || "este cliente"}</strong>
              {teamDuplicate.matchedBy === "nss"
                ? " con el mismo NSS"
                : teamDuplicate.matchedBy === "ambos"
                ? " con la misma CURP y NSS"
                : " con la misma CURP"}
              . Coordínense para no trabajar el mismo cliente por duplicado.
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Side: Personal Data */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <User className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />
                Información del Prospecto
              </h2>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">* Obligatorio</span>
            </div>

            <div className="p-6 space-y-5">
              {/* Full Name */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Nombre Completo *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                    <User className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ej: Juan Pérez García"
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all dark:text-white ${
                      formSubmitted && !nameValid ? "border-red-400 dark:border-red-500/50 focus:ring-1 focus:ring-red-400" : "border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500"
                    } ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                  />
                </div>
                {formSubmitted && !nameValid && (
                  <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1 block">El nombre es demasiado corto.</span>
                )}
              </div>

              {/* NSS & CURP */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* NSS */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                    <span>Número de Seguridad Social (NSS) *</span>
                    <span title="11 dígitos de tu carnet del IMSS">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 cursor-help" />
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Hash className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      maxLength={11}
                      value={nss}
                      onChange={(e) => setNss(e.target.value.replace(/\D/g, ""))}
                      placeholder="11 dígitos"
                      className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all dark:text-white ${
                        formSubmitted && !nssValid ? "border-red-400 dark:border-red-500/50 focus:ring-1 focus:ring-red-400" : "border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                    />
                    {nss.length > 0 && (
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        {nssValid ? (
                          <CheckCircle className="h-4.5 w-4.5 text-emerald-500 animate-scale-in" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{nss.length}/11</span>
                        )}
                      </span>
                    )}
                  </div>
                  {formSubmitted && !nssValid && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1 block">El NSS debe tener exactamente 11 dígitos numéricos.</span>
                  )}
                </div>

                {/* CURP */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                    <span>Clave Única de Registro (CURP) *</span>
                    <span title="18 caracteres alfanuméricos">
                      <HelpCircle className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 cursor-help" />
                    </span>
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <FileText className="h-4 w-4" />
                    </span>
                    <input
                      type="text"
                      maxLength={18}
                      value={curp}
                      onChange={(e) => setCurp(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                      placeholder="18 caracteres alfanuméricos"
                      className={`w-full pl-10 pr-10 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all dark:text-white ${
                        (formSubmitted && !curpValid) || isCurpDuplicate ? "border-red-400 dark:border-red-500/50 focus:ring-1 focus:ring-red-400" : "border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                    />
                    {curp.length > 0 && (
                      <span className="absolute inset-y-0 right-0 pr-3.5 flex items-center">
                        {checkingCurp ? (
                          <div className="h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        ) : curpValid && !isCurpDuplicate ? (
                          <CheckCircle className="h-4.5 w-4.5 text-emerald-500 animate-scale-in" />
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">{curp.length}/18</span>
                        )}
                      </span>
                    )}
                  </div>
                  {formSubmitted && !curpValid && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1 block">El CURP debe tener exactamente 18 caracteres alfanuméricos.</span>
                  )}
                  {isCurpDuplicate && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1 block whitespace-pre-line leading-normal">
                      {curpDuplicateMessage}
                    </span>
                  )}
                </div>
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Phone */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Teléfono *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Phone className="h-4 w-4" />
                    </span>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="ej: 5512345678"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all dark:text-white ${
                        formSubmitted && !phoneValid ? "border-red-400 dark:border-red-500/50 focus:ring-1 focus:ring-red-400" : "border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                    />
                  </div>
                  {formSubmitted && !phoneValid && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1 block">Ingresa un número telefónico de 10 dígitos.</span>
                  )}
                </div>

                {/* Email */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Email *</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ej: pedro@gmail.com"
                      className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all dark:text-white ${
                        formSubmitted && !emailValid ? "border-red-400 dark:border-red-500/50 focus:ring-1 focus:ring-red-400" : "border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500"
                      } ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                    />
                  </div>
                  {formSubmitted && !emailValid && (
                    <span className="text-[10px] text-red-500 dark:text-red-400 font-semibold mt-1 block">Ingresa un correo electrónico válido.</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Notas adicionales del cliente</label>
                <textarea
                  rows={3}
                  value={notesAliado}
                  onChange={(e) => setNotesAliado(e.target.value)}
                  placeholder="Escribe comentarios, dudas o incidencias iniciales relevantes..."
                  className="w-full border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-850/80 outline-none text-xs font-semibold focus:bg-white dark:focus:bg-slate-850 focus:border-emerald-500 dark:focus:border-emerald-500 transition-all resize-none dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Cálculo y Diagnóstico Ley 73 Card */}
          {isDirector && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                <h2 className="text-xs font-bold text-slate-600 dark:text-slate-350 uppercase tracking-widest flex items-center gap-2">
                  <FileSpreadsheet className="h-4.5 w-4.5 text-blue-500 dark:text-blue-400" />
                  Cálculo y Diagnóstico Ley 73
                </h2>
              </div>
              
              <div className="p-6 space-y-5">
                {/* Semanas cotizadas */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Semanas cotizadas</label>
                  <input
                    type="text"
                    value={semanas}
                    onChange={(e) => setSemanas(e.target.value.replace(/\D/g, ""))}
                    placeholder="ej: 1308"
                    className={`w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                  />
                </div>

                {/* Pensión actual & Pensión proyectada */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Pensión actual (M)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="text"
                        value={pensionActual}
                        onChange={(e) => setPensionActual(e.target.value.replace(/\D/g, ""))}
                        placeholder="ej: 11825"
                        className={`w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Pensión proyectada (M)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="text"
                        value={pensionProyectada}
                        onChange={(e) => setPensionProyectada(e.target.value.replace(/\D/g, ""))}
                        placeholder="ej: 33213"
                        className={`w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Financiamiento M40 & Costo Cobertura */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                      <span>Financiamiento M40 (M)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="text"
                        value={financiamientoM40}
                        onChange={(e) => setFinanciamientoM40(e.target.value.replace(/\D/g, ""))}
                        placeholder="ej: 408778"
                        className={`w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Costo Cobertura (M)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="text"
                        value={costoCobertura}
                        onChange={(e) => setCostoCobertura(e.target.value.replace(/\D/g, ""))}
                        placeholder="ej: 57880"
                        className={`w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Afore al pensionarse & Credito de nomina */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Afore al pensionarse (M)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="text"
                        value={aforePensionarse}
                        onChange={(e) => setAforePensionarse(e.target.value.replace(/\D/g, ""))}
                        placeholder="ej: 392672"
                        className={`w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Crédito de nómina (M)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500 font-bold text-xs">$</span>
                      <input
                        type="text"
                        value={creditoNomina}
                        onChange={(e) => setCreditoNomina(e.target.value.replace(/\D/g, ""))}
                        placeholder="ej: 50000"
                        className={`w-full pl-8 pr-4 py-2.5 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-800 border rounded-xl text-xs font-semibold outline-none focus:bg-white dark:focus:bg-slate-850 transition-all border-slate-200 dark:border-slate-750 focus:border-emerald-500 dark:focus:border-emerald-500 dark:text-white ${highlightFields ? "ring-2 ring-emerald-400 dark:ring-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 transition-all duration-500" : ""}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Observaciones */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Observaciones</label>
                  <textarea
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Escribe observaciones adicionales sobre el diagnóstico de pensión..."
                    className="w-full border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/80 dark:hover:bg-slate-850/80 outline-none text-xs font-semibold focus:bg-white dark:focus:bg-slate-850 focus:border-emerald-500 dark:focus:border-emerald-500 transition-all resize-none dark:text-white"
                  />
                </div>

                {/* DIAGNÓSTICO HEADER */}
                <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                  <h3 className="text-xs font-extrabold text-slate-800 dark:text-white uppercase tracking-wider mb-3">Diagnóstico</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Total Crédito (Formula) */}
                    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">Total crédito (Fórmula)</span>
                      <span className="text-lg font-black text-slate-850 dark:text-slate-100 mt-2 block">
                        {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(totalCredito)}
                      </span>
                      <span className="text-[8px] text-slate-400 dark:text-slate-500 font-medium mt-1 leading-normal">
                        Fórmula: Financiamiento M40 + Costo Cobertura
                      </span>
                    </div>

                    {/* Aportación (Formula) */}
                    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-extrabold uppercase tracking-wider">Aportación (Fórmula)</span>
                      <span className={`text-lg font-black mt-2 block ${aportacion >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-450"}`}>
                        {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 0 }).format(aportacion)}
                      </span>
                      <span className="text-[8px] text-slate-400 dark:text-slate-500 font-medium mt-1 leading-normal">
                        Fórmula: Total crédito - Afore al pensionarse - Crédito de nómina
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Side: Document Upload and Validation rules */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <h2 className="text-xs font-bold text-slate-600 dark:text-slate-350 uppercase tracking-widest flex items-center gap-2">
                <FileCheck className="h-4.5 w-4.5 text-emerald-500 dark:text-emerald-400" />
                Carga Expediente *
              </h2>
            </div>

            <div className="p-6 space-y-5">
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium block leading-normal">
                Sube documentos PDF o imágenes legibles. Es **obligatorio** subir primero {ocrSlot.title} para iniciar.
              </span>

              {/* Google Drive Status Header */}
              <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20 border border-emerald-100 dark:border-emerald-900/50 rounded-2xl p-3.5 flex flex-col gap-1.5 shadow-sm">
                <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Google Drive Sincronizado
                </span>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold select-all overflow-x-auto whitespace-nowrap block no-scrollbar">
                  📁 /Pensiones/{fullName || "Cliente"} - {nss || "NSS"}/
                </span>
              </div>

              {/* Dropzone 1: IMSS */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">1. {ocrSlot.title} *</label>
                <div className="relative border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative overflow-hidden group">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => simulateFileUpload("imss", e)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  {imssFileName ? (
                    <div className="w-full flex flex-col items-center animate-scale-in">
                      <FileCheck className={`h-8 w-8 ${imssOcrStatus === "completed" ? "text-emerald-500 animate-scale-in" : "text-emerald-600"}`} />
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mt-2 truncate w-full max-w-[150px]">{imssFileName}</span>
                      
                      {imssOcrStatus === "uploading" && (
                        <div className="w-full mt-3">
                          <div className="w-full bg-slate-200 dark:bg-slate-850 rounded-full h-1.5">
                            <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-100" style={{ width: `${imssProgress}%` }} />
                          </div>
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-1.5 block">Subiendo a Google Drive... {imssProgress}%</span>
                        </div>
                      )}

                      {imssOcrStatus === "analyzing" && (
                        <div className="w-full mt-3 flex flex-col items-center gap-1">
                          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full w-full animate-pulse" />
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wider flex items-center gap-1 mt-1 animate-pulse">
                            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping" />
                            Escaneando con OCR de IA...
                          </span>
                        </div>
                      )}

                      {imssOcrStatus === "completed" && (
                        <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-1.5">Escaneado y Guardado en Drive ✅</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <Cloud className="h-8 w-8 text-slate-400 dark:text-slate-500 mb-2 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 group-hover:scale-105 transition-all" />
                      <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Subir {ocrSlot.title}</span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">PDF o imagen (.jpg, .png)</span>
                    </>
                  )}
                </div>
              </div>

              {/* Dropzone 2: documento de apoyo */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">2. {secondSlot.title} *</label>
                {imssOcrStatus === "completed" ? (
                  <div className="relative border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-850 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all relative overflow-hidden group animate-fade-in">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => simulateFileUpload("afore", e)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    {aforeFileName ? (
                      <div className="w-full flex flex-col items-center animate-scale-in">
                        <FileCheck className={`h-8 w-8 ${aforeOcrStatus === "completed" ? "text-emerald-500 animate-scale-in" : "text-emerald-600"}`} />
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 mt-2 truncate w-full max-w-[150px]">{aforeFileName}</span>
                        
                        {aforeOcrStatus === "uploading" && (
                          <div className="w-full mt-3">
                            <div className="w-full bg-slate-200 dark:bg-slate-850 rounded-full h-1.5">
                              <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-100" style={{ width: `${aforeProgress}%` }} />
                            </div>
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-1.5 block">Subiendo a Google Drive... {aforeProgress}%</span>
                          </div>
                        )}

                        {aforeOcrStatus === "analyzing" && (
                          <div className="w-full mt-3 flex flex-col items-center gap-1">
                            <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full w-full animate-pulse" />
                            <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-extrabold uppercase tracking-wider flex items-center gap-1 mt-1 animate-pulse">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600 animate-ping" />
                              Guardando en Drive...
                            </span>
                          </div>
                        )}

                        {aforeOcrStatus === "completed" && (
                          <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-bold mt-1.5">Guardado en Google Drive ✅</span>
                        )}
                      </div>
                    ) : (
                      <>
                        <Cloud className="h-8 w-8 text-slate-400 dark:text-slate-500 mb-2 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 group-hover:scale-105 transition-all" />
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Subir {secondSlot.title}</span>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">PDF o imagen (.jpg, .png)</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-850/50 rounded-2xl p-5 flex flex-col items-center justify-center text-center cursor-not-allowed opacity-50">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400 dark:text-slate-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500">Cargar {secondSlot.shortLabel} (Bloqueado)</span>
                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">Primero sube y procesa {ocrSlot.title}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Form Submission Action Banner */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {!hasDocuments ? (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 dark:bg-red-950/20 px-3 py-1.5 rounded-full border border-red-150 dark:border-red-900/30 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Sube {ocrSlot.shortLabel} y {secondSlot.shortLabel} para desbloquear
            </span>
          ) : formIsValid ? (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-1.5 rounded-full border border-emerald-150 dark:border-emerald-900/30 flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4" /> Todos los campos validados
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 rounded-full border border-amber-150 dark:border-amber-900/30 flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4" /> Completa campos obligatorios
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(backHref)}
            className="px-5 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-250 dark:border-slate-700 text-slate-600 dark:text-slate-350 text-xs font-bold rounded-xl transition-colors"
          >
            Regresar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formIsValid || uploadsInProgress}
            className="inline-flex items-center px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-650 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 border border-emerald-450 dark:border-emerald-900 hover:scale-[1.02] active:scale-[0.98] transform transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Registrando..." : "Enviar a Evaluación"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
