"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquare, X, Send, ChevronLeft, Link2, Users, Search } from "lucide-react";
import { useApp, isProspectDeleted, Prospect } from "@/utils/context/AppContext";
import { createClient } from "@/utils/supabase/client";

// Mensaje directo persona ↔ persona (misma forma en BD y en localStorage/demo).
interface DirectMessage {
  id: string;
  sender_id: string | null;
  sender_name: string;
  sender_role: string;
  recipient_id: string;
  recipient_name: string;
  recipient_role: string;
  prospect_id: string | null;
  prospect_name: string | null;
  text: string;
  read: boolean;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
  role: string;
  hint: string;
}

const LS_KEY = "pp_dm";
const SELECT_COLS =
  "id, sender_id, sender_name, sender_role, recipient_id, recipient_name, recipient_role, prospect_id, prospect_name, text, read, created_at";

const roleHint = (role: string, aliadoTipo?: string) =>
  role === "director"
    ? "Dirección"
    : role === "account_manager"
    ? "Account Manager"
    : role === "finanzas"
    ? "Finanzas"
    : role === "closer"
    ? "Closer"
    : aliadoTipo === "lider"
    ? "Líder de grupo"
    : "Aliado";

// Normaliza para búsqueda tolerante a mayúsculas y acentos (nombres en español).
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const roleAccent = (role: string) =>
  role === "director"
    ? "bg-teal-500"
    : role === "account_manager"
    ? "bg-blue-500"
    : role === "finanzas"
    ? "bg-amber-500"
    : "bg-emerald-500";

export default function GlobalChat() {
  const { user, messagingContacts, prospects, isDemoMode } = useApp();
  const pathname = usePathname() || "";

  const [open, setOpen] = useState(false);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [input, setInput] = useState("");
  const [refProspectId, setRefProspectId] = useState<string>("");
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Proyecto de la página actual (/prospectos/<id>) para pre-seleccionar la referencia.
  const pageProspectId = useMemo(() => {
    const m = pathname.match(/^\/prospectos\/([^/?#]+)/);
    return m ? m[1] : null;
  }, [pathname]);

  // Proyectos que se pueden referir: los que el usuario ya ve en su contexto (filtrados por rol).
  const referableProspects = useMemo(
    () => (prospects || []).filter((p) => !isProspectDeleted(p)),
    [prospects]
  );

  // Contactos según rol (aliado ↔ su AM + directores; AM ↔ sus aliados + directores;
  // director ↔ todos) resueltos en el contexto como `messagingContacts`. Aquí solo se
  // mapean a la forma del chat y se ordenan por nombre.
  const contacts = useMemo<Contact[]>(() => {
    const seen = new Set<string>();
    return (messagingContacts || [])
      .filter((p) => p && !seen.has(p.id) && seen.add(p.id))
      .map((p) => ({ id: p.id, name: p.full_name, role: p.role, hint: roleHint(p.role, p.aliado_tipo) }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [messagingContacts]);

  // Filtro del buscador: por nombre o rol, tolerante a mayúsculas y acentos.
  const filteredContacts = useMemo<Contact[]>(() => {
    const q = norm(search.trim());
    if (!q) return contacts;
    return contacts.filter((c) => norm(c.name).includes(q) || norm(c.hint).includes(q));
  }, [contacts, search]);

  // ---- Carga de mensajes ---------------------------------------------------
  const loadFromLocal = useCallback(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const all: DirectMessage[] = raw ? JSON.parse(raw) : [];
      setMessages(user ? all.filter((m) => m.sender_id === user.id || m.recipient_id === user.id) : []);
    } catch {
      setMessages([]);
    }
  }, [user]);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    if (isDemoMode) {
      loadFromLocal();
      return;
    }
    try {
      const supabase = createClient();
      let data: any[] | null = null;
      let error: any = null;
      ({ data, error } = await supabase
        .from("direct_messages")
        .select(SELECT_COLS)
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: true }));
      if (error) {
        // prospect_* podría no estar migrado — reintentar con columnas base.
        ({ data, error } = await supabase
          .from("direct_messages")
          .select("id, sender_id, sender_name, sender_role, recipient_id, recipient_name, recipient_role, text, read, created_at")
          .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
          .order("created_at", { ascending: true }));
      }
      if (error) throw error;
      setMessages(
        (data || []).map((m: any) => ({
          id: m.id,
          sender_id: m.sender_id ?? null,
          sender_name: m.sender_name,
          sender_role: m.sender_role,
          recipient_id: m.recipient_id,
          recipient_name: m.recipient_name,
          recipient_role: m.recipient_role,
          prospect_id: m.prospect_id ?? null,
          prospect_name: m.prospect_name ?? null,
          text: m.text,
          read: !!m.read,
          created_at: m.created_at,
        }))
      );
    } catch {
      // Tabla no migrada aún o error transitorio — trabajar con el registro local.
      loadFromLocal();
    }
  }, [user, isDemoMode, loadFromLocal]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime: refleja en vivo los mensajes de otros (RLS ya limita a mis filas).
  useEffect(() => {
    if (isDemoMode || !user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`direct_messages_${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => loadMessages()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isDemoMode, loadMessages]);

  // ---- Agrupación y no leídos ----------------------------------------------
  const otherId = useCallback((m: DirectMessage) => (m.sender_id === user?.id ? m.recipient_id : m.sender_id) || "", [user]);

  const conversation = useMemo(
    () => (activeContactId ? messages.filter((m) => otherId(m) === activeContactId) : []),
    [messages, activeContactId, otherId]
  );

  const unreadByContact = useMemo(() => {
    const map: Record<string, number> = {};
    if (!user) return map;
    messages.forEach((m) => {
      if (m.recipient_id === user.id && !m.read && m.sender_id) {
        map[m.sender_id] = (map[m.sender_id] || 0) + 1;
      }
    });
    return map;
  }, [messages, user]);

  const totalUnread = useMemo(
    () => Object.values(unreadByContact).reduce((a, b) => a + b, 0),
    [unreadByContact]
  );

  const lastByContact = useMemo(() => {
    const map: Record<string, DirectMessage> = {};
    messages.forEach((m) => {
      const id = otherId(m);
      if (!map[id] || new Date(m.created_at) > new Date(map[id].created_at)) map[id] = m;
    });
    return map;
  }, [messages, otherId]);

  // Marcar como leídos al abrir una conversación.
  const markRead = useCallback(async (contactId: string) => {
    if (!user) return;
    const hasUnread = messages.some((m) => m.recipient_id === user.id && m.sender_id === contactId && !m.read);
    if (!hasUnread) return;
    setMessages((prev) =>
      prev.map((m) => (m.recipient_id === user.id && m.sender_id === contactId ? { ...m, read: true } : m))
    );
    if (isDemoMode) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        const all: DirectMessage[] = raw ? JSON.parse(raw) : [];
        localStorage.setItem(
          LS_KEY,
          JSON.stringify(all.map((m) => (m.recipient_id === user.id && m.sender_id === contactId ? { ...m, read: true } : m)))
        );
      } catch {}
      return;
    }
    try {
      const supabase = createClient();
      await supabase
        .from("direct_messages")
        .update({ read: true })
        .eq("recipient_id", user.id)
        .eq("sender_id", contactId)
        .eq("read", false);
    } catch {}
  }, [user, messages, isDemoMode]);

  const openConversation = (contactId: string) => {
    setActiveContactId(contactId);
    setRefProspectId(pageProspectId && referableProspects.some((p) => p.id === pageProspectId) ? pageProspectId : "");
    markRead(contactId);
  };

  // Auto-scroll al último mensaje al abrir/actualizar la conversación.
  useEffect(() => {
    if (open && activeContactId && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation.length, open, activeContactId]);

  // ---- Envío ---------------------------------------------------------------
  const persistLocal = (msg: DirectMessage) => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const all: DirectMessage[] = raw ? JSON.parse(raw) : [];
      localStorage.setItem(LS_KEY, JSON.stringify([...all, msg]));
    } catch {}
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !user || !activeContactId) return;
    const contact = contacts.find((c) => c.id === activeContactId);
    if (!contact) return;
    const refProspect = refProspectId ? referableProspects.find((p) => p.id === refProspectId) : null;

    const localMsg: DirectMessage = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      sender_id: user.id,
      sender_name: user.full_name,
      sender_role: user.role,
      recipient_id: contact.id,
      recipient_name: contact.name,
      recipient_role: contact.role,
      prospect_id: refProspect?.id ?? null,
      prospect_name: refProspect?.full_name ?? null,
      text,
      read: false,
      created_at: new Date().toISOString(),
    };

    // Optimista: aparece de inmediato y se limpia el compositor.
    setMessages((prev) => [...prev, localMsg]);
    setInput("");

    if (isDemoMode) {
      persistLocal(localMsg);
      return;
    }

    try {
      const supabase = createClient();
      const base = {
        sender_id: user.id,
        sender_name: user.full_name,
        sender_role: user.role,
        recipient_id: contact.id,
        recipient_name: contact.name,
        recipient_role: contact.role,
        text,
      };
      const payload = refProspect
        ? { ...base, prospect_id: refProspect.id, prospect_name: refProspect.full_name }
        : base;
      let { error } = await supabase.from("direct_messages").insert(payload);
      if (error && refProspect) {
        // prospect_* podría no estar migrado — enviar el mensaje sin la referencia.
        ({ error } = await supabase.from("direct_messages").insert(base));
      }
      if (error) throw error;
      loadMessages();
    } catch {
      // Tabla no migrada / error transitorio — conservar el mensaje localmente.
      persistLocal(localMsg);
    }
  };

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const time = d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    if (sameDay) return `Hoy · ${time}`;
    return `${d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })} · ${time}`;
  };

  // No mostrar en pantallas sin sesión.
  const hiddenRoute = /^\/(login|register|update-password)(\/|$)/.test(pathname);
  if (!user || hiddenRoute) return null;

  const activeContact = activeContactId ? contacts.find((c) => c.id === activeContactId) : null;

  return (
    <>
      {open && (
        <div className="fixed z-50 inset-x-3 bottom-24 sm:inset-x-auto sm:right-6 sm:bottom-24 sm:w-[380px] h-[68vh] sm:h-[560px] max-h-[calc(100vh-140px)] bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-fade-in">
          {/* Encabezado */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 bg-gradient-to-r from-blue-500 to-indigo-600">
            {activeContact ? (
              <button
                onClick={() => setActiveContactId(null)}
                className="h-8 w-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
                title="Volver a contactos"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <div className="h-8 w-8 rounded-xl bg-white/15 text-white flex items-center justify-center shrink-0">
                <MessageSquare className="h-4 w-4" strokeWidth={2.2} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-white tracking-tight leading-none truncate">
                {activeContact ? activeContact.name : "Mensajes"}
              </h3>
              <p className="text-[10px] text-white/70 font-semibold mt-1 leading-none truncate">
                {activeContact ? activeContact.hint : "Conversaciones con tu equipo"}
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-lg text-white/80 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors shrink-0"
              title="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!activeContact ? (
            // ---- Lista de contactos ----
            <div className="flex-1 flex flex-col min-h-0 bg-slate-50/40 dark:bg-slate-950/20">
              {/* Buscador: aparece cuando hay bastantes contactos (director/AM). */}
              {contacts.length > 5 && (
                <div className="p-2.5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0 bg-white dark:bg-slate-900">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar contacto…"
                      className="w-full bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl pl-8 pr-8 py-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-medium outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-5 w-5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
                        title="Limpiar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto no-scrollbar">
              {contacts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10 text-slate-400 dark:text-slate-500">
                  <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                    <Users className="h-5 w-5" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Sin contactos disponibles</p>
                  <p className="text-[10px] font-medium mt-1 leading-relaxed">Aún no tienes a nadie con quien conversar.</p>
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4 py-10 text-slate-400 dark:text-slate-500">
                  <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                    <Search className="h-5 w-5" />
                  </div>
                  <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Sin resultados</p>
                  <p className="text-[10px] font-medium mt-1 leading-relaxed">Nadie coincide con «{search.trim()}».</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredContacts.map((c) => {
                    const last = lastByContact[c.id];
                    const unread = unreadByContact[c.id] || 0;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => openConversation(c.id)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white dark:hover:bg-slate-850/60 transition-colors"
                        >
                          <span className={`h-9 w-9 rounded-full ${roleAccent(c.role)} text-white flex items-center justify-center text-[12px] font-black shrink-0`}>
                            {c.name.charAt(0).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[12px] font-black text-slate-700 dark:text-slate-200 truncate">{c.name}</span>
                              <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 shrink-0">{c.hint}</span>
                            </div>
                            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 truncate mt-0.5">
                              {last ? (last.sender_id === user.id ? "Tú: " : "") + last.text : "Iniciar conversación"}
                            </p>
                          </div>
                          {unread > 0 && (
                            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center tabular-nums shrink-0">
                              {unread}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              </div>
            </div>
          ) : (
            // ---- Conversación ----
            <div className="flex-1 flex flex-col min-h-0">
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3.5 bg-slate-50/40 dark:bg-slate-950/20 no-scrollbar">
                {conversation.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-3 py-10 text-slate-400 dark:text-slate-500">
                    <div className="h-11 w-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Sin mensajes aún</p>
                    <p className="text-[10px] font-medium mt-1 leading-relaxed">Escribe el primer mensaje. Puedes referir un proyecto o dejarlo sin referencia.</p>
                  </div>
                ) : (
                  conversation.map((m) => {
                    const mine = m.sender_id === user.id;
                    return (
                      <div key={m.id} className={`flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`h-1.5 w-1.5 rounded-full ${roleAccent(m.sender_role)}`} />
                          <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{mine ? "Tú" : m.sender_name}</span>
                          <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">{fmtDateTime(m.created_at)}</span>
                        </div>
                        <div className={`rounded-2xl ${mine ? "rounded-tr-sm bg-blue-500 text-white" : "rounded-tl-sm bg-white dark:bg-slate-850/70 border border-slate-150 dark:border-slate-800 text-slate-700 dark:text-slate-200"} px-3 py-2 text-[11px] font-medium leading-relaxed whitespace-pre-wrap break-words shadow-sm max-w-[85%]`}>
                          {m.prospect_name && (
                            <span className={`inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wide rounded-md px-1.5 py-0.5 mb-1.5 leading-none ${mine ? "bg-white/20 text-white" : "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"}`}>
                              <Link2 className="h-2.5 w-2.5" /> {m.prospect_name}
                            </span>
                          )}
                          <div>{m.text}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Compositor */}
              <div className="p-2.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0">
                {referableProspects.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <Link2 className="h-3 w-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <select
                      value={refProspectId}
                      onChange={(e) => setRefProspectId(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all cursor-pointer"
                    >
                      <option value="">Sin referir proyecto</option>
                      {referableProspects.map((p: Prospect) => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    placeholder={`Mensaje para ${activeContact.name}…`}
                    className="flex-1 resize-none bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-750 rounded-xl px-3 py-2 text-[11px] font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all max-h-24"
                  />
                  <button
                    onClick={send}
                    disabled={!input.trim()}
                    className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white flex items-center justify-center shadow-sm shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    title="Enviar (Enter)"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-[8px] text-slate-400 dark:text-slate-600 font-semibold mt-1.5 px-1 leading-tight">
                  Queda registrado con fecha y hora. Solo tú y {activeContact.name} ven esta conversación.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed z-50 right-5 bottom-5 h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white flex items-center justify-center shadow-2xl shadow-blue-500/30 transition-all active:scale-95"
        title="Mensajes"
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
        {!open && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white dark:border-slate-900 tabular-nums">
            {totalUnread}
          </span>
        )}
      </button>
    </>
  );
}
