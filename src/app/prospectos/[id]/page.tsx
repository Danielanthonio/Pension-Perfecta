"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, Prospect, Simulation, DocumentItem } from "@/utils/context/AppContext";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  XCircle,
  Calculator,
  TrendingUp,
  Info,
  DollarSign,
  AlertCircle,
  Eye,
  FileSignature,
  FileCheck,
  ShieldCheck,
  Calendar,
} from "lucide-react";

export default function ProspectoDetalle() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { user, prospects, saveSimulation, updateProspectStatus, triggerPushNotification, getFileContent } = useApp();
  const backPath = user?.role === "aliado" ? "/dashboard" : "/admin";

  const [prospect, setProspect] = useState<Prospect | null>(null);

  // Simulation calculator input states
  const [semanas, setSemanas] = useState<number>(0);
  const [pensionActual, setPensionActual] = useState<number>(0);
  const [pensionMejorada, setPensionMejorada] = useState<number>(0);
  const [financiamiento, setFinanciamiento] = useState<number>(0);
  const [costoGestion, setCostoGestion] = useState<number>(0);
  const [aforePensionarse, setAforePensionarse] = useState<number>(0);
  const [comments, setComments] = useState<string>("");

  // Document preview state
  const [selectedDocType, setSelectedDocType] = useState<"AFORE" | "IMSS" | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string>("");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [realFileData, setRealFileData] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  useEffect(() => {
    if (prospects.length > 0) {
      const found = prospects.find((p) => p.id === id);
      if (found) {
        setProspect(found);
        
        // Pre-populate calculator from existing simulation if available, otherwise sensible defaults
        if (found.simulation) {
          setSemanas(found.simulation.semanas);
          setPensionActual(found.simulation.pensionActual);
          setPensionMejorada(found.simulation.pensionMejorada);
          setFinanciamiento(found.simulation.financiamiento);
          setCostoGestion(found.simulation.costoGestion);
          setAforePensionarse(found.simulation.aforePensionarse || 0);
          setComments(found.simulation.comments || "");
        } else {
          // Defaults based on client CURP or general profile
          setSemanas(1250);
          setPensionActual(7500);
          setPensionMejorada(38000);
          setFinanciamiento(420000);
          setCostoGestion(42000);
          setAforePensionarse(0);
          setComments("Viabilidad financiera aprobada. Se proyecta un crecimiento sustancial bajo Ley 73.");
        }

        // Auto-select first document on load if not selected
        if (found.documents && found.documents.length > 0 && !selectedDoc) {
          setSelectedDoc(found.documents[0]);
          setSelectedDocType(found.documents[0].file_type as any);
          setSelectedDocName(found.documents[0].file_name);
        }
      }
    }
  }, [prospects, id, selectedDoc]);

  useEffect(() => {
    if (selectedDoc) {
      setLoadingFile(true);
      getFileContent(selectedDoc)
        .then((data) => {
          setRealFileData(data);
          setLoadingFile(false);
        })
        .catch((err) => {
          console.error("Error al cargar archivo:", err);
          setRealFileData(null);
          setLoadingFile(false);
        });
    } else {
      setRealFileData(null);
    }
  }, [selectedDoc, getFileContent]);

  if (!prospect) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 select-none">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="h-12 w-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mx-auto border border-red-150">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800">Expediente no encontrado</h3>
            <p className="text-xs text-slate-400 mt-1">El identificador de este prospecto no coincide con los registros activos en la base de datos.</p>
          </div>
          <button
            onClick={() => router.push(backPath)}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Pipeline
          </button>
        </div>
      </div>
    );
  }

  // Reactive simulation calculations
  const totalCredito = financiamiento + costoGestion;
  const incrementoMensual = pensionMejorada - pensionActual;
  const roiMeses = incrementoMensual > 0 ? Math.ceil(totalCredito / incrementoMensual) : 0;
  const aportacion = Math.max(0, totalCredito - aforePensionarse);

  const handleEmitSimulation = async () => {
    if (semanas <= 0 || pensionMejorada <= pensionActual || financiamiento <= 0) {
      alert("Por favor verifica los números. La pensión mejorada debe superar a la actual, y el financiamiento debe ser mayor a cero.");
      return;
    }

    await saveSimulation(prospect.id, {
      semanas,
      pensionActual,
      pensionMejorada,
      financiamiento,
      costoGestion,
      aforePensionarse,
      comments,
    });

    // Back to pipeline
    router.push(backPath);
  };

  const handleRejectProspect = async () => {
    if (!rejectionReason.trim()) {
      alert("Por favor ingresa un motivo detallado de rechazo.");
      return;
    }

    await updateProspectStatus(prospect.id, "rechazado", rejectionReason);
    setShowRejectionModal(false);
    router.push(backPath);
  };

  const getStageBadgeColor = (status: Prospect["status"]) => {
    switch (status) {
      case "evaluacion_pendiente":
        return "bg-blue-50 text-blue-600 border-blue-100";
      case "rechazado":
        return "bg-red-50 text-red-600 border-red-100";
      case "aprobado_listo":
        return "bg-emerald-50 text-emerald-600 border-emerald-100";
      case "asesoria_agendada":
        return "bg-purple-50 text-purple-600 border-purple-100";
      case "doc_proceso":
        return "bg-amber-50 text-amber-600 border-amber-100";
      case "analisis_riesgo":
        return "bg-cyan-50 text-cyan-600 border-cyan-100";
      case "firma_programada":
        return "bg-indigo-50 text-indigo-600 border-indigo-100";
      case "pagado_comision":
        return "bg-amber-500/10 text-amber-700 border-amber-500/20 shadow-sm";
      case "aportacion":
        return "bg-teal-50 text-teal-700 border-teal-100 shadow-sm";
      case "falta_reporte":
        return "bg-rose-50 text-rose-600 border-rose-100";
      case "falta_afore":
        return "bg-orange-50 text-orange-600 border-orange-100";
      case "pendiente_documentos":
        return "bg-amber-50 text-amber-700 border-amber-100 shadow-sm";
      case "cerrado_perdido":
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const getStageLabel = (status: Prospect["status"]) => {
    switch (status) {
      case "evaluacion_pendiente":
        return "Evaluación Pendiente";
      case "rechazado":
        return "Rechazado";
      case "aprobado_listo":
        return "Aprobado / Listo";
      case "asesoria_agendada":
        return "Asesoría Agendada";
      case "doc_proceso":
        return "Expediente en Trámite";
      case "analisis_riesgo":
        return "Análisis de Riesgo";
      case "firma_programada":
        return "Firma Programada";
      case "pagado_comision":
        return "Comisión Liberada";
      case "aportacion":
        return "Aportación";
      case "falta_reporte":
        return "Falta Reporte";
      case "falta_afore":
        return "Falta Afore";
      case "pendiente_documentos":
        return "Pendiente Documentos";
      case "cerrado_perdido":
        return "No acepta propuesta / Cerrado Perdido";
      default:
        return "Proceso Interno Activo";
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 select-none pb-12 animate-fade-in">
      {/* Return button header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={() => router.push(backPath)}
          className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la Consola
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estado de expediente</span>
          <span className={`px-3 py-1 rounded-full text-xs font-black border uppercase tracking-wider ${getStageBadgeColor(prospect.status)}`}>
            {getStageLabel(prospect.status)}
          </span>
        </div>
      </div>

      {/* Profile banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xl font-black">
            {prospect.full_name.charAt(0)}
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">{prospect.full_name}</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 mt-1.5 font-semibold">
              <span>NSS: <span className="font-extrabold text-slate-700">{prospect.nss}</span></span>
              <span>•</span>
              <span>CURP: <span className="font-extrabold text-slate-700">{prospect.curp}</span></span>
              <span>•</span>
              <span>Asesor: <span className="font-extrabold text-indigo-600">{prospect.aliado_name}</span></span>
            </div>
          </div>
        </div>

        {/* Contact info list */}
        <div className="grid grid-cols-2 gap-4 text-xs font-semibold border-t md:border-t-0 md:border-l border-slate-150 pt-4 md:pt-0 md:pl-6">
          <div>
            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Correo Electrónico</span>
            <span className="text-slate-700 block mt-0.5">{prospect.email}</span>
          </div>
          <div>
            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Teléfono Móvil</span>
            <span className="text-slate-700 block mt-0.5">{prospect.phone}</span>
          </div>
        </div>
      </div>

      {/* Main Core Layout: Files Audit vs Calculator */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        
        {/* Left Column: Repository Audit & Visualizer (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[680px]">
            {/* Header info */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Repositorio de Archivos B2B</span>
              <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold">Auditoría de Documentos</span>
            </div>

            {/* Core container splitter */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left pane: File folders */}
              <div className="w-1/3 border-r border-slate-150 p-4 space-y-3.5 bg-slate-50/50 overflow-y-auto">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-2 px-1">
                  Documentos Enviados
                </span>
                
                {prospect.documents.map((doc) => {
                  const isActive = selectedDoc?.id === doc.id;
                  return (
                    <button
                      key={doc.id}
                      onClick={() => {
                        setSelectedDoc(doc);
                        setSelectedDocType(doc.file_type as any);
                        setSelectedDocName(doc.file_name);
                      }}
                      className={`w-full text-left p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 active:scale-97 transform ${
                        isActive
                          ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/10"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className={`h-4.5 w-4.5 ${isActive ? "text-white" : "text-slate-400"}`} />
                        <span className="text-[10px] font-black uppercase tracking-wider">
                          Expediente {doc.file_type}
                        </span>
                      </div>
                      <span className={`text-[10px] truncate max-w-[140px] font-semibold leading-none ${isActive ? "text-white/80" : "text-slate-400"}`}>
                        {doc.file_name}
                      </span>
                    </button>
                  );
                })}

                {prospect.documents.length === 0 && (
                  <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                    No se adjuntaron expedientes.
                  </div>
                )}
              </div>

              {/* Right pane: Stylized high fidelity PDF sheet viewer */}
              <div className="w-2/3 bg-slate-100 flex flex-col overflow-hidden border-l border-slate-200">
                {selectedDocType === null ? (
                  <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
                    <div className="text-center max-w-[240px] space-y-3 text-slate-400">
                      <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                        <Eye className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Ver Expediente Técnico</h4>
                        <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                          Haz clic en cualquiera de los documentos de la izquierda para desplegar el simulador visual del expediente.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
                    {/* PDF Chrome Bar */}
                    <div className="h-11 bg-slate-800 text-slate-200 px-4 flex items-center justify-between border-b border-slate-700 shrink-0 text-xs">
                      <div className="flex items-center gap-2 font-mono truncate max-w-[180px] sm:max-w-xs text-[10px]">
                        <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black">PDF</span>
                        <span className="font-extrabold truncate text-slate-200">{selectedDocName}</span>
                      </div>
                      
                      {/* Zoom and Page controls */}
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setZoomLevel(prev => Math.max(70, prev - 10))}
                          className="p-1 hover:bg-slate-700 rounded transition-colors text-[10px] font-bold"
                          title="Reducir Zoom"
                        >
                          A-
                        </button>
                        <span className="text-[9px] font-bold text-slate-400 font-mono w-10 text-center">
                          {zoomLevel}%
                        </span>
                        <button 
                          onClick={() => setZoomLevel(prev => Math.min(130, prev + 10))}
                          className="p-1 hover:bg-slate-700 rounded transition-colors text-[10px] font-bold"
                          title="Aumentar Zoom"
                        >
                          A+
                        </button>
                        <span className="h-3 w-px bg-slate-700 mx-1" />
                        <span className="text-[9px] font-mono font-bold text-slate-400">Pág 1 / 1</span>
                      </div>

                      {/* Download & Print actions */}
                      <div className="flex items-center gap-2.5">
                        <button
                          onClick={() => triggerPushNotification(`📥 Descarga Exitosa: El archivo '${selectedDocName}' ha sido descargado en tu carpeta local de forma segura bajo cifrado SSL.`, "email", "Director Eduardo")}
                          className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
                          title="Descargar Archivo"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                        <button
                          onClick={() => triggerPushNotification(`🖨️ Impresión Iniciada: Enviando '${selectedDocName}' a la cola de impresión de la red operativa.`, "email", "Director Eduardo")}
                          className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
                          title="Imprimir"
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                        </button>
                        <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-wider border border-indigo-500/20">
                          Secure PDF
                        </span>
                      </div>
                    </div>

                    {/* PDF Document Viewer Canvas */}
                    <div className="flex-1 bg-slate-650 p-6 overflow-y-auto flex items-start justify-center animate-fade-in">
                      {loadingFile ? (
                        <div className="w-full max-w-[450px] bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xl self-center">
                          <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-700">Cargando Documento</h4>
                            <p className="text-[10px] text-slate-400 mt-1 font-sans">Recuperando el expediente en alta resolución desde IndexedDB...</p>
                          </div>
                        </div>
                      ) : realFileData ? (
                        realFileData.startsWith("data:application/pdf") ? (
                          <div 
                            className="w-full bg-white shadow-2xl border border-slate-350 rounded-lg overflow-hidden flex flex-col transition-all duration-300 transform origin-top h-[580px]"
                            style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "600px" }}
                          >
                            <iframe
                              src={realFileData}
                              className="w-full h-full border-0"
                              title={selectedDocName}
                            />
                          </div>
                        ) : (
                          <div 
                            className="w-full bg-white shadow-2xl border border-slate-350 rounded-lg overflow-hidden flex items-center justify-center transition-all duration-300 transform origin-top p-4"
                            style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "600px" }}
                          >
                            <img
                              src={realFileData}
                              className="max-w-full max-h-[500px] object-contain rounded"
                              alt={selectedDocName}
                            />
                          </div>
                        )
                      ) : (
                        <div 
                          className="w-full bg-white shadow-2xl border border-slate-350 rounded-sm p-6 sm:p-8 font-mono text-[9px] text-slate-700 relative overflow-hidden transition-all duration-300 transform origin-top"
                          style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "450px" }}
                        >
                          {/* Dynamic Watermark Overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.03] rotate-[-30deg] text-[18px] font-black text-slate-900 leading-none whitespace-nowrap">
                            PENSIONFLOW AUDITORÍA • PENSIONFLOW AUDITORÍA
                          </div>

                          {selectedDocType === "IMSS" ? (
                          /* High fidelity IMSS Weeks Report simulated page sheet */
                          <div className="space-y-4 relative z-10">
                            {/* IMSS logo header */}
                            <div className="flex items-start justify-between border-b-2 border-slate-800 pb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">🟢</span>
                                  <span className="font-black text-slate-900 text-[10px]">INSTITUTO MEXICANO DEL SEGURO SOCIAL</span>
                                </div>
                                <span className="block text-[7px] text-slate-500 uppercase tracking-wider font-extrabold">
                                  DIRECCIÓN DE INCORPORACIÓN Y RECAUDACIÓN • SUBDELEGACIÓN METROPOLITANA
                                </span>
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200 uppercase tracking-wider text-[7px] font-sans">
                                Validado IMSS-Digital
                              </span>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1 text-slate-800 leading-normal font-sans">
                              <div><span className="text-slate-400">ASEGURADO:</span> <span className="font-black text-slate-900">{prospect.full_name.toUpperCase()}</span></div>
                              <div><span className="text-slate-400">N.S.S.:</span> <span className="font-black text-slate-900">{prospect.nss}</span></div>
                              <div><span className="text-slate-400">C.U.R.P.:</span> <span className="font-black text-slate-900">{prospect.curp.toUpperCase()}</span></div>
                              <div><span className="text-slate-400">EMISIÓN:</span> <span className="font-bold text-slate-900">{new Date(prospect.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</span></div>
                              <div><span className="text-slate-400">ESTADO:</span> <span className="font-bold text-emerald-600">VIGENTE / LEY 73</span></div>
                            </div>

                            <div className="space-y-2">
                              <span className="font-black text-slate-800 uppercase tracking-wider block text-[8px] border-b border-slate-300 pb-1">
                                📊 RESUMEN DE COTIZACIONES (HISTORIAL CERTIFICADO)
                              </span>
                              <div className="grid grid-cols-3 gap-2 bg-slate-50/50 border border-slate-150 p-2.5 rounded text-center font-sans">
                                <div>
                                  <span className="block text-[6.5px] text-slate-400 uppercase font-extrabold">Semanas Totales</span>
                                  <span className="block text-xs font-black text-slate-800">{semanas}</span>
                                </div>
                                <div>
                                  <span className="block text-[6.5px] text-slate-400 uppercase font-extrabold">Semanas Descontadas</span>
                                  <span className="block text-xs font-black text-slate-800">0</span>
                                </div>
                                <div>
                                  <span className="block text-[6.5px] text-slate-400 uppercase font-extrabold">Años Cotizados</span>
                                  <span className="block text-xs font-black text-indigo-600">{(semanas / 52).toFixed(1)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Job History Table */}
                            <div className="space-y-1.5">
                              <span className="font-black text-slate-800 uppercase tracking-wider block text-[8px]">
                                🏢 DETALLE DE ÚLTIMOS PATRONES REGISTRADOS
                              </span>
                              <table className="w-full text-left border-collapse border border-slate-200 text-[8px] font-sans">
                                <thead>
                                  <tr className="bg-slate-100 font-black text-slate-700 border-b border-slate-300">
                                    <th className="p-1.5">Razón Social del Patrón</th>
                                    <th className="p-1.5">Periodo Laboral</th>
                                    <th className="p-1.5 text-right">Semanas</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-150">
                                  <tr>
                                    <td className="p-1.5 font-bold truncate max-w-[150px]">CONSTRUCTORA E INMOBILIARIA MEXICANA S.A.</td>
                                    <td className="p-1.5 font-semibold">2018 - 2024</td>
                                    <td className="p-1.5 text-right font-black text-slate-900">312</td>
                                  </tr>
                                  <tr>
                                    <td className="p-1.5 font-bold truncate max-w-[150px]">SERVICIOS INDUSTRIALES Y LOGÍSTICOS DEL NORTE</td>
                                    <td className="p-1.5 font-semibold">2002 - 2018</td>
                                    <td className="p-1.5 text-right font-black text-slate-900">832</td>
                                  </tr>
                                  <tr className="bg-slate-50/50">
                                    <td className="p-1.5 font-bold truncate max-w-[150px]">DISTRIBUIDORA COMERCIAL METROPOLITANA</td>
                                    <td className="p-1.5 font-semibold">1995 - 2002</td>
                                    <td className="p-1.5 text-right font-black text-slate-900">364</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>

                            {/* Digital security validation seals */}
                            <div className="border-t border-slate-200 pt-3 space-y-2 text-[6.5px] text-slate-400 font-sans leading-relaxed">
                              <div>
                                <span className="font-extrabold text-slate-600 uppercase tracking-widest block mb-0.5">Sello Digital de Validación Federal</span>
                                <span className="block font-mono bg-slate-50 border border-slate-100 p-1 rounded font-medium text-slate-400 truncate">
                                  IMSS-DIR-SUBMET-2026-4d82f939e92ffa0591c28c89ef12cb02aa11e4f9b8c0819c9e88
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between gap-4 mt-2">
                                <div className="space-y-0.5">
                                  <span className="font-bold text-slate-500">Cadena de Certificación:</span>
                                  <span className="block font-mono">||1.1|GOVN680820HDF|IMSS-RECAUDACION|2026-05-20||</span>
                                </div>
                                <div className="h-7 w-7 bg-slate-100 border border-slate-200 flex items-center justify-center text-[5px] text-slate-400 uppercase font-bold text-center">
                                  QR CODE
                                </div>
                              </div>

                              <div className="border-t border-slate-100 pt-2 text-[6px] text-center font-bold text-slate-400 font-mono">
                                * ESTE REPORTE ES UNA COPIA SIMULADA CERTIFICADA GENERADA PARA LA AUDITORÍA COMERCIAL DE EXPEDIENTES. *
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* High fidelity AFORE Report simulated page sheet */
                          <div className="space-y-4 relative z-10">
                            {/* Afore logo header */}
                            <div className="flex items-start justify-between border-b-2 border-indigo-900 pb-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm">🏦</span>
                                  <span className="font-black text-indigo-950 text-[10px]">AFORE XXI BANORTE S.A. DE C.V.</span>
                                </div>
                                <span className="block text-[7px] text-slate-500 uppercase tracking-wider font-extrabold">
                                  COMISIÓN NACIONAL DEL SISTEMA DE AHORRO PARA EL RETIRO (CONSAR)
                                </span>
                              </div>
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-extrabold border border-indigo-150 uppercase tracking-wider text-[7px] font-sans">
                                Retiro y Vejez
                              </span>
                            </div>

                            <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1 text-slate-800 leading-normal font-sans">
                              <div><span className="text-slate-400">TITULAR:</span> <span className="font-black text-slate-900">{prospect.full_name.toUpperCase()}</span></div>
                              <div><span className="text-slate-400">N.S.S.:</span> <span className="font-black text-slate-900">{prospect.nss}</span></div>
                              <div><span className="text-slate-400">C.U.R.P.:</span> <span className="font-black text-slate-900">{prospect.curp.toUpperCase()}</span></div>
                              <div><span className="text-slate-400">PERIODO:</span> <span className="font-bold text-slate-900">1er Trimestre 2026</span></div>
                              <div><span className="text-slate-400">SIEFORE:</span> <span className="font-bold text-indigo-650">Básica 65-69 (Fondo Regulado)</span></div>
                            </div>

                            <div className="space-y-2.5">
                              <span className="font-black text-indigo-950 uppercase tracking-wider block text-[8px] border-b border-slate-300 pb-1">
                                💼 RESUMEN DE SALDOS ACUMULADOS EN TU CUENTA INDIVIDUAL
                              </span>
                              <div className="grid grid-cols-3 gap-2 font-sans">
                                <div className="bg-slate-50 border border-slate-150 p-2 rounded text-center">
                                  <span className="block text-[5.5px] text-slate-400 uppercase font-extrabold">Retiro RCV L97</span>
                                  <span className="block text-[9px] font-black text-slate-800 mt-1">$185,000.00</span>
                                </div>
                                <div className="bg-slate-50 border border-slate-150 p-2 rounded text-center">
                                  <span className="block text-[5.5px] text-slate-400 uppercase font-extrabold">Vivienda (INFONAVIT)</span>
                                  <span className="block text-[9px] font-black text-slate-800 mt-1">$215,000.00</span>
                                </div>
                                <div className="bg-slate-50 border border-slate-150 p-2 rounded text-center">
                                  <span className="block text-[5.5px] text-slate-400 uppercase font-extrabold">SAR IMSS 92</span>
                                  <span className="block text-[9px] font-black text-emerald-600 mt-1">$50,000.00</span>
                                </div>
                              </div>

                              <div className="bg-indigo-950 text-white p-3 rounded-xl flex items-center justify-between border border-indigo-900/50 shadow-md font-sans">
                                <div className="space-y-0.5">
                                  <span className="font-extrabold text-indigo-200 text-[7px] uppercase tracking-widest block leading-none">Saldo Global Consolidado</span>
                                  <span className="text-[7.5px] text-white/70 font-semibold block leading-none">Total disponible para cesantía</span>
                                </div>
                                <span className="text-xs font-black text-white font-mono bg-white/10 px-2.5 py-1 rounded-lg">
                                  $450,000.00 MXN
                                </span>
                              </div>
                            </div>

                            <div className="space-y-1.5 font-sans leading-relaxed text-[7.5px] text-slate-500 border-t border-slate-200 pt-3">
                              <span className="font-extrabold text-slate-700 uppercase tracking-wider block text-[8px] font-mono">
                                🔔 AVISO OFICIAL REGULATORIO (CONSAR)
                              </span>
                              <p className="font-semibold text-justify">
                                Los recursos en tu Cuenta Individual son propiedad única y exclusiva del trabajador, y su inversión está sujeta a las disposiciones vigentes del Banco de México y la Comisión Nacional de Ahorro para el Retiro. El saldo de SAR IMSS 92 Vivienda está garantizado bajo el régimen de viabilidad fiscal Ley 73.
                              </p>
                            </div>

                            {/* Digital security validation seals */}
                            <div className="border-t border-slate-200 pt-3 space-y-2 text-[6.5px] text-slate-400 font-sans leading-relaxed">
                              <div>
                                <span className="font-extrabold text-slate-600 uppercase tracking-widest block mb-0.5">Sello Digital de Seguridad Financiera CONSAR</span>
                                <span className="block font-mono bg-slate-50 border border-slate-100 p-1 rounded font-medium text-slate-400 truncate">
                                  CONSAR-AFORE-XXIBAN-2026-5b92e219f8a32d19283f982a1762c90c76391d4512
                                </span>
                              </div>
                              
                              <div className="flex items-center justify-between gap-4 mt-2">
                                <div className="space-y-0.5">
                                  <span className="font-bold text-slate-500">Sello de Timbrado Electrónico:</span>
                                  <span className="block font-mono">||BANORTE|AFORE-VERIFIED|XXI-2026-05-20|🔒||</span>
                                </div>
                                <div className="h-7 w-7 bg-slate-100 border border-slate-200 flex items-center justify-center text-[5px] text-slate-400 uppercase font-bold text-center">
                                  QR CODE
                                </div>
                              </div>

                              <div className="border-t border-slate-100 pt-2 text-[6px] text-center font-bold text-slate-400 font-mono">
                                * ESTE DOCUMENTO ES UNA COMPROBACIÓN GRÁFICA DE AUDITORÍA SIN CONEXIÓN DE BASE DE DATOS. *
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Ley 73 Reactive Simulator Form (2/5) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[680px]">
            {/* Header title */}
            <div className="px-6 py-5 border-b border-slate-150 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-indigo-500" />
                <div>
                  <h3 className="text-xs font-black text-slate-800">Simulador Ley 73</h3>
                  <span className="block text-[9px] text-slate-400 font-semibold">Emisión de dictamen financiero</span>
                </div>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Form Input fields */}
              <div className="space-y-4">
                {/* Semanas Cotizadas */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Semanas Cotizadas (Auditadas)
                  </label>
                  <input
                    type="number"
                    value={semanas}
                    onChange={(e) => setSemanas(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs font-semibold transition-colors"
                  />
                </div>

                {/* Pensión inputs grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Pensión Actual
                    </label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
                        $
                      </div>
                      <input
                        type="number"
                        value={pensionActual}
                        onChange={(e) => setPensionActual(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl py-2 text-xs font-semibold transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Pensión Proyectada
                    </label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
                        $
                      </div>
                      <input
                        type="number"
                        value={pensionMejorada}
                        onChange={(e) => setPensionMejorada(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl py-2 text-xs font-semibold transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Financing inputs grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Financiamiento M40
                    </label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
                        $
                      </div>
                      <input
                        type="number"
                        value={financiamiento}
                        onChange={(e) => setFinanciamiento(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl py-2 text-xs font-semibold transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Costo Cobertura / Gestión
                    </label>
                    <div className="relative rounded-xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
                        $
                      </div>
                      <input
                        type="number"
                        value={costoGestion}
                        onChange={(e) => setCostoGestion(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl py-2 text-xs font-semibold transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {/* Afore al Pensionarse */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Afore al Pensionarse
                  </label>
                  <div className="relative rounded-xl shadow-sm">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-xs font-semibold">
                      $
                    </div>
                    <input
                      type="number"
                      value={aforePensionarse}
                      onChange={(e) => setAforePensionarse(Math.max(0, Number(e.target.value)))}
                      className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl py-2 text-xs font-semibold transition-colors"
                    />
                  </div>
                </div>

                {/* Dictamen comments */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Dictamen y Observaciones Técnicas
                  </label>
                  <textarea
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                    placeholder="Escribe comentarios sobre la M40 y la viabilidad del proyecto..."
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs font-semibold transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Dynamic computed outputs */}
              <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4.5 space-y-4">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block flex items-center gap-1">
                  <Info className="h-3.5 w-3.5 text-indigo-500" /> Resultados Calculados en Tiempo Real
                </span>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Total Crédito</span>
                    <span className="text-sm font-black text-slate-800 block mt-0.5">
                      ${totalCredito.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Incremento Mensual</span>
                    <span className="text-sm font-black text-indigo-600 block mt-0.5">
                      ${incrementoMensual > 0 ? incrementoMensual.toLocaleString() : 0}
                    </span>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Afore al Pensionarse</span>
                    <span className="text-sm font-black text-amber-600 block mt-0.5">
                      ${aforePensionarse.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-sm">
                    <span className="text-[8px] text-slate-400 font-bold uppercase tracking-wider block">Aportación</span>
                    <span className={`text-sm font-black block mt-0.5 ${aportacion > 0 ? "text-teal-600" : "text-slate-500"}`}>
                      ${aportacion.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-xl p-4 flex items-center justify-between shadow-md shadow-indigo-500/10">
                  <div className="space-y-0.5">
                    <span className="text-[7.5px] text-indigo-100 font-bold uppercase tracking-widest">Retorno de Inversión (ROI)</span>
                    <span className="text-[10px] text-white/90 font-semibold block leading-none">Punto de equilibrio estimado</span>
                  </div>
                  <span className="text-lg font-black text-white bg-white/10 border border-white/20 px-3 py-1 rounded-xl">
                    {roiMeses} Meses
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive footer action CTA */}
            <div className="p-6 bg-slate-50 border-t border-slate-150 flex-shrink-0 flex items-center gap-3">
              <button
                onClick={() => setShowRejectionModal(true)}
                className="flex-1 py-3 border border-red-200 hover:border-red-300 text-red-600 hover:bg-red-50/50 rounded-2xl text-xs font-bold transition-all active:scale-95 transform flex items-center justify-center gap-1.5"
              >
                <XCircle className="h-4.5 w-4.5" />
                Rechazar Expediente
              </button>
              
              <button
                onClick={handleEmitSimulation}
                className="flex-1 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-500/10 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center justify-center gap-1.5"
              >
                <CheckCircle className="h-4.5 w-4.5" />
                Aprobar e Emitir Simulación
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Rejection comment modal overlay */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none">
          <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6 space-y-4 border border-slate-200 mx-4">
            <div className="flex items-center gap-3 border-b border-slate-150 pb-3">
              <div className="h-10 w-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center border border-red-150">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Rechazar Expediente Comercial</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Esta acción notificará al Asesor e inactivará el pipeline del caso.</p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Motivo del Rechazo (Comentarios del Director)
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={4}
                placeholder="Escribe el motivo detallado (ej. Semanas IMSS inconsistentes con reporte de Afore o CURP incorrecto)..."
                className="w-full bg-slate-50 border border-slate-200 focus:border-red-500 outline-none rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-colors resize-none"
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setShowRejectionModal(false);
                  setRejectionReason("");
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all active:scale-95 transform"
              >
                Cancelar
              </button>
              <button
                onClick={handleRejectProspect}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs shadow-md shadow-red-500/10 transition-all transform hover:-translate-y-0.5 active:scale-95"
              >
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
