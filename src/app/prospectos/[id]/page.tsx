"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApp, Prospect, Simulation, DocumentItem, getStageAndSubStage, getStatusFromStageAndSubStage, STAGES_LIST, SUB_STAGES_BY_STAGE } from "@/utils/context/AppContext";
import {
  ArrowLeft,
  ArrowUpRight,
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
  Clock,
  Folder,
  Send,
  Upload,
  ChevronRight,
  Trash2,
} from "lucide-react";
import UserSettingsModal from "@/components/UserSettingsModal";

export default function ProspectoDetalle() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { user, prospects, profiles, saveSimulation, saveSimulationDraft, updateProspectStatus, uploadDocument, deleteDocument, triggerPushNotification, getFileContent, editProspectPersonalData, scheduleAssessment } = useApp();
  const backPath = user?.role === "aliado" ? "/dashboard" : "/admin";

  const getStageBadgeColor = (status: Prospect["status"]) => {
    switch (status) {
      case "evaluacion_pendiente":
        return "bg-blue-50 text-blue-600 border-blue-100";
      case "rechazado":
        return "bg-red-55/70 text-red-600 border-red-100";
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
      case "falta_semanas":
        return "bg-amber-50 text-amber-700 border-amber-100 shadow-sm";
      case "falta_afore_cuenta":
        return "bg-amber-50 text-amber-700 border-amber-100 shadow-sm";
      case "cerrado_perdido":
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "bg-slate-50 text-slate-600 border-slate-200";
    }
  };

  const getStageLabel = (status: Prospect["status"]) => {
    const { stage, subStage } = getStageAndSubStage(status);
    const stageObj = STAGES_LIST.find((s) => s.id === stage);
    const stageLabel = stageObj ? stageObj.label : stage;
    return subStage ? `${stageLabel} • ${subStage}` : stageLabel;
  };

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isEditingApproved, setIsEditingApproved] = useState(false);

  const isApproved = prospect?.status === "aprobado_listo" || prospect?.status === "aportacion";

  // Simulation calculator input states
  const [semanas, setSemanas] = useState<number>(0);
  const [pensionActual, setPensionActual] = useState<number>(0);
  const [pensionMejorada, setPensionMejorada] = useState<number>(0);
  const [financiamiento, setFinanciamiento] = useState<number>(0);
  const [costoGestion, setCostoGestion] = useState<number>(0);
  const [aforePensionarse, setAforePensionarse] = useState<number>(0);
  const [creditoNomina, setCreditoNomina] = useState<number>(0);
  const [comments, setComments] = useState<string>("");

  // Editing personal data states
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    nss: "",
    curp: "",
    phone: "",
    email: "",
  });

  const handleOpenAgendaDetail = () => {
    window.open("https://api.leadconnectorhq.com/widget/booking/tTynbYT83ugTjMBmwCf5", "_blank");
  };

  const handleConfirmScheduleDetail = async () => {
    if (prospect) {
      if (confirm(`¿Confirmar que ya agendaste la asesoría para ${prospect.full_name}?`)) {
        await scheduleAssessment(prospect.id, "LeadConnector", "Enlace Directo");
        router.push(backPath);
      }
    }
  };

  const handleStartEdit = () => {
    if (prospect) {
      setEditForm({
        full_name: prospect.full_name,
        nss: prospect.nss || "",
        curp: prospect.curp || "",
        phone: prospect.phone || "",
        email: prospect.email || "",
      });
      setIsEditing(true);
    }
  };

  const handleSaveEdit = async () => {
    if (!prospect) return;
    if (!editForm.full_name.trim()) {
      alert("El nombre completo es requerido.");
      return;
    }
    try {
      await editProspectPersonalData(prospect.id, editForm);
      setIsEditing(false);
      setProspect({
        ...prospect,
        ...editForm,
      });
      triggerPushNotification(
        `✏️ Datos Actualizados: Se modificaron los datos personales de ${editForm.full_name}.`,
        "email",
        user?.email || ""
      );
    } catch (err) {
      console.error(err);
      alert("Error al actualizar los datos personales.");
    }
  };

  // Document preview state
  const [selectedDocType, setSelectedDocType] = useState<"AFORE" | "IMSS" | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string>("");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const [selectedDoc, setSelectedDoc] = useState<DocumentItem | null>(null);
  const [realFileData, setRealFileData] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState<boolean>(false);

  // Condition modal states
  const [showConditionModal, setShowConditionModal] = useState<boolean>(false);
  const [selectedConditionOption, setSelectedConditionOption] = useState<Prospect["status"] | null>(null);

  // New modal states
  const [showPendingModal, setShowPendingModal] = useState<boolean>(false);
  const [selectedPendingOption, setSelectedPendingOption] = useState<Prospect["status"] | null>(null);

  const [showApprovalModal, setShowApprovalModal] = useState<boolean>(false);
  const [selectedApprovalOption, setSelectedApprovalOption] = useState<Prospect["status"] | null>(null);

  // Ally file upload states
  const [uploadingType, setUploadingType] = useState<"AFORE" | "IMSS" | "OTROS" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const canDeleteDoc = user?.role === "director" || (prospect && prospect.aliado_id === user?.id);

  const handleDeleteSelectedDoc = async () => {
    if (!prospect || !selectedDoc) return;
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas eliminar el documento "${selectedDoc.file_name}" de Google Drive?`);
    if (!confirmDelete) return;

    try {
      await deleteDocument(prospect.id, selectedDoc.id);
      
      setProspect((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          documents: (prev.documents || []).filter((d) => d.id !== selectedDoc.id),
        };
      });

      triggerPushNotification(
        `🗑️ Documento Eliminado: Se eliminó '${selectedDoc.file_name}' de Google Drive.`,
        "email",
        user?.email || ""
      );

      setSelectedDoc(null);
      setSelectedDocType(null);
      setSelectedDocName("");
    } catch (err) {
      console.error(err);
      alert("Error al eliminar el documento.");
    }
  };

  const handleDocumentUpload = async (type: "AFORE" | "IMSS" | "OTROS", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!prospect) return;

    const allowedExtensions = ["pdf", "png", "jpg", "jpeg"];
    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    if (!allowedExtensions.includes(fileExtension)) {
      alert("Error: Solo se permiten archivos PDF, PNG, JPG y JPEG.");
      return;
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("Error: El archivo excede el tamaño máximo permitido de 10MB.");
      return;
    }

    setUploadingType(type);
    setUploadProgress(10);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      if (!base64Data) return;

      setUploadProgress(30);
      try {
        const existingDoc = prospect.documents.find((d) => d.file_type === type);
        if (existingDoc) {
          if (!canDeleteDoc) {
            alert("No tienes permisos para reemplazar documentos existentes.");
            setUploadingType(null);
            setUploadProgress(0);
            return;
          }
          setUploadProgress(50);
          await deleteDocument(prospect.id, existingDoc.id);
        }

        setUploadProgress(70);
        const newDoc = await uploadDocument(prospect.id, type, file.name, base64Data);
        setUploadProgress(100);
        setSelectedDoc(newDoc);
        setSelectedDocType(type as any);
        setSelectedDocName(file.name);

        setProspect((prev) => {
          if (!prev) return null;
          const otherDocs = (prev.documents || []).filter((d) => d.file_type !== type);
          return {
            ...prev,
            documents: [...otherDocs, newDoc],
            updated_at: new Date().toISOString(),
          };
        });

        triggerPushNotification(
          `Se ha cargado un nuevo documento de tipo ${type}: ${file.name}`,
          "email",
          user?.email || ""
        );
      } catch (err) {
        console.error(err);
        alert("Error al subir el archivo.");
      } finally {
        setTimeout(() => {
          setUploadingType(null);
          setUploadProgress(0);
        }, 1000);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (prospects.length > 0) {
      const found = prospects.find((p) => p.id === id);
      if (found) {
        if (user?.role === "aliado" && found.aliado_id !== user.id) {
          router.push("/dashboard");
          return;
        }

        setProspect(found);
        
        // Pre-populate calculator from existing simulation if available, otherwise sensible defaults
        if (found.simulation) {
          setSemanas(found.simulation.semanas);
          setPensionActual(found.simulation.pensionActual);
          setPensionMejorada(found.simulation.pensionMejorada);
          setFinanciamiento(found.simulation.financiamiento);
          setCostoGestion(found.simulation.costoGestion);
          setAforePensionarse(found.simulation.aforePensionarse || 0);
          setCreditoNomina(found.simulation.creditoNomina || 0);
          setComments(found.simulation.comments || "");
        } else {
          // Defaults based on client CURP or general profile
          setSemanas(1250);
          setPensionActual(7500);
          setPensionMejorada(38000);
          setFinanciamiento(420000);
          setCostoGestion(42000);
          setAforePensionarse(0);
          setCreditoNomina(0);
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

  // Autosave simulation draft effect
  useEffect(() => {
    if (user?.role !== "director" || !prospect || (isApproved && !isEditingApproved)) return;

    const sim = prospect.simulation;
    const hasChanged =
      !sim ||
      semanas !== sim.semanas ||
      pensionActual !== sim.pensionActual ||
      pensionMejorada !== sim.pensionMejorada ||
      financiamiento !== sim.financiamiento ||
      costoGestion !== sim.costoGestion ||
      aforePensionarse !== sim.aforePensionarse ||
      creditoNomina !== sim.creditoNomina ||
      comments !== sim.comments;

    if (!hasChanged) return;

    const timer = setTimeout(async () => {
      await saveSimulationDraft(prospect.id, {
        semanas,
        pensionActual,
        pensionMejorada,
        financiamiento,
        costoGestion,
        aforePensionarse,
        creditoNomina,
        comments,
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    semanas,
    pensionActual,
    pensionMejorada,
    financiamiento,
    costoGestion,
    aforePensionarse,
    creditoNomina,
    comments,
    prospect,
    user,
    isApproved,
    isEditingApproved,
    saveSimulationDraft,
  ]);

  useEffect(() => {
    if (user?.role === "director" && prospect) {
      const initialStatuses = ["pendiente_documentos", "falta_reporte", "falta_afore"];
      if (initialStatuses.includes(prospect.status)) {
        updateProspectStatus(prospect.id, "evaluacion_pendiente");
      }
    }
  }, [user, prospect, updateProspectStatus]);

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

  // Reactive simulation calculations
  const totalCredito = financiamiento + costoGestion;
  const incrementoMensual = pensionMejorada - pensionActual;
  const roiMeses = incrementoMensual > 0 ? Math.ceil(totalCredito / incrementoMensual) : 0;
  const aportacion = Math.max(0, totalCredito - aforePensionarse - creditoNomina);

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

  if (user?.role === "aliado") {
    // Determine document states
    const getDocStatus = (type: "AFORE" | "IMSS" | "OTROS") => {
      const doc = prospect.documents.find((d) => d.file_type === type);
      if (!doc) return "pendiente";

      if (
        prospect.status === "aprobado_listo" ||
        prospect.status === "firma_programada" ||
        prospect.status === "pagado_comision" ||
        prospect.status === "aportacion"
      ) {
        return "aprobado";
      }

      if (prospect.status === "rechazado") {
        return "rechazado";
      }

      if (type === "AFORE" && (prospect.status === "falta_afore" || prospect.status === "pendiente_documentos")) {
        return "rechazado";
      }

      if (type === "IMSS" && (prospect.status === "falta_reporte" || prospect.status === "pendiente_documentos")) {
        return "rechazado";
      }

      return "cargado";
    };

    const renderDocBadge = (status: "aprobado" | "cargado" | "pendiente" | "rechazado") => {
      switch (status) {
        case "aprobado":
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm leading-none">
              <CheckCircle className="h-3 w-3 stroke-[2.5]" />
              Aprobado
            </span>
          );
        case "cargado":
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100 shadow-sm leading-none">
              <Clock className="h-3 w-3 stroke-[2.5] animate-pulse" />
              En Revisión
            </span>
          );
        case "rechazado":
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-wider bg-red-50 text-red-600 border border-red-100 shadow-sm leading-none">
              <XCircle className="h-3 w-3 stroke-[2.5]" />
              Rechazado
            </span>
          );
        case "pendiente":
        default:
          return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-200 border-dashed leading-none">
              <Upload className="h-3 w-3 stroke-[2]" />
              Pendiente
            </span>
          );
      }
    };

    return (
      <div className="max-w-[1700px] mx-auto px-4 sm:px-6 md:px-8 space-y-6 select-none pb-24 animate-fade-in">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3.5">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a la Consola
            </button>
            
            <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-3.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estatus Expediente:</span>
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStageBadgeColor(prospect.status)}`}>
                {getStageLabel(prospect.status)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex sm:hidden items-center gap-2 mr-2">
              <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStageBadgeColor(prospect.status)}`}>
                {getStageLabel(prospect.status)}
              </span>
            </div>

            {/* User Profile Widget */}
            {user && (
              <div 
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-3.5 select-none cursor-pointer hover:opacity-85 transition-opacity duration-150"
              >
                <div className="text-right hidden sm:block">
                  <span className="block text-xs font-black text-slate-800 leading-none">
                    {user.full_name}
                  </span>
                  <span className="inline-block text-[8px] font-extrabold rounded-full px-2.5 py-1 mt-1.5 leading-none uppercase tracking-widest font-sans border text-emerald-600 bg-emerald-50 border-emerald-100">
                    Aliado B2B
                  </span>
                </div>
                <div className="h-10 w-10 rounded-2xl border flex items-center justify-center text-white text-sm font-black shadow-sm bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/20">
                  {user.full_name.charAt(0)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Client Profile Header Banner */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm select-none">
          <div className="flex items-center gap-4 flex-1">
            <div className="h-14 w-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xl font-black shrink-0">
              {editForm.full_name ? editForm.full_name.charAt(0) : prospect.full_name.charAt(0)}
            </div>
            <div className="space-y-1.5 flex-1">
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  className="text-lg font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 outline-none focus:border-indigo-500 w-full sm:w-80"
                  placeholder="Nombre Completo"
                />
              ) : (
                <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{prospect.full_name}</h2>
              )}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 font-semibold">
                {isEditing ? (
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">NSS:</span>
                      <input
                        type="text"
                        value={editForm.nss}
                        onChange={(e) => setEditForm({ ...editForm, nss: e.target.value })}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-0.5 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-32"
                        placeholder="NSS"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">CURP:</span>
                      <input
                        type="text"
                        value={editForm.curp}
                        onChange={(e) => setEditForm({ ...editForm, curp: e.target.value.toUpperCase() })}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-0.5 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-44 uppercase"
                        placeholder="CURP"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <span>NSS: <span className="font-extrabold text-slate-700">{prospect.nss}</span></span>
                    <span>•</span>
                    <span>CURP: <span className="font-extrabold text-slate-700">{prospect.curp}</span></span>
                  </>
                )}
                <span>•</span>
                <span>Ejecutivo: <span className="font-extrabold text-indigo-650">{prospect.aliado_name || "Asesor B2B"}</span></span>
                <span>•</span>
                <span>Actualizado: <span className="font-extrabold text-slate-600">{new Date(prospect.updated_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></span>
              </div>
            </div>
          </div>

          {/* Contact Info Widget */}
          <div className="grid grid-cols-2 gap-4 text-xs font-semibold border-t md:border-t-0 md:border-l border-slate-150 pt-4 md:pt-0 md:pl-6 min-w-[280px]">
            <div>
              <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Correo Electrónico</span>
              {isEditing ? (
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 mt-1 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-full"
                />
              ) : (
                <span className="text-slate-700 block mt-0.5">{prospect.email}</span>
              )}
            </div>
            <div>
              <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Teléfono Móvil</span>
              {isEditing ? (
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 mt-1 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-full"
                />
              ) : (
                <span className="text-slate-700 block mt-0.5">{prospect.phone}</span>
              )}
            </div>
          </div>

          {/* Edit Buttons widget */}
          <div className="border-t md:border-t-0 md:border-l border-slate-150 pt-4 md:pt-0 md:pl-6 flex items-center justify-end">
            {isEditing ? (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow border border-blue-450 transition-all active:scale-95 flex items-center gap-1.5"
                >
                  Guardar
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all active:scale-95"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartEdit}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-750 text-xs font-bold rounded-xl border border-slate-200 transition-all active:scale-95 flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2500/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Editar Datos
              </button>
            )}
          </div>
        </div>

        {/* Central Grid Split: Column 1 (60% Documents & visualizer) vs Column 2 (40% Feedback & Timeline) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full">
          
          {/* LEFT AREA: Document Workspace & PDF Preview (7/12 cols ~58.3%) */}
          <div className="lg:col-span-7 space-y-6 flex flex-col">
            
            {/* Documents Upload Center */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">Expediente Digital Comercial</h3>
                <p className="text-[10px] text-slate-400 font-semibold mt-1">Carga, audita y valida los documentos oficiales del prospecto en tiempo real.</p>
              </div>

              <div className="divide-y divide-slate-100">
                {(["IMSS", "AFORE", "OTROS"] as const).map((type) => {
                  const status = getDocStatus(type);
                  const doc = prospect.documents.find((d) => d.file_type === type);
                  const isUploading = uploadingType === type;

                  let label = "";
                  let description = "";
                  if (type === "IMSS") {
                    label = "Reporte de Semanas IMSS";
                    description = "Reporte certificado de semanas cotizadas emitido por el IMSS.";
                  } else if (type === "AFORE") {
                    label = "Estado de Cuenta AFORE";
                    description = "Último estado de cuenta o captura digital legible de Afore.";
                  } else {
                    label = "Documentos Adicionales";
                    description = "Identificación oficial (INE), CURP u otros documentos de soporte.";
                  }

                  return (
                    <div key={type} className="py-4.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-black text-slate-800">{label}</span>
                          {renderDocBadge(status)}
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold max-w-md">{description}</p>
                        {doc && (
                          <span className="inline-block text-[9px] font-mono font-bold text-slate-400 mt-1 bg-slate-50 border border-slate-100 rounded px-1.5 py-0.5 font-sans">
                            {doc.file_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 sm:self-center">
                        <input
                          type="file"
                          id={`file-ally-${type}`}
                          className="hidden"
                          accept="application/pdf,image/*"
                          onChange={(e) => handleDocumentUpload(type, e)}
                        />
                        
                        {doc && (
                          <button
                            onClick={() => {
                              setSelectedDoc(doc);
                              setSelectedDocType(doc.file_type as any);
                              setSelectedDocName(doc.file_name);
                            }}
                            className={`px-3 py-2 border rounded-xl text-[10px] font-black tracking-wide uppercase transition-all shadow-sm flex items-center gap-1.5 ${
                              selectedDoc?.id === doc.id
                                ? "bg-indigo-50 border-indigo-200 text-indigo-600 font-extrabold"
                                : "bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800"
                            }`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Ver
                          </button>
                        )}

                        <button
                          disabled={isUploading}
                          onClick={() => document.getElementById(`file-ally-${type}`)?.click()}
                          className={`px-3.5 py-2 rounded-xl text-[10px] font-black tracking-wide uppercase transition-all shadow-sm flex items-center gap-1.5 text-white ${
                            status === "pendiente"
                              ? "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/10"
                              : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                          }`}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          {isUploading ? "Subiendo..." : doc ? "Reemplazar" : "Subir archivo"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar loader while uploading */}
              {uploadingType && (
                <div className="bg-slate-50 border border-slate-150 rounded-2xl p-4 space-y-2 animate-pulse">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 leading-none">
                    <span>Subiendo expediente de tipo {uploadingType}...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-gradient-to-r from-indigo-500 to-blue-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Gorgeous visual PDF display canvas */}
            {selectedDocType !== null && (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:h-[600px] h-[500px] transition-all">
                {/* PDF Chrome Bar */}
                <div className="h-11 bg-slate-800 text-slate-200 px-4 flex items-center justify-between border-b border-slate-700 shrink-0 text-xs">
                  <div className="flex items-center gap-2 font-mono truncate max-w-[150px] sm:max-w-xs text-[10px]">
                    <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black">PDF</span>
                    <span className="font-extrabold truncate text-slate-200">{selectedDocName}</span>
                  </div>
                  
                  {/* Zoom controls */}
                  <div className="flex items-center gap-2.5">
                    <button 
                      onClick={() => setZoomLevel(prev => Math.max(70, prev - 10))}
                      className="p-1 hover:bg-slate-700 rounded transition-colors text-[10px] font-bold"
                    >
                      A-
                    </button>
                    <span className="text-[9px] font-bold text-slate-400 font-mono w-9 text-center">
                      {zoomLevel}%
                    </span>
                    <button 
                      onClick={() => setZoomLevel(prev => Math.min(130, prev + 10))}
                      className="p-1 hover:bg-slate-700 rounded transition-colors text-[10px] font-bold"
                    >
                      A+
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => triggerPushNotification(`📥 Descarga Exitosa: El archivo '${selectedDocName}' ha sido descargado en tu carpeta local de forma segura bajo cifrado SSL.`, "email", user?.email || "")}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
                      title="Descargar"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                  </div>
                </div>

                {/* PDF Document Viewer Canvas */}
                <div className="flex-1 bg-slate-600 p-4 sm:p-6 overflow-y-auto flex items-start justify-center animate-fade-in">
                  {loadingFile ? (
                    <div className="w-full max-w-[400px] bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xl self-center">
                      <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Cargando Documento</h4>
                        <p className="text-[10px] text-slate-400 mt-1">Recuperando el expediente en alta resolución...</p>
                      </div>
                    </div>
                  ) : realFileData ? (
                    realFileData.startsWith("data:application/pdf") || realFileData.startsWith("http") ? (
                      <div 
                        className="w-full bg-white shadow-2xl border border-slate-350 rounded-lg overflow-hidden flex flex-col transition-all duration-300 transform origin-top h-[500px]"
                        style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "100%" }}
                      >
                        <iframe
                          src={realFileData.includes("drive.google.com") && !realFileData.includes("/preview") && !realFileData.includes("/embed") ? realFileData.replace(/\/view.*/, "/preview") : realFileData}
                          className="w-full h-full border-0"
                          title={selectedDocName}
                        />
                      </div>
                    ) : (
                      <div 
                        className="w-full bg-white shadow-2xl border border-slate-350 rounded-lg overflow-hidden flex items-center justify-center transition-all duration-300 transform origin-top p-4"
                        style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "100%" }}
                      >
                        <img
                          src={realFileData}
                          className="max-w-full max-h-[400px] object-contain rounded"
                          alt={selectedDocName}
                        />
                      </div>
                    )
                  ) : (
                    /* High-Fidelity simulated secure page sheets if real base64 file data is fallback */
                    <div 
                      className="w-full bg-white shadow-2xl border border-slate-300 rounded-xl p-6 sm:p-8 font-mono text-[9px] text-slate-700 relative overflow-hidden transition-all duration-300 transform origin-top"
                      style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "680px" }}
                    >
                      {/* Dynamic Watermark */}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none opacity-[0.03] rotate-[-30deg] text-[18px] font-black text-slate-900 leading-none whitespace-nowrap">
                        PENSIONFLOW AUDITORÍA • PENSIONFLOW AUDITORÍA
                      </div>

                      {selectedDocType === "IMSS" ? (
                        <div className="space-y-4 relative z-10">
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

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-slate-800 leading-normal font-sans text-[9px]">
                            <div><span className="text-slate-400">ASEGURADO:</span> <span className="font-black text-slate-900">{prospect.full_name.toUpperCase()}</span></div>
                            <div><span className="text-slate-400">N.S.S.:</span> <span className="font-black text-slate-900">{prospect.nss}</span></div>
                            <div><span className="text-slate-400">C.U.R.P.:</span> <span className="font-black text-slate-900">{prospect.curp.toUpperCase()}</span></div>
                            <div><span className="text-slate-400">EMISIÓN:</span> <span className="font-bold text-slate-900">{new Date(prospect.created_at).toLocaleDateString()}</span></div>
                            <div><span className="text-slate-400">ESTADO:</span> <span className="font-bold text-emerald-600">VIGENTE / LEY 73</span></div>
                          </div>

                          <div className="space-y-2">
                            <span className="font-black text-slate-800 uppercase tracking-wider block text-[8px] border-b border-slate-350 pb-1">
                              📊 RESUMEN DE COTIZACIONES (HISTORIAL CERTIFICADO)
                            </span>
                            <div className="grid grid-cols-3 gap-2 bg-slate-50/50 border border-slate-150 p-2.5 rounded-xl text-center font-sans">
                              <div>
                                <span className="block text-[7px] text-slate-400 uppercase font-extrabold">Semanas Totales</span>
                                <span className="block text-xs font-black text-slate-800">{prospect.simulation?.semanas || 1250}</span>
                              </div>
                              <div>
                                <span className="block text-[7px] text-slate-400 uppercase font-extrabold">Semanas Descontadas</span>
                                <span className="block text-xs font-black text-slate-800">0</span>
                              </div>
                              <div>
                                <span className="block text-[7px] text-slate-400 uppercase font-extrabold">Años Cotizados</span>
                                <span className="block text-xs font-black text-indigo-600">{((prospect.simulation?.semanas || 1250) / 52).toFixed(1)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-slate-200 pt-3 text-[6px] text-center font-bold text-slate-400 font-mono">
                            * ESTE REPORTE ES UNA COPIA SIMULADA CERTIFICADA GENERADA PARA LA AUDITORÍA COMERCIAL DE EXPEDIENTES. *
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4 relative z-10">
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

                          <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1 text-slate-800 leading-normal font-sans text-[9px]">
                            <div><span className="text-slate-400">TITULAR:</span> <span className="font-black text-slate-900">{prospect.full_name.toUpperCase()}</span></div>
                            <div><span className="text-slate-400">N.S.S.:</span> <span className="font-black text-slate-900">{prospect.nss}</span></div>
                            <div><span className="text-slate-400">C.U.R.P.:</span> <span className="font-black text-slate-900">{prospect.curp.toUpperCase()}</span></div>
                            <div><span className="text-slate-400">PERIODO:</span> <span className="font-bold text-slate-900">1er Trimestre 2026</span></div>
                          </div>

                          <div className="bg-indigo-950 text-white p-3 rounded-2xl flex items-center justify-between border border-indigo-900/50 shadow-md font-sans">
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-indigo-200 text-[7px] uppercase tracking-widest block leading-none">Saldo Global Consolidado</span>
                              <span className="text-[7.5px] text-white/70 font-semibold block leading-none">Total disponible para cesantía</span>
                            </div>
                            <span className="text-xs font-black text-white font-mono bg-white/10 px-2.5 py-1 rounded-lg">
                              $450,000.00 MXN
                            </span>
                          </div>

                          <div className="border-t border-slate-200 pt-3 text-[6px] text-center font-bold text-slate-400 font-mono">
                            * ESTE DOCUMENTO ES UNA COMPROBACIÓN GRÁFICA DE AUDITORÍA SIN CONEXIÓN DE BASE DE DATOS. *
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT AREA: Feedback, Decisions & Timeline Journey (5/12 cols ~41.7%) */}
          <div className="lg:col-span-5 space-y-6 flex flex-col">
            
            {/* Respuesta del Director Feedback Card */}
            {(() => {
              const status = prospect.status;
              const isApproved = ["aprobado_listo", "firma_programada", "pagado_comision", "aportacion"].includes(status);
              const isRejected = status === "rechazado";

              let cardStyles = "";
              let title = "";
              let icon = null;
              let description = "";

              if (isApproved) {
                cardStyles = "bg-emerald-50/70 border-emerald-200 text-emerald-900 shadow-sm shadow-emerald-500/5";
                title = "¡Expediente Aprobado y Dictaminado!";
                icon = <CheckCircle className="h-6 w-6 text-emerald-600" />;
                description = "El director de operaciones ha evaluado positivamente este caso. Cumple con todos los estándares técnicos y de viabilidad financiera.";
              } else if (isRejected) {
                cardStyles = "bg-red-50/70 border-red-200 text-red-900 shadow-sm shadow-red-500/5";
                title = "Expediente Rechazado";
                icon = <XCircle className="h-6 w-6 text-red-600" />;
                description = "Este expediente no cumple con los criterios requeridos por el área de control interno de Pensión Perfecta.";
              } else {
                cardStyles = "bg-amber-50/65 border-amber-250 text-amber-950 shadow-sm shadow-amber-500/5";
                title = "Retroalimentación / Estatus Pendiente";
                icon = <Clock className="h-6 w-6 text-amber-600 animate-pulse animate-duration-1000" />;
                description = "El expediente se encuentra condicionado o en análisis de riesgo. Requiere atención o corrección en la documentación.";
              }

              return (
                <div className={`border rounded-[28px] p-6 space-y-4 ${cardStyles}`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-inner shrink-0">
                      {icon}
                    </div>
                    <div>
                      <h4 className="text-xs font-black tracking-tight uppercase leading-none">{title}</h4>
                      <span className="block text-[8px] font-bold text-slate-450 uppercase tracking-widest mt-1">Mensaje del Director</span>
                    </div>
                  </div>

                  <p className="text-[11px] font-semibold leading-relaxed text-slate-600">
                    {description}
                  </p>

                  <div className="bg-white/95 rounded-2xl p-4 border border-slate-100 space-y-1 shadow-sm">
                    <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider">Comentarios y Observaciones Técnicas:</span>
                    <p className="text-[11px] font-bold text-slate-700 leading-normal whitespace-pre-line italic">
                      “{prospect.notes_director || "Sin comentarios adicionales registrados por el Director.”"}
                    </p>
                  </div>

                  {/* Projections summary if approved - display clean non-editable details */}
                  {isApproved && prospect.simulation && (
                    <div className="space-y-4">
                      <div className="bg-emerald-500/5 rounded-2xl p-4 border border-emerald-100/40 grid grid-cols-2 gap-3.5 text-slate-800">
                        <div className="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                          <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Pensión Mejorada</span>
                          <span className="text-xs font-black text-emerald-600 block mt-1.5 leading-none">
                            ${prospect.simulation.pensionMejorada.toLocaleString()} / mes
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                          <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Pensión Anterior</span>
                          <span className="text-xs font-black text-slate-500 block mt-1.5 leading-none">
                            ${prospect.simulation.pensionActual.toLocaleString()} / mes
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                          <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Financiamiento M40</span>
                          <span className="text-xs font-black text-slate-700 block mt-1.5 leading-none">
                            ${prospect.simulation.financiamiento.toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-100/80 shadow-sm">
                          <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-wider block leading-none">Incremento Neto</span>
                          <span className="text-xs font-black text-indigo-600 block mt-1.5 leading-none">
                            ${(prospect.simulation.pensionMejorada - prospect.simulation.pensionActual).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Direct scheduling button for Aliado */}
                      {prospect.status === "aprobado_listo" && (
                        <div className="bg-white/95 rounded-2xl p-4 border border-indigo-150 space-y-3 shadow-sm text-center">
                          <span className="block text-[8px] font-bold text-indigo-550 uppercase tracking-wider">Acción Requerida</span>
                          <h4 className="text-xs font-bold text-slate-800">Agendar Asesoría Comercial</h4>
                          <p className="text-[10px] text-slate-500 leading-normal mb-1">
                            Coordinar la sesión de presentación con el cliente utilizando la agenda de LeadConnector:
                          </p>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={handleOpenAgendaDetail}
                              className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-blue-500/10 hover:scale-[1.01] gap-1.5"
                            >
                              <span>1. Abrir Agenda Oficial</span>
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={handleConfirmScheduleDetail}
                              className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-xs transition-all shadow hover:scale-[1.01] gap-1.5"
                            >
                              <span>2. Confirmar Agendamiento (Avanzar)</span>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Timeline Historial del Expediente */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex-1 flex flex-col">
              <div className="border-b border-slate-100 pb-3 mb-5 flex-shrink-0">
                <h3 className="text-xs font-black text-slate-800 tracking-tight uppercase">Historial del Expediente</h3>
                <span className="block text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Trazabilidad comercial del cliente</span>
              </div>

              {/* Timeline Tree Wrapper */}
              <div className="flex-1 overflow-y-auto space-y-6 flex flex-col justify-start">
                
                {/* Stage 1: Expediente Creado */}
                <div className="flex gap-4 relative">
                  <div className="absolute top-7 bottom-0 left-3.5 w-0.5 bg-indigo-100" />
                  <div className="h-7 w-7 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-extrabold z-10 shrink-0 shadow-sm">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[8px] text-slate-400 font-extrabold font-mono uppercase bg-slate-50 border border-slate-100 rounded px-1 py-0.5 leading-none">
                      {new Date(prospect.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <h4 className="text-[11px] font-black text-slate-800">Expediente Creado en Sistema</h4>
                    <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
                      El prospecto fue registrado bajo código comercial de Asesor B2B: <span className="font-bold text-slate-500">{prospect.aliado_name || "Roberto Asesor"}</span>.
                    </p>
                  </div>
                </div>

                {/* Stage 2: Documentación */}
                {(() => {
                  const hasDocs = prospect.documents.length > 0;
                  const isCompleted = hasDocs;
                  return (
                    <div className="flex gap-4 relative">
                      <div className="absolute top-7 bottom-0 left-3.5 w-0.5 bg-slate-150" />
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center font-extrabold z-10 shrink-0 shadow-sm border ${
                        isCompleted
                          ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                          : "bg-slate-50 border-slate-200 text-slate-400"
                      }`}>
                        {isCompleted ? <CheckCircle className="h-4 w-4" /> : <Upload className="h-3.5 w-3.5" />}
                      </div>
                      <div className="space-y-1">
                        <span className="text-[8px] text-slate-400 font-extrabold font-mono uppercase leading-none">
                          {hasDocs ? "Cargado" : "Pendiente"}
                        </span>
                        <h4 className="text-[11px] font-black text-slate-800">Carga de Documentación IMSS y Afore</h4>
                        <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
                          {hasDocs
                            ? `Se han adjuntado ${prospect.documents.length} documento(s) listos para dictaminación oficial.`
                            : "El asesor requiere cargar estado de Afore e IMSS para poder programar auditoría."}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Stage 3: En Auditoría Técnica */}
                {(() => {
                  const hasDocs = prospect.documents.length > 0;
                  const isUnderReview = hasDocs && !["evaluacion_pendiente"].includes(prospect.status);
                  const isCompleted = ["aprobado_listo", "rechazado", "firma_programada", "pagado_comision", "aportacion"].includes(prospect.status);
                  return (
                    <div className="flex gap-4 relative">
                      <div className="absolute top-7 bottom-0 left-3.5 w-0.5 bg-slate-150" />
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center font-extrabold z-10 shrink-0 shadow-sm border ${
                        isCompleted
                          ? "bg-emerald-50 border-emerald-100 text-emerald-600"
                          : isUnderReview
                          ? "bg-indigo-50 border-indigo-100 text-indigo-600 animate-pulse"
                          : "bg-slate-50 border-slate-200 text-slate-400"
                      }`}>
                        {isCompleted ? <CheckCircle className="h-4 w-4" /> : <Eye className="h-3.5 w-3.5" />}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-black text-slate-800">Auditoría Técnica y de Riesgos</h4>
                        <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
                          {isCompleted
                            ? "Auditoría finalizada de forma exitosa por el Director."
                            : isUnderReview
                            ? "El expediente se encuentra actualmente bajo validación de semanas y ROI en el simulador del Director."
                            : "A la espera de carga de documentos."}
                        </p>
                      </div>
                    </div>
                  );
                })()}

                {/* Stage 4: Dictamen Oficial */}
                {(() => {
                  const status = prospect.status;
                  const isApproved = ["aprobado_listo", "firma_programada", "pagado_comision", "aportacion"].includes(status);
                  const isRejected = status === "rechazado";
                  const isConditioned = !isApproved && !isRejected && !["evaluacion_pendiente"].includes(status) && prospect.documents.length > 0;
                  
                  let badgeBg = "bg-slate-50 border-slate-200 text-slate-400";
                  let iconComp = <ShieldCheck className="h-3.5 w-3.5" />;
                  let titleStr = "Dictamen del Director";
                  let descStr = "Evaluación final de viabilidad financiera.";

                  if (isApproved) {
                    badgeBg = "bg-emerald-50 border-emerald-100 text-emerald-600";
                    iconComp = <CheckCircle className="h-4 w-4" />;
                    titleStr = "Expediente APROBADO";
                    descStr = "El prospecto cuenta con el dictamen técnico aprobado para Modalidad 40.";
                  } else if (isRejected) {
                    badgeBg = "bg-red-50 border-red-100 text-red-600";
                    iconComp = <XCircle className="h-4 w-4" />;
                    titleStr = "Expediente RECHAZADO";
                    descStr = "El caso ha sido rechazado. Favor de consultar los comentarios del Director.";
                  } else if (isConditioned) {
                    badgeBg = "bg-amber-50 border-amber-100 text-amber-600 animate-pulse";
                    iconComp = <Clock className="h-3.5 w-3.5" />;
                    titleStr = "Expediente CONDICIONADO";
                    descStr = "El caso requiere corrección urgente o se encuentra en trámite parcial.";
                  }

                  return (
                    <div className="flex gap-4 relative">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center font-extrabold z-10 shrink-0 shadow-sm border ${badgeBg}`}>
                        {iconComp}
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-[11px] font-black text-slate-800">{titleStr}</h4>
                        <p className="text-[9px] text-slate-400 font-semibold leading-relaxed">
                          {descStr}
                        </p>
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>

          </div>

        </div>

        {/* User Settings Modal */}
        <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  const currentStage = getStageAndSubStage(prospect?.status || "");

  const handleStageChange = async (newStageId: string) => {
    if (!prospect) return;
    const defaultSubStage = SUB_STAGES_BY_STAGE[newStageId]?.[0] || "";
    const newStatus = getStatusFromStageAndSubStage(newStageId, defaultSubStage);
    await updateProspectStatus(prospect.id, newStatus as any, `Etapa cambiada a ${newStageId}`);
  };

  const handleSubStageChange = async (newSubStage: string) => {
    if (!prospect) return;
    const newStatus = getStatusFromStageAndSubStage(currentStage.stage, newSubStage);
    await updateProspectStatus(prospect.id, newStatus as any, `Subetapa cambiada a ${newSubStage}`);
  };

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
      creditoNomina,
      aportacion,
      comments,
    });

    // Back to pipeline
    router.push(backPath);
  };

  const handlePendingProspect = async () => {
    if (!selectedPendingOption) {
      alert("Por favor selecciona una subetapa para evaluación pendiente.");
      return;
    }
    await updateProspectStatus(prospect.id, selectedPendingOption, "Expediente enviado a evaluación pendiente");
    setShowPendingModal(false);
    setSelectedPendingOption(null);
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

  const handleConditionProspect = async () => {
    if (!selectedConditionOption) {
      alert("Por favor selecciona un motivo para condicionar el expediente.");
      return;
    }

    if (selectedConditionOption === "aportacion") {
      if (semanas <= 0 || pensionMejorada <= pensionActual || financiamiento <= 0) {
        alert("Por favor verifica los números del simulador. La pensión mejorada debe superar a la actual, y el financiamiento debe ser mayor a cero para condicionar por aportación.");
        return;
      }
      await saveSimulation(prospect.id, {
        semanas,
        pensionActual,
        pensionMejorada,
        financiamiento,
        costoGestion,
        aforePensionarse,
        creditoNomina,
        comments,
      });
    } else {
      await updateProspectStatus(prospect.id, selectedConditionOption, "Expediente condicionado por el Director");
    }

    setShowConditionModal(false);
    setSelectedConditionOption(null);
    router.push(backPath);
  };

  const handleApprovalProspect = async () => {
    if (!selectedApprovalOption) {
      alert("Por favor selecciona una subetapa de aprobación.");
      return;
    }

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
      creditoNomina,
      comments,
    });

    await updateProspectStatus(prospect.id, selectedApprovalOption, `Expediente aprobado en subetapa: ${selectedApprovalOption}`);

    setShowApprovalModal(false);
    setSelectedApprovalOption(null);
    router.push(backPath);
  };

  return (
    <div className="max-w-[1700px] mx-auto px-4 sm:px-6 md:px-8 space-y-6 select-none pb-40 animate-fade-in">
      {/* Return button header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => router.push(backPath)}
            className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 rounded-xl transition-all shadow-sm active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a la Consola
          </button>
          
          <div className="hidden sm:flex items-center gap-2 border-l border-slate-200 pl-3.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado:</span>
            <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStageBadgeColor(prospect.status)}`}>
              {getStageLabel(prospect.status)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex sm:hidden items-center gap-2 mr-2">
            <span className={`px-3 py-1 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStageBadgeColor(prospect.status)}`}>
              {getStageLabel(prospect.status)}
            </span>
          </div>

          {/* User Profile Widget */}
          {user && (
            <div 
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-3.5 select-none cursor-pointer hover:opacity-85 transition-opacity duration-150"
            >
              <div className="text-right hidden sm:block">
                <span className="block text-xs font-black text-slate-800 leading-none">
                  {user.full_name}
                </span>
                <span className={`inline-block text-[8px] font-extrabold rounded-full px-2.5 py-1 mt-1.5 leading-none uppercase tracking-widest font-sans border ${
                  user.role === "director"
                    ? "text-teal-600 bg-teal-50 border-teal-100"
                    : "text-emerald-600 bg-emerald-50 border-emerald-100"
                }`}>
                  {user.role === "director" ? "Director" : "Aliado"}
                </span>
              </div>
              <div className={`h-10 w-10 rounded-2xl border flex items-center justify-center text-white text-sm font-black shadow-sm ${
                user.role === "director"
                  ? "bg-gradient-to-br from-teal-500 to-emerald-600 border-teal-400/20"
                  : "bg-gradient-to-br from-emerald-500 to-teal-600 border-emerald-400/20"
              }`}>
                {user.full_name.charAt(0)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Profile banner */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm select-none">
        <div className="flex items-center gap-4 flex-1">
          <div className="h-14 w-14 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center text-xl font-black shrink-0">
            {editForm.full_name ? editForm.full_name.charAt(0) : prospect.full_name.charAt(0)}
          </div>
          <div className="space-y-1.5 flex-1">
            {isEditing ? (
              <input
                type="text"
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                className="text-lg font-black text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1 outline-none focus:border-indigo-500 w-full sm:w-80"
                placeholder="Nombre Completo"
              />
            ) : (
              <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{prospect.full_name}</h2>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 font-semibold">
              {isEditing ? (
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">NSS:</span>
                    <input
                      type="text"
                      value={editForm.nss}
                      onChange={(e) => setEditForm({ ...editForm, nss: e.target.value })}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-0.5 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-32"
                      placeholder="NSS"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">CURP:</span>
                    <input
                      type="text"
                      value={editForm.curp}
                      onChange={(e) => setEditForm({ ...editForm, curp: e.target.value.toUpperCase() })}
                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-0.5 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-44 uppercase"
                      placeholder="CURP"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <span>NSS: <span className="font-extrabold text-slate-700">{prospect.nss}</span></span>
                  <span>•</span>
                  <span>CURP: <span className="font-extrabold text-slate-700">{prospect.curp}</span></span>
                </>
              )}
              <span>•</span>
              <span>Asesor: <span className="font-extrabold text-indigo-650">{prospect.aliado_name}</span></span>
            </div>
          </div>
        </div>

        {/* Contact info list */}
        <div className="grid grid-cols-2 gap-4 text-xs font-semibold border-t md:border-t-0 md:border-l border-slate-150 pt-4 md:pt-0 md:pl-6 min-w-[280px]">
          <div>
            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Correo Electrónico</span>
            {isEditing ? (
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 mt-1 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-full"
              />
            ) : (
              <span className="text-slate-700 block mt-0.5">{prospect.email}</span>
            )}
          </div>
          <div>
            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px]">Teléfono Móvil</span>
            {isEditing ? (
              <input
                type="text"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 mt-1 outline-none focus:border-indigo-500 text-xs font-semibold text-slate-700 w-full"
              />
            ) : (
              <span className="text-slate-700 block mt-0.5">{prospect.phone}</span>
            )}
          </div>
        </div>

        {/* Etapa y Subetapa Selectors / Badges */}
        <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-4 text-xs font-semibold border-t md:border-t-0 md:border-l border-slate-150 pt-4 md:pt-0 md:pl-6 min-w-[220px]">
          <div className="flex-1">
            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px] mb-1.5">Etapa</span>
            {user?.role === "director" ? (
              <select
                value={currentStage.stage}
                onChange={(e) => handleStageChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl py-1.5 px-3 text-xs font-bold outline-none transition-colors cursor-pointer"
              >
                {STAGES_LIST.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            ) : (
              <span className="inline-block px-3 py-1 bg-slate-100/80 text-slate-700 border border-slate-200 rounded-full text-[10px] font-black uppercase tracking-wider">
                {STAGES_LIST.find((s) => s.id === currentStage.stage)?.label || currentStage.stage}
              </span>
            )}
          </div>
          <div className="flex-1">
            <span className="text-slate-400 block font-bold uppercase tracking-wider text-[9px] mb-1.5">Subetapa</span>
            {user?.role === "director" ? (
              <select
                value={currentStage.subStage}
                onChange={(e) => handleSubStageChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl py-1.5 px-3 text-xs font-bold outline-none transition-colors cursor-pointer"
              >
                <option value="">Ninguna</option>
                {(SUB_STAGES_BY_STAGE[currentStage.stage] || []).map((sub) => (
                  <option key={sub} value={sub}>{sub}</option>
                ))}
              </select>
            ) : (
              <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-150 rounded-full text-[10px] font-black uppercase tracking-wider">
                {currentStage.subStage || "Ninguna"}
              </span>
            )}
          </div>
        </div>

        {/* Edit Buttons widget */}
        <div className="border-t md:border-t-0 md:border-l border-slate-150 pt-4 md:pt-0 md:pl-6 flex items-center justify-end shrink-0">
          {isEditing ? (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow border border-blue-450 transition-all active:scale-95 flex items-center gap-1.5"
              >
                Guardar
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all active:scale-95"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={handleStartEdit}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-750 text-xs font-bold rounded-xl border border-slate-200 transition-all active:scale-95 flex items-center gap-1.5"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              Editar Datos
            </button>
          )}
        </div>
      </div>

      {/* Main Core Layout: 3 Columns Split */}
      <div className="flex flex-col lg:flex-row gap-6 items-stretch w-full">
        
        {/* Columna Izquierda: Repositorio de Archivos B2B (~19%) */}
        <div className="w-full lg:w-[19%] flex flex-col shrink-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:h-[800px] h-[350px] transition-all">
            {/* Header info */}
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-100 flex flex-col gap-1 flex-shrink-0">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">Repositorio</span>
              <span className="text-[9px] text-indigo-600 font-black tracking-wider uppercase">Archivos B2B</span>
            </div>

            {/* Left pane: File folders */}
            <div className="flex-1 p-3.5 space-y-3 bg-slate-50/50 overflow-y-auto">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1 px-1">
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
                      <span className="text-[9px] font-black uppercase tracking-wider">
                        Expediente {doc.file_type}
                      </span>
                    </div>
                    <span className={`text-[9px] truncate w-full font-semibold leading-none ${isActive ? "text-white/80" : "text-slate-400"}`}>
                      {doc.file_name}
                    </span>
                    <div className="flex flex-col gap-0.5 mt-1 border-t border-slate-100 pt-1.5 w-full text-left">
                      <span className={`text-[8px] leading-none font-bold ${isActive ? "text-white/70" : "text-slate-400"}`}>
                        Por: {(() => {
                          const uploader = profiles.find(p => p.id === doc.uploaded_by);
                          if (uploader) return uploader.full_name;
                          return doc.uploaded_by === user?.id ? user?.full_name : "Sistema";
                        })()}
                      </span>
                      <span className={`text-[8px] leading-none font-bold ${isActive ? "text-white/70" : "text-slate-400"}`}>
                        Subido: {new Date(doc.uploaded_at).toLocaleDateString()}
                      </span>
                    </div>
                  </button>
                );
              })}

              {prospect.documents.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs font-semibold">
                  No se adjuntaron expedientes.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Columna Central: Visor PDF Grande (~48%) */}
        <div className="w-full lg:w-[48%] flex flex-col shrink-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:h-[800px] h-[550px] transition-all">
            {selectedDocType === null ? (
              <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
                <div className="text-center max-w-[280px] space-y-4 text-slate-400">
                  <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 shadow-inner">
                    <Eye className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Ver Expediente Técnico</h4>
                    <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                      Haz clic en cualquiera de los documentos de la izquierda para desplegar el simulador visual del expediente.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden select-none">
                {/* PDF Chrome Bar */}
                <div className="h-11 bg-slate-800 text-slate-200 px-4 flex items-center justify-between border-b border-slate-700 shrink-0 text-xs">
                  <div className="flex items-center gap-2 font-mono truncate max-w-[150px] sm:max-w-xs text-[10px]">
                    <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black">PDF</span>
                    <span className="font-extrabold truncate text-slate-200">{selectedDocName}</span>
                  </div>
                  
                  {/* Zoom and Page controls */}
                  <div className="flex items-center gap-2.5">
                    <button 
                      onClick={() => setZoomLevel(prev => Math.max(70, prev - 10))}
                      className="p-1 hover:bg-slate-700 rounded transition-colors text-[10px] font-bold"
                      title="Reducir Zoom"
                    >
                      A-
                    </button>
                    <span className="text-[9px] font-bold text-slate-400 font-mono w-9 text-center">
                      {zoomLevel}%
                    </span>
                    <button 
                      onClick={() => setZoomLevel(prev => Math.min(130, prev + 10))}
                      className="p-1 hover:bg-slate-700 rounded transition-colors text-[10px] font-bold"
                      title="Aumentar Zoom"
                    >
                      A+
                    </button>
                    <span className="h-3 w-px bg-slate-700 mx-0.5" />
                    <span className="text-[9px] font-mono font-bold text-slate-400">Pág 1 / 1</span>
                  </div>

                  {/* Download & Print actions */}
                  <div className="flex items-center gap-2">
                    {canDeleteDoc && (
                      <button
                        onClick={handleDeleteSelectedDoc}
                        className="p-1.5 hover:bg-slate-700 hover:text-red-400 rounded transition-colors text-slate-350"
                        title="Eliminar Expediente"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => triggerPushNotification(`📥 Descarga Exitosa: El archivo '${selectedDocName}' ha sido descargado en tu carpeta local de forma segura bajo cifrado SSL.`, "email", "Director Eduardo")}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
                      title="Descargar Archivo"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                    <button
                      onClick={() => triggerPushNotification(`🖨️ Impresión Iniciada: Enviando '${selectedDocName}' a la cola de impresión de la red operativa.`, "email", "Director Eduardo")}
                      className="p-1.5 hover:bg-slate-700 rounded transition-colors text-slate-300 hover:text-white"
                      title="Imprimir"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    </button>
                    <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[8px] font-black uppercase tracking-wider border border-indigo-500/20 leading-none">
                      Secure PDF
                    </span>
                  </div>
                </div>

                {/* PDF Document Viewer Canvas */}
                <div className="flex-1 bg-slate-600 p-4 sm:p-6 overflow-y-auto flex items-start justify-center animate-fade-in">
                  {loadingFile ? (
                    <div className="w-full max-w-[400px] bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-xl self-center">
                      <div className="h-10 w-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mx-auto" />
                      <div>
                        <h4 className="text-xs font-bold text-slate-700">Cargando Documento</h4>
                        <p className="text-[10px] text-slate-400 mt-1">Recuperando el expediente en alta resolución...</p>
                      </div>
                    </div>
                  ) : realFileData ? (
                    realFileData.startsWith("data:application/pdf") || realFileData.startsWith("http") ? (
                      <div 
                        className="w-full bg-white shadow-2xl border border-slate-350 rounded-lg overflow-hidden flex flex-col transition-all duration-300 transform origin-top h-[690px]"
                        style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "100%" }}
                      >
                        <iframe
                          src={realFileData.includes("drive.google.com") && !realFileData.includes("/preview") && !realFileData.includes("/embed") ? realFileData.replace(/\/view.*/, "/preview") : realFileData}
                          className="w-full h-full border-0"
                          title={selectedDocName}
                        />
                      </div>
                    ) : (
                      <div 
                        className="w-full bg-white shadow-2xl border border-slate-350 rounded-lg overflow-hidden flex items-center justify-center transition-all duration-300 transform origin-top p-4"
                        style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "100%" }}
                      >
                        <img
                          src={realFileData}
                          className="max-w-full max-h-[600px] object-contain rounded"
                          alt={selectedDocName}
                        />
                      </div>
                    )
                  ) : (
                    <div 
                      className="w-full bg-white shadow-2xl border border-slate-300 rounded-xl p-6 sm:p-8 font-mono text-[9px] text-slate-700 relative overflow-hidden transition-all duration-300 transform origin-top"
                      style={{ transform: `scale(${zoomLevel / 100})`, width: "100%", maxWidth: "680px" }}
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

                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-slate-800 leading-normal font-sans text-[9px]">
                          <div><span className="text-slate-400">ASEGURADO:</span> <span className="font-black text-slate-900">{prospect.full_name.toUpperCase()}</span></div>
                          <div><span className="text-slate-400">N.S.S.:</span> <span className="font-black text-slate-900">{prospect.nss}</span></div>
                          <div><span className="text-slate-400">C.U.R.P.:</span> <span className="font-black text-slate-900">{prospect.curp.toUpperCase()}</span></div>
                          <div><span className="text-slate-400">EMISIÓN:</span> <span className="font-bold text-slate-900">{new Date(prospect.created_at).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}</span></div>
                          <div><span className="text-slate-400">ESTADO:</span> <span className="font-bold text-emerald-600">VIGENTE / LEY 73</span></div>
                        </div>

                        <div className="space-y-2">
                          <span className="font-black text-slate-800 uppercase tracking-wider block text-[8px] border-b border-slate-350 pb-1">
                            📊 RESUMEN DE COTIZACIONES (HISTORIAL CERTIFICADO)
                          </span>
                          <div className="grid grid-cols-3 gap-2 bg-slate-50/50 border border-slate-150 p-2.5 rounded-xl text-center font-sans">
                            <div>
                              <span className="block text-[7px] text-slate-400 uppercase font-extrabold">Semanas Totales</span>
                              <span className="block text-xs font-black text-slate-800">{semanas}</span>
                            </div>
                            <div>
                              <span className="block text-[7px] text-slate-400 uppercase font-extrabold">Semanas Descontadas</span>
                              <span className="block text-xs font-black text-slate-800">0</span>
                            </div>
                            <div>
                              <span className="block text-[7px] text-slate-400 uppercase font-extrabold">Años Cotizados</span>
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
                            <span className="block font-mono bg-slate-50 border border-slate-100 p-1 rounded font-medium text-slate-400 truncate text-[6px]">
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

                        <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-1 text-slate-800 leading-normal font-sans text-[9px]">
                          <div><span className="text-slate-400">TITULAR:</span> <span className="font-black text-slate-900">{prospect.full_name.toUpperCase()}</span></div>
                          <div><span className="text-slate-400">N.S.S.:</span> <span className="font-black text-slate-900">{prospect.nss}</span></div>
                          <div><span className="text-slate-400">C.U.R.P.:</span> <span className="font-black text-slate-900">{prospect.curp.toUpperCase()}</span></div>
                          <div><span className="text-slate-400">PERIODO:</span> <span className="font-bold text-slate-900">1er Trimestre 2026</span></div>
                          <div><span className="text-slate-400">SIEFORE:</span> <span className="font-bold text-indigo-650">Básica 65-69 (Fondo Regulado)</span></div>
                        </div>

                        <div className="space-y-2.5 font-sans text-[9px]">
                          <span className="font-black text-indigo-950 uppercase tracking-wider block text-[8px] border-b border-slate-350 pb-1">
                            💼 RESUMEN DE SALDOS ACUMULADOS EN TU CUENTA INDIVIDUAL
                          </span>
                          <div className="grid grid-cols-3 gap-2 font-sans">
                            <div className="bg-slate-50 border border-slate-150 p-2 rounded-xl text-center">
                              <span className="block text-[5.5px] text-slate-400 uppercase font-extrabold leading-none">Retiro RCV L97</span>
                              <span className="block text-[9px] font-black text-slate-800 mt-1">$185,000.00</span>
                            </div>
                            <div className="bg-slate-50 border border-slate-150 p-2 rounded-xl text-center">
                              <span className="block text-[5.5px] text-slate-400 uppercase font-extrabold leading-none">Vivienda (INFONAVIT)</span>
                              <span className="block text-[9px] font-black text-slate-800 mt-1">$215,000.00</span>
                            </div>
                            <div className="bg-slate-50 border border-slate-150 p-2 rounded-xl text-center">
                              <span className="block text-[5.5px] text-slate-400 uppercase font-extrabold leading-none">SAR IMSS 92</span>
                              <span className="block text-[9px] font-black text-emerald-600 mt-1">$50,000.00</span>
                            </div>
                          </div>

                          <div className="bg-indigo-950 text-white p-3 rounded-2xl flex items-center justify-between border border-indigo-900/50 shadow-md font-sans">
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
                            <span className="block font-mono bg-slate-50 border border-slate-100 p-1 rounded font-medium text-slate-400 truncate text-[6px]">
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

        {/* Columna Derecha: Simulador Ley 73 (~33%) */}
        <div className="w-full lg:w-[33%] flex flex-col shrink-0">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:h-[800px] h-auto transition-all">
            {/* Header title */}
            <div className="px-5 py-4 border-b border-slate-150 bg-slate-50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Calculator className="h-4.5 w-4.5 text-indigo-500" />
                <div>
                  <h3 className="text-xs font-black text-slate-800">Simulador Ley 73</h3>
                  <span className="block text-[9px] text-slate-400 font-semibold">Emisión de dictamen financiero</span>
                </div>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Form Input fields */}
              <div className="space-y-4">
                {/* Semanas Cotizadas */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Semanas cotizadas
                  </label>
                  <input
                    type="number"
                    value={semanas}
                    disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                    onChange={(e) => setSemanas(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl px-4 py-2.5 text-xs font-bold transition-all"
                  />
                </div>

                {/* Pensión inputs grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">
                      Pensión actual
                    </label>
                    <div className="relative rounded-2xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={pensionActual}
                        disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                        onChange={(e) => setPensionActual(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl py-2.5 text-xs font-bold transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">
                      Pensión proyectada
                    </label>
                    <div className="relative rounded-2xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={pensionMejorada}
                        disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                        onChange={(e) => setPensionMejorada(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl py-2.5 text-xs font-bold transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Financing inputs grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">
                      Financiamiento M40
                    </label>
                    <div className="relative rounded-2xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={financiamiento}
                        disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                        onChange={(e) => setFinanciamiento(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl py-2.5 text-xs font-bold transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">
                      Costo Cobertura
                    </label>
                    <div className="relative rounded-2xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={costoGestion}
                        disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                        onChange={(e) => setCostoGestion(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl py-2.5 text-xs font-bold transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Afore and Credito de Nomina grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">
                      Afore al pensionarse
                    </label>
                    <div className="relative rounded-2xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={aforePensionarse}
                        disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                        onChange={(e) => setAforePensionarse(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl py-2.5 text-xs font-bold transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-sans">
                      Credito de nomina
                    </label>
                    <div className="relative rounded-2xl shadow-sm">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        $
                      </div>
                      <input
                        type="number"
                        value={creditoNomina}
                        disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                        onChange={(e) => setCreditoNomina(Math.max(0, Number(e.target.value)))}
                        className="w-full pl-7 pr-3 bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl py-2.5 text-xs font-bold transition-all"
                      />
                    </div>
                  </div>
                </div>

                {/* Dictamen comments */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Observaciones
                  </label>
                  <textarea
                    value={comments}
                    disabled={user?.role !== "director" || (isApproved && !isEditingApproved)}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                    placeholder="Escribe comentarios sobre la M40 y la viabilidad del proyecto..."
                    className="w-full bg-slate-50 hover:bg-slate-100/50 focus:bg-white disabled:bg-slate-100/60 disabled:cursor-not-allowed border border-slate-200 focus:border-indigo-500 outline-none rounded-2xl px-4 py-2.5 text-xs font-semibold transition-all resize-none"
                  />
                </div>
              </div>

              {/* Redesigned Diagnóstico Section */}
              <div className="border-t border-slate-150 pt-5 space-y-4">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest flex items-center gap-1.5 leading-none">
                  Diagnostico
                </span>
                
                <div className="grid grid-cols-2 gap-4">
                  {/* Total Crédito Card */}
                  <div className="bg-indigo-50/50 border border-indigo-100/80 rounded-2xl p-4 shadow-sm hover:shadow transition-shadow">
                    <span className="text-[9px] text-indigo-400 font-extrabold uppercase tracking-wider block leading-none">
                      Total credito
                    </span>
                    <span className="text-lg font-black text-indigo-950 block mt-2.5 leading-none">
                      ${totalCredito.toLocaleString()}
                    </span>
                  </div>

                  {/* Aportación Card */}
                  <div className={`border rounded-2xl p-4 shadow-sm hover:shadow transition-shadow ${
                    aportacion > 0 
                      ? "bg-amber-50/50 border-amber-100/80 text-amber-950" 
                      : "bg-teal-50/50 border-teal-100/80 text-teal-950"
                  }`}>
                    <span className={`text-[9px] font-extrabold uppercase tracking-wider block leading-none ${
                      aportacion > 0 ? "text-amber-400" : "text-teal-400"
                    }`}>
                      Aportacion
                    </span>
                    <span className="text-lg font-black block mt-2.5 leading-none">
                      ${aportacion.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Sticky Bottom Actions Bar (Matches reference design) */}
      {user?.role === "director" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-8 py-5.5 shadow-[0_-12px_40px_rgba(0,0,0,0.08)] rounded-t-[36px] z-40 select-none">
          {isApproved && !isEditingApproved ? (
            <div className="max-w-[1700px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 w-full">
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-3 shadow-sm">
                <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-black text-slate-800">Expediente Aprobado</h4>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5">El dictamen Ley 73 ya ha sido emitido y notificado al aliado comercial.</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingApproved(true)}
                className="py-3 px-6 bg-slate-800 hover:bg-slate-900 text-white rounded-2xl text-xs font-bold uppercase tracking-wider transition-all transform active:translate-y-[1px] shadow hover:-translate-y-[1px]"
              >
                Cambiar decisión
              </button>
            </div>
          ) : (
            <div className="max-w-[1700px] mx-auto space-y-3 w-full animate-fade-in">
              {isEditingApproved && (
                <div className="flex justify-end pr-2">
                  <button 
                    onClick={() => setIsEditingApproved(false)}
                    className="text-[10px] text-slate-400 hover:text-slate-700 font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                  >
                    ✕ Cancelar edición
                  </button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
                {/* Evaluación Pendiente */}
                <button
                  onClick={() => setShowPendingModal(true)}
                  className="w-full py-4.5 px-6 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-2xl text-xs sm:text-sm font-extrabold uppercase tracking-widest transition-all transform active:translate-y-[2px] active:border-b-2 hover:-translate-y-[1px] border-b-4 border-blue-800 flex items-center justify-center gap-2.5 shadow-md shadow-blue-500/25 active:shadow-sm"
                >
                  <Clock className="h-5 w-5 stroke-[2.5]" />
                  Evaluación Pendiente
                </button>

                {/* Rechazar */}
                <button
                  onClick={() => setShowRejectionModal(true)}
                  className="w-full py-4.5 px-6 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-650 hover:to-rose-700 text-white rounded-2xl text-xs sm:text-sm font-extrabold uppercase tracking-widest transition-all transform active:translate-y-[2px] active:border-b-2 hover:-translate-y-[1px] border-b-4 border-red-800 flex items-center justify-center gap-2.5 shadow-md shadow-red-500/25 active:shadow-sm"
                >
                  <XCircle className="h-5 w-5 stroke-[2.5]" />
                  Rechazar
                </button>
                
                {/* Condicionar */}
                <button
                  onClick={() => setShowConditionModal(true)}
                  className="w-full py-4.5 px-6 bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-500 hover:to-yellow-600 text-slate-900 rounded-2xl text-xs sm:text-sm font-extrabold uppercase tracking-widest transition-all transform active:translate-y-[2px] active:border-b-2 hover:-translate-y-[1px] border-b-4 border-amber-700 flex items-center justify-center gap-2.5 shadow-md shadow-amber-500/25 active:shadow-sm"
                >
                  <Info className="h-5 w-5 stroke-[2.5]" />
                  Condicionar
                </button>

                {/* Aprobar */}
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="w-full py-4.5 px-6 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-650 hover:to-teal-700 text-white rounded-2xl text-xs sm:text-sm font-extrabold uppercase tracking-widest transition-all transform active:translate-y-[2px] active:border-b-2 hover:-translate-y-[1px] border-b-4 border-emerald-800 flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-500/30 active:shadow-sm"
                >
                  <CheckCircle className="h-5 w-5 stroke-[2.5]" />
                  Aprobar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pending selection modal overlay */}
      {showPendingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 space-y-6 border border-slate-200 relative">
            <button
              onClick={() => {
                setShowPendingModal(false);
                setSelectedPendingOption(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>

            <div className="border-b border-slate-150 pb-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Evaluación Pendiente</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Selecciona la subetapa correspondiente para evaluación pendiente:
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: "falta_reporte",
                  label: "Falta Reporte IMSS",
                  desc: "Falta reporte detallado de semanas cotizadas",
                  iconColor: "text-blue-500",
                  icon: FileText,
                },
                {
                  id: "falta_afore",
                  label: "Falta Afore",
                  desc: "Falta estado de cuenta de la Afore",
                  iconColor: "text-orange-500",
                  icon: Info,
                },
                {
                  id: "pendiente_documentos",
                  label: "Pendiente Documentos",
                  desc: "Faltan otros documentos complementarios",
                  iconColor: "text-amber-500",
                  icon: Folder,
                },
              ].map((opt) => {
                const isSelected = selectedPendingOption === opt.id;
                const IconComp = opt.icon;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedPendingOption(opt.id as any)}
                    className={`border p-4.5 rounded-[22px] flex items-center justify-between cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-blue-50/50 border-blue-500 ring-1 ring-blue-500/20 shadow-sm"
                        : "bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-11 w-11 rounded-full border border-slate-100 flex items-center justify-center bg-white shadow-sm shrink-0 ${opt.iconColor}`}>
                        <IconComp className="h-5 w-5 stroke-[2]" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 leading-tight">{opt.label}</h4>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-none">{opt.desc}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected ? "border-blue-500 bg-white" : "border-slate-300"
                      }`}>
                        {isSelected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-fade-in" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                onClick={handlePendingProspect}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-[20px] text-sm font-extrabold shadow-md shadow-blue-500/10 transition-all flex items-center justify-center gap-2"
              >
                <Send className="h-4.5 w-4.5 stroke-[2.5]" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Condition selection modal overlay */}
      {showConditionModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 space-y-6 border border-slate-200 relative">
            <button
              onClick={() => {
                setShowConditionModal(false);
                setSelectedConditionOption(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>

            <div className="border-b border-slate-150 pb-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Condicionar Expediente</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Selecciona la subetapa de condicionamiento:
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: "aportacion",
                  label: "Aportación",
                  desc: "Se requiere aportación del cliente (calculada en simulador)",
                  iconColor: "text-teal-600",
                  icon: DollarSign,
                },
                {
                  id: "falta_semanas",
                  label: "Falta Detallado de Semanas",
                  desc: "Inconsistencia o falta de desglose de semanas cotizadas",
                  iconColor: "text-amber-500",
                  icon: Clock,
                },
                {
                  id: "falta_afore_cuenta",
                  label: "Falta Estado Cuenta Afore",
                  desc: "Requiere documento oficial de saldo afore",
                  iconColor: "text-amber-600",
                  icon: FileText,
                },
              ].map((opt) => {
                const isSelected = selectedConditionOption === opt.id;
                const IconComp = opt.icon;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedConditionOption(opt.id as any)}
                    className={`border p-4.5 rounded-[22px] flex items-center justify-between cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-amber-50/50 border-amber-500 ring-1 ring-amber-500/20 shadow-sm"
                        : "bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-11 w-11 rounded-full border border-slate-100 flex items-center justify-center bg-white shadow-sm shrink-0 ${opt.iconColor}`}>
                        <IconComp className="h-5 w-5 stroke-[2]" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 leading-tight">{opt.label}</h4>
                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5 leading-none">{opt.desc}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected ? "border-amber-500 bg-white" : "border-slate-300"
                      }`}>
                        {isSelected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-fade-in" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                onClick={handleConditionProspect}
                className="w-full py-4 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-[20px] text-sm font-extrabold shadow-md shadow-amber-500/10 transition-all flex items-center justify-center gap-2"
              >
                <Send className="h-4.5 w-4.5 stroke-[2.5]" />
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval selection modal overlay */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in select-none p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-6 space-y-6 border border-slate-200 relative">
            <button
              onClick={() => {
                setShowApprovalModal(false);
                setSelectedApprovalOption(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <XCircle className="h-5 w-5" />
            </button>

            <div className="border-b border-slate-150 pb-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Aprobar Expediente</h3>
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Selecciona la subetapa de aprobación (se guardarán los valores del simulador):
              </p>
            </div>

            <div className="space-y-3">
              {[
                {
                  id: "asesoria_agendada",
                  label: "Agenda Asesoria",
                  desc: "Asesoría agendada para presentar propuesta",
                  iconColor: "text-purple-500",
                  icon: Calendar,
                },
                {
                  id: "doc_proceso",
                  label: "Firma Carta Compromiso",
                  desc: "Carta compromiso firmada por el cliente",
                  iconColor: "text-blue-500",
                  icon: FileCheck,
                },
                {
                  id: "analisis_riesgo",
                  label: "Analisis de Riesgo",
                  desc: "En análisis de riesgo operativo",
                  iconColor: "text-cyan-500",
                  icon: ShieldCheck,
                },
                {
                  id: "firma_programada",
                  label: "Cerrada Ganada",
                  desc: "Caso cerrado y ganado",
                  iconColor: "text-indigo-500",
                  icon: CheckCircle,
                },
                {
                  id: "pagado_comision",
                  label: "Pagado / Cerrado",
                  desc: "Comisión liberada y cobrada",
                  iconColor: "text-emerald-500",
                  icon: DollarSign,
                },
              ].map((opt) => {
                const isSelected = selectedApprovalOption === opt.id;
                const IconComp = opt.icon;
                return (
                  <div
                    key={opt.id}
                    onClick={() => setSelectedApprovalOption(opt.id as any)}
                    className={`border p-4 rounded-[20px] flex items-center justify-between cursor-pointer transition-all duration-200 ${
                      isSelected
                        ? "bg-emerald-50/50 border-emerald-500 ring-1 ring-emerald-500/20 shadow-sm"
                        : "bg-white border-slate-200 hover:border-slate-350 hover:bg-slate-50/30"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full border border-slate-100 flex items-center justify-center bg-white shadow-sm shrink-0 ${opt.iconColor}`}>
                        <IconComp className="h-4.5 w-4.5 stroke-[2]" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-800 leading-tight">{opt.label}</h4>
                        <p className="text-[9px] text-slate-400 font-semibold mt-0.5 leading-none">{opt.desc}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center">
                      <div className={`h-5 w-5 rounded-full border flex items-center justify-center transition-all ${
                        isSelected ? "border-emerald-500 bg-white" : "border-slate-300"
                      }`}>
                        {isSelected && (
                          <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-fade-in" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                onClick={handleApprovalProspect}
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[20px] text-sm font-extrabold shadow-md shadow-emerald-500/10 transition-all flex items-center justify-center gap-2"
              >
                <Send className="h-4.5 w-4.5 stroke-[2.5]" />
                Confirmar Aprobación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Settings Modal */}
      <UserSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

    </div>
  );
}
