"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { saveFile } from "@/utils/db";


export type UserRole = "aliado" | "director";

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  invitation_code_used?: string;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  prospect_id: string;
  file_name: string;
  file_url: string;
  file_type: "AFORE" | "IMSS" | "OTROS";
  uploaded_at: string;
}

export interface Simulation {
  semanas: number;
  pensionActual: number;
  pensionMejorada: number;
  financiamiento: number;
  costoGestion: number;
  totalCredito: number;
  roiMonths: number;
  comments?: string;
}

export interface Prospect {
  id: string;
  aliado_id: string;
  aliado_name?: string;
  full_name: string;
  nss: string;
  curp: string;
  email: string;
  phone: string;
  status:
    | "evaluacion_pendiente"
    | "rechazado"
    | "aprobado_listo"
    | "asesoria_agendada"
    | "doc_proceso"
    | "analisis_riesgo"
    | "firma_programada"
    | "pagado_comision";
  notes_aliado?: string;
  notes_director?: string;
  simulation?: Simulation;
  documents: DocumentItem[];
  created_at: string;
  updated_at: string;
}

export interface InvitationCode {
  id: string;
  code: string;
  created_by: string;
  is_used: boolean;
  used_by?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "alert";
  read: boolean;
  created_at: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: "whatsapp" | "email";
  recipient: string;
}

interface AppContextType {
  user: UserProfile | null;
  activeRole: UserRole;
  prospects: Prospect[];
  invitationCodes: InvitationCode[];
  notifications: NotificationItem[];
  profiles: UserProfile[];
  toast: ToastMessage | null;
  isDemoMode: boolean;
  isLoading: boolean;
  login: (email: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  switchRole: (role: UserRole) => void;
  addProspect: (
    prospectData: Omit<
      Prospect,
      "id" | "aliado_id" | "status" | "created_at" | "updated_at" | "documents" | "simulation"
    >,
    aforeFile?: string | { name: string; dataUrl: string },
    imssFile?: string | { name: string; dataUrl: string }
  ) => Promise<Prospect>;
  deleteProspect: (id: string) => Promise<void>;
  updateProspectStatus: (id: string, newStatus: Prospect["status"], comments?: string) => Promise<void>;
  saveSimulation: (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => Promise<void>;
  scheduleAssessment: (id: string, date: string, time: string) => Promise<void>;
  generateInvitationCode: () => Promise<InvitationCode>;
  createProfile: (profileData: Omit<UserProfile, "id" | "created_at">) => Promise<UserProfile>;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  clearToast: () => void;
  triggerPushNotification: (message: string, type: "whatsapp" | "email", recipient: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Initial realistic data for Demo mode
const INITIAL_PROFILES: UserProfile[] = [
  {
    id: "aliado-123",
    full_name: "Roberto Asesor",
    email: "roberto@asesores.com",
    phone: "5512345678",
    role: "aliado",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "director-456",
    full_name: "Eduardo Director",
    email: "eduardo@pensionflow.com",
    phone: "5598765432",
    role: "director",
    created_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const INITIAL_PROSPECTS: Prospect[] = [
  {
    id: "prospect-1",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    full_name: "Norberto Javier González Ventura",
    nss: "68876602886",
    curp: "GOVN680820HDFLNS02",
    email: "norberto.gov@gmail.com",
    phone: "5543210987",
    status: "aprobado_listo",
    notes_aliado: "Cliente muy interesado en cotizar con Modalidad 40 tope de 5 años. Ya cuenta con los recursos para el enganche del financiamiento.",
    notes_director: "Semanas verificadas en IMSS. Reporte de Afore concuerda. Viabilidad financiera alta por cantidad de semanas cotizadas.",
    simulation: {
      semanas: 1150,
      pensionActual: 6800,
      pensionMejorada: 29500,
      financiamiento: 380000,
      costoGestion: 38000,
      totalCredito: 418000,
      roiMonths: 19,
      comments: "Se sugiere Modalidad 40 por 58 meses para alcanzar el tope óptimo en base a sus semanas.",
    },
    documents: [
      {
        id: "doc-1-1",
        prospect_id: "prospect-1",
        file_name: "AFORE_Norberto_Gonzalez.pdf",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-1-2",
        prospect_id: "prospect-1",
        file_name: "Semanas_IMSS_Norberto.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prospect-2",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    full_name: "Ana María Torres Ruiz",
    nss: "09876543210",
    curp: "TORA731005MDFRRN09",
    email: "ana.torres@live.com.mx",
    phone: "5587654321",
    status: "evaluacion_pendiente",
    notes_aliado: "Cliente requiere simulación urgente. Trabaja por honorarios actualmente, pero cotizó más de 20 años.",
    documents: [
      {
        id: "doc-2-1",
        prospect_id: "prospect-2",
        file_name: "EdoCuenta_AFORE_AnaMaria.pdf",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-2-2",
        prospect_id: "prospect-2",
        file_name: "Semanas_IMSS_AnaMaria.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prospect-3",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    full_name: "Juan Pérez García",
    nss: "12345678901",
    curp: "PEGJ700512HDFRRN01",
    email: "juan.perez@yahoo.com",
    phone: "5567890123",
    status: "analisis_riesgo",
    notes_aliado: "El prospecto tiene dudas del proceso administrativo de firma, pero está validado técnicamente.",
    notes_director: "Dictamen aprobado. Envió expediente para análisis detallado de buró y riesgos.",
    simulation: {
      semanas: 1420,
      pensionActual: 12000,
      pensionMejorada: 42000,
      financiamiento: 450000,
      costoGestion: 45000,
      totalCredito: 495000,
      roiMonths: 17,
      comments: "Excelente prospecto con una cantidad robusta de semanas.",
    },
    documents: [
      {
        id: "doc-3-1",
        prospect_id: "prospect-3",
        file_name: "AFORE_Juan_Perez.pdf",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-3-2",
        prospect_id: "prospect-3",
        file_name: "SemanasCotizadas_Juan_Perez.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "prospect-4",
    aliado_id: "aliado-123",
    aliado_name: "Roberto Asesor",
    full_name: "Héctor Ramírez Soto",
    nss: "55123456789",
    curp: "RASH650315HDFMNR08",
    email: "hector.ramirez@gmail.com",
    phone: "5578901234",
    status: "pagado_comision",
    notes_aliado: "Firma exitosa. Todo el proceso completado.",
    notes_director: "Financiamiento liberado, Modalidad 40 activa. Comisión de aliado pagada.",
    simulation: {
      semanas: 1550,
      pensionActual: 9500,
      pensionMejorada: 52000,
      financiamiento: 510000,
      costoGestion: 50000,
      totalCredito: 560000,
      roiMonths: 14,
      comments: "Proyecto cerrado con éxito comercial y operativo.",
    },
    documents: [
      {
        id: "doc-4-1",
        prospect_id: "prospect-4",
        file_name: "Afore_Hector.jpg",
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "doc-4-2",
        prospect_id: "prospect-4",
        file_name: "ImssSemanas_Hector.pdf",
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    created_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const INITIAL_CODES: InvitationCode[] = [
  {
    id: "code-1",
    code: "AL-2026-X8F9",
    created_by: "director-456",
    is_used: false,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "code-2",
    code: "AL-2026-F9A2",
    created_by: "director-456",
    is_used: true,
    used_by: "aliado-123",
    created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Comisión Liberada",
    message: "¡Excelentes noticias! Se ha liberado la comisión para el proyecto de Héctor Ramírez Soto.",
    type: "success",
    read: false,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "notif-2",
    title: "Simulación Aprobada",
    message: "El Director de Operaciones ha aprobado y emitido la simulación para Norberto Javier González Ventura.",
    type: "info",
    read: false,
    created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "notif-3",
    title: "Nuevo Prospecto Recibido",
    message: "Se ha registrado exitosamente a Ana María Torres Ruiz en el pipeline de evaluación.",
    type: "info",
    read: true,
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>("aliado");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [invitationCodes, setInvitationCodes] = useState<InvitationCode[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load state from localStorage on mount
  useEffect(() => {
    // Check if Supabase keys exist (Mocking check or reading env)
    const hasKeys =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL !== "tu_supabase_url_aqui" &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== "tu_supabase_anon_key_aqui";

    setIsDemoMode(!hasKeys);

    // Read localStorage fallbacks
    const storedUser = localStorage.getItem("pensionflow_user");
    const storedRole = localStorage.getItem("pensionflow_active_role");
    const storedProspects = localStorage.getItem("pensionflow_prospects");
    const storedCodes = localStorage.getItem("pensionflow_invitation_codes");
    const storedNotifs = localStorage.getItem("pensionflow_notifications");
    const storedProfiles = localStorage.getItem("pensionflow_profiles");

    if (storedProfiles) {
      setProfiles(JSON.parse(storedProfiles));
    } else {
      setProfiles(INITIAL_PROFILES);
      localStorage.setItem("pensionflow_profiles", JSON.stringify(INITIAL_PROFILES));
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    } else {
      // Pre-set ally as default user for first time visitors
      setUser(INITIAL_PROFILES[0]);
      localStorage.setItem("pensionflow_user", JSON.stringify(INITIAL_PROFILES[0]));
    }

    if (storedRole) {
      setActiveRole(storedRole as UserRole);
    } else {
      setActiveRole("aliado");
      localStorage.setItem("pensionflow_active_role", "aliado");
    }

    if (storedProspects) {
      setProspects(JSON.parse(storedProspects));
    } else {
      setProspects(INITIAL_PROSPECTS);
      localStorage.setItem("pensionflow_prospects", JSON.stringify(INITIAL_PROSPECTS));
    }

    if (storedCodes) {
      setInvitationCodes(JSON.parse(storedCodes));
    } else {
      setInvitationCodes(INITIAL_CODES);
      localStorage.setItem("pensionflow_invitation_codes", JSON.stringify(INITIAL_CODES));
    }

    if (storedNotifs) {
      setNotifications(JSON.parse(storedNotifs));
    } else {
      setNotifications(INITIAL_NOTIFICATIONS);
      localStorage.setItem("pensionflow_notifications", JSON.stringify(INITIAL_NOTIFICATIONS));
    }

    setIsLoading(false);
  }, []);

  // Sync state to localStorage when it changes
  const saveToStorage = (key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  const login = async (email: string, role: UserRole): Promise<boolean> => {
    setIsLoading(true);
    // Demo login simulator from dynamic profiles
    const storedProfiles = localStorage.getItem("pensionflow_profiles");
    const parsedProfiles: UserProfile[] = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
    
    const profile = parsedProfiles.find((p) => p.email === email && p.role === role) || {
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      full_name: role === "aliado" ? "Aliado Comercial" : "Director Operaciones",
      email,
      phone: "5500000000",
      role,
      created_at: new Date().toISOString(),
    };

    setUser(profile);
    setActiveRole(role);
    saveToStorage("pensionflow_user", profile);
    saveToStorage("pensionflow_active_role", role);
    setIsLoading(false);
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("pensionflow_user");
  };

  const switchRole = (role: UserRole) => {
    setActiveRole(role);
    localStorage.setItem("pensionflow_active_role", role);
    // Synchronize default profile if switching in demo mode from dynamic list
    const storedProfiles = localStorage.getItem("pensionflow_profiles");
    const parsedProfiles: UserProfile[] = storedProfiles ? JSON.parse(storedProfiles) : INITIAL_PROFILES;
    const defaultProfile = parsedProfiles.find((p) => p.role === role);
    if (defaultProfile) {
      setUser(defaultProfile);
      saveToStorage("pensionflow_user", defaultProfile);
    }
  };

  const addProspect = async (
    prospectData: Omit<
      Prospect,
      "id" | "aliado_id" | "status" | "created_at" | "updated_at" | "documents" | "simulation"
    >,
    aforeFile?: string | { name: string; dataUrl: string },
    imssFile?: string | { name: string; dataUrl: string }
  ): Promise<Prospect> => {
    const newId = `prospect-${Math.random().toString(36).substr(2, 9)}`;
    
    const docs: DocumentItem[] = [];
    
    const aforeName = typeof aforeFile === "string" ? aforeFile : aforeFile?.name;
    const aforeDataUrl = typeof aforeFile === "string" ? undefined : aforeFile?.dataUrl;
    
    const imssName = typeof imssFile === "string" ? imssFile : imssFile?.name;
    const imssDataUrl = typeof imssFile === "string" ? undefined : imssFile?.dataUrl;

    if (aforeName) {
      const docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
      docs.push({
        id: docId,
        prospect_id: newId,
        file_name: aforeName,
        file_url: "#",
        file_type: "AFORE",
        uploaded_at: new Date().toISOString(),
      });
      if (aforeDataUrl) {
        await saveFile(docId, aforeDataUrl);
      }
    }
    if (imssName) {
      const docId = `doc-${Math.random().toString(36).substr(2, 9)}`;
      docs.push({
        id: docId,
        prospect_id: newId,
        file_name: imssName,
        file_url: "#",
        file_type: "IMSS",
        uploaded_at: new Date().toISOString(),
      });
      if (imssDataUrl) {
        await saveFile(docId, imssDataUrl);
      }
    }

    const newProspect: Prospect = {
      ...prospectData,
      id: newId,
      aliado_id: user?.id || "aliado-123",
      aliado_name: user?.full_name || "Roberto Asesor",
      status: "evaluacion_pendiente",
      documents: docs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [newProspect, ...prospects];
    setProspects(updated);
    saveToStorage("pensionflow_prospects", updated);

    // Create system notification
    const newNotif: NotificationItem = {
      id: `notif-${Math.random().toString(36).substr(2, 9)}`,
      title: "Nuevo Prospecto Capturado",
      message: `El aliado ${newProspect.aliado_name} registró a ${newProspect.full_name} para evaluación Ley 73.`,
      type: "info",
      read: false,
      created_at: new Date().toISOString(),
    };
    const updatedNotifs = [newNotif, ...notifications];
    setNotifications(updatedNotifs);
    saveToStorage("pensionflow_notifications", updatedNotifs);

    // Push Notification (Director gets WhatsApp alert in simulation)
    triggerPushNotification(
      `🔔 Nuevo prospecto: ${newProspect.full_name} ha sido subido por Roberto Asesor. CURP: ${newProspect.curp}. Revisa en tu panel técnico.`,
      "whatsapp",
      "Eduardo Director"
    );

    return newProspect;
  };

  const deleteProspect = async (id: string): Promise<void> => {
    const target = prospects.find((p) => p.id === id);
    const updated = prospects.filter((p) => p.id !== id);
    setProspects(updated);
    saveToStorage("pensionflow_prospects", updated);

    if (target) {
      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Prospecto Eliminado",
        message: `El expediente de ${target.full_name} (NSS: ${target.nss}) fue eliminado permanentemente del pipeline.`,
        type: "warning",
        read: false,
        created_at: new Date().toISOString(),
      };
      const updatedNotifs = [newNotif, ...notifications];
      setNotifications(updatedNotifs);
      saveToStorage("pensionflow_notifications", updatedNotifs);
    }
  };

  const updateProspectStatus = async (
    id: string,
    newStatus: Prospect["status"],
    comments?: string
  ) => {
    const updated = prospects.map((p) => {
      if (p.id === id) {
        const notesDir = comments ? comments : p.notes_director;
        return {
          ...p,
          status: newStatus,
          notes_director: notesDir,
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    });

    setProspects(updated);
    saveToStorage("pensionflow_prospects", updated);

    const target = prospects.find((p) => p.id === id);
    if (target) {
      // Trigger Notification
      let notifTitle = "Actualización de Estatus";
      let notifMsg = `El caso de ${target.full_name} cambió al estado: ${newStatus}`;
      let toastMsg = "";

      if (newStatus === "rechazado") {
        notifTitle = "Expediente Rechazado ❌";
        notifMsg = `El director rechazó el caso de ${target.full_name}. Comentarios: ${comments || "Sin comentarios técnicos."}`;
        toastMsg = `⚠️ Estimado Roberto: Lamentamos informarte que el expediente de ${target.full_name} no cumple con los criterios técnicos requeridos. Motivo: ${comments || "Documentación inconsistente."}`;
      } else if (newStatus === "pagado_comision") {
        notifTitle = "¡Comisión Liberada! 💰✨";
        notifMsg = `Se liberó la comisión para ti por el proyecto de ${target.full_name}.`;
        toastMsg = `🎉 ¡Felicidades! Se ha liberado y transferido la comisión correspondiente al caso de ${target.full_name}. Ya puedes revisarla en tus estados financieros.`;
      } else if (newStatus === "firma_programada") {
        notifTitle = "Firma Programada ✍️";
        notifMsg = `La firma del financiamiento para ${target.full_name} ha sido programada.`;
        toastMsg = `📅 Notificación Oficial: Se programó la firma del convenio de financiamiento de ${target.full_name} para la siguiente semana. Mantente al pendiente del canal comercial.`;
      }

      if (notifTitle) {
        const newNotif: NotificationItem = {
          id: `notif-${Math.random().toString(36).substr(2, 9)}`,
          title: notifTitle,
          message: notifMsg,
          type: newStatus === "rechazado" ? "alert" : newStatus === "pagado_comision" ? "success" : "info",
          read: false,
          created_at: new Date().toISOString(),
        };
        const updatedNotifs = [newNotif, ...notifications];
        setNotifications(updatedNotifs);
        saveToStorage("pensionflow_notifications", updatedNotifs);
      }

      if (toastMsg) {
        triggerPushNotification(toastMsg, "whatsapp", target.phone);
      }
    }
  };

  const saveSimulation = async (
    id: string,
    simulationData: Omit<Simulation, "totalCredito" | "roiMonths">
  ) => {
    const totalCredito = simulationData.financiamiento + simulationData.costoGestion;
    const incremento = simulationData.pensionMejorada - simulationData.pensionActual;
    const roiMonths = incremento > 0 ? Math.ceil(totalCredito / incremento) : 0;

    const fullSimulation: Simulation = {
      ...simulationData,
      totalCredito,
      roiMonths,
    };

    const updated = prospects.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          status: "aprobado_listo" as const,
          simulation: fullSimulation,
          notes_director: simulationData.comments,
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    });

    setProspects(updated);
    saveToStorage("pensionflow_prospects", updated);

    const target = prospects.find((p) => p.id === id);
    if (target) {
      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Dictamen Emitido (Aprobado) ✅",
        message: `El Director Eduardo emitió el dictamen financiero para ${target.full_name}. Pensión Mejorada: $${simulationData.pensionMejorada.toLocaleString()}/mes.`,
        type: "success",
        read: false,
        created_at: new Date().toISOString(),
      };
      const updatedNotifs = [newNotif, ...notifications];
      setNotifications(updatedNotifs);
      saveToStorage("pensionflow_notifications", updatedNotifs);

      // Notify Ally via simulated WhatsApp
      triggerPushNotification(
        `📈 ¡Gran oportunidad, Roberto! El director Eduardo aprobó la simulación para ${target.full_name}. Pensión actual: $${simulationData.pensionActual.toLocaleString()} ➡️ Pensión Mejorada: $${simulationData.pensionMejorada.toLocaleString()}. Financiamiento: $${simulationData.financiamiento.toLocaleString()}. ¡Ingresa ya para presentar y agendar la asesoría!`,
        "whatsapp",
        "Roberto Asesor"
      );
    }
  };

  const scheduleAssessment = async (id: string, date: string, time: string) => {
    const updated = prospects.map((p) => {
      if (p.id === id) {
        return {
          ...p,
          status: "asesoria_agendada" as const,
          updated_at: new Date().toISOString(),
        };
      }
      return p;
    });

    setProspects(updated);
    saveToStorage("pensionflow_prospects", updated);

    const target = prospects.find((p) => p.id === id);
    if (target) {
      const newNotif: NotificationItem = {
        id: `notif-${Math.random().toString(36).substr(2, 9)}`,
        title: "Asesoría Agendada 📅",
        message: `El aliado Roberto agendó la asesoría de presentación para ${target.full_name} el día ${date} a las ${time} hrs.`,
        type: "info",
        read: false,
        created_at: new Date().toISOString(),
      };
      const updatedNotifs = [newNotif, ...notifications];
      setNotifications(updatedNotifs);
      saveToStorage("pensionflow_notifications", updatedNotifs);

      // Toast Notification
      triggerPushNotification(
        `✉️ Confirmación de Asesoría: Se ha enviado un correo electrónico a ${target.email} con la invitación de zoom de Calendly para el ${date} a las ${time} y se notificó al Director Eduardo de Operaciones.`,
        "email",
        target.full_name
      );
    }
  };

  const generateInvitationCode = async (): Promise<InvitationCode> => {
    const randomHex = Math.random().toString(16).substr(2, 4).toUpperCase();
    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const newCodeString = `AL-2026-${randomHex}${randomDigits}`;

    const newCode: InvitationCode = {
      id: `code-${Math.random().toString(36).substr(2, 9)}`,
      code: newCodeString,
      created_by: user?.id || "director-456",
      is_used: false,
      created_at: new Date().toISOString(),
    };

    const updated = [newCode, ...invitationCodes];
    setInvitationCodes(updated);
    saveToStorage("pensionflow_invitation_codes", updated);

    return newCode;
  };

  const createProfile = async (
    profileData: Omit<UserProfile, "id" | "created_at">
  ): Promise<UserProfile> => {
    const newProfile: UserProfile = {
      ...profileData,
      id: `user-${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
    };

    const updated = [...profiles, newProfile];
    setProfiles(updated);
    saveToStorage("pensionflow_profiles", updated);

    // Create system notification
    const newNotif: NotificationItem = {
      id: `notif-${Math.random().toString(36).substr(2, 9)}`,
      title: "Nuevo Usuario Registrado 👤",
      message: `Se ha registrado exitosamente a ${newProfile.full_name} con el rol de ${newProfile.role === "director" ? "Director de Operaciones" : "Aliado Comercial"}.`,
      type: "success",
      read: false,
      created_at: new Date().toISOString(),
    };
    const updatedNotifs = [newNotif, ...notifications];
    setNotifications(updatedNotifs);
    saveToStorage("pensionflow_notifications", updatedNotifs);

    // Simulated email push
    triggerPushNotification(
      `👤 Registro Completo: Se registró el usuario ${newProfile.full_name} (${newProfile.role === "director" ? "Director" : "Aliado"}). Puede iniciar sesión con su correo: ${newProfile.email}`,
      "email",
      "Eduardo Director"
    );

    return newProfile;
  };

  const markNotificationRead = (id: string) => {
    const updated = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    setNotifications(updated);
    saveToStorage("pensionflow_notifications", updated);
  };

  const markAllNotificationsRead = () => {
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    saveToStorage("pensionflow_notifications", updated);
  };

  const clearToast = () => {
    setToast(null);
  };

  const triggerPushNotification = (message: string, type: "whatsapp" | "email", recipient: string) => {
    setToast({
      id: `toast-${Date.now()}`,
      message,
      type,
      recipient,
    });
  };

  return (
    <AppContext.Provider
      value={{
        user,
        activeRole,
        prospects,
        invitationCodes,
        notifications,
        profiles,
        toast,
        isDemoMode,
        isLoading,
        login,
        logout,
        switchRole,
        addProspect,
        deleteProspect,
        updateProspectStatus,
        saveSimulation,
        scheduleAssessment,
        generateInvitationCode,
        createProfile,
        markNotificationRead,
        markAllNotificationsRead,
        clearToast,
        triggerPushNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppContextProvider");
  }
  return context;
}
