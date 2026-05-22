"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, TrendingUp, ShieldAlert, Award, FileSpreadsheet, Users, Heart } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-teal-950 to-teal-900 text-white overflow-hidden relative selection:bg-emerald-500 selection:text-white">
      {/* Dynamic Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-teal-500/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between border-b border-white/5 relative z-10">
        <div className="flex items-center gap-2.5">
          <Heart className="h-8 w-8 text-emerald-400 fill-emerald-400/20" strokeWidth={2.5} />
          <div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              Pensión Perfecta
            </span>
            <span className="block text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              Financiamiento B2B
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 hover:border-white/20 rounded-xl text-sm font-semibold transition-all"
          >
            Acceso Directo
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 pt-20 pb-24 relative z-10 flex flex-col items-center text-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-8 animate-fade-in shadow-inner">
          <Award className="h-3.5 w-3.5" />
          Plataforma Profesional Ley 73
        </span>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-none max-w-4xl">
          Optimiza la Asesoría de Pensiones{" "}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
            sin fricción operativa
          </span>
        </h1>

        <p className="mt-8 text-base md:text-xl text-slate-400 max-w-2xl leading-relaxed">
          Pensión Perfecta centraliza la carga de prospectos, la simulación técnica Ley 73, el agendamiento integrado y el control visual del pipeline en un solo lugar.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center gap-4">
          <Link
            href="/login"
            className="group px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-2xl text-base font-bold shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2 hover:scale-[1.02]"
          >
            Ingresar al Portal
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="mt-28 grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          {/* Card 1 */}
          <div className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-3xl p-8 hover:bg-white/[0.04] hover:border-white/10 transition-all text-left relative group">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition-transform">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Aliado Comercial</h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Formulario ágil para registrar prospectos con validación de NSS y CURP, carga de documentos y visor de comisiones en tiempo real.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-3xl p-8 hover:bg-white/[0.04] hover:border-white/10 transition-all text-left relative group">
            <div className="h-12 w-12 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 mb-6 group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Simulador Ley 73</h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Cálculo inmediato de pensión mejorada, total a financiar, costo de gestión y el retorno de inversión (ROI) automático en meses.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white/[0.02] backdrop-blur-md border border-white/5 rounded-3xl p-8 hover:bg-white/[0.04] hover:border-white/10 transition-all text-left relative group">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-white">Director de Operaciones</h3>
            <p className="mt-3 text-sm text-slate-400 leading-relaxed">
              Pipeline visual de 8 etapas para gestionar casos de forma ágil, autorizar montos de financiamiento y liberar comisiones.
            </p>
          </div>
        </div>

        {/* Workflow Showcase */}
        <div className="mt-28 bg-white/[0.01] backdrop-blur-md border border-white/5 rounded-[32px] p-8 md:p-12 w-full text-left relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold leading-tight">
                Control Operativo Extremo <br />
                <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                  en 8 etapas clave
                </span>
              </h2>
              <p className="mt-4 text-slate-400 text-sm md:text-base leading-relaxed">
                Supervisa el estatus de los proyectos desde la documentación inicial y simulación hasta la asesoría, el análisis de riesgos técnicos y la liberación de la comisión.
              </p>
              
              <div className="mt-8 space-y-3.5">
                {[
                  "Filtros de privacidad RLS integrados por rol",
                  "Automatización de notificaciones vía WhatsApp y Email",
                  "Módulo de agendamiento simplificado e interactivo",
                  "Visualización instantánea de simulaciones matemáticas"
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/80 border border-white/5 rounded-2xl p-6 shadow-2xl relative">
              <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500" />
                  <div className="h-3 w-3 rounded-full bg-green-500" />
                </div>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Pensión Perfecta Console</span>
              </div>
              <div className="space-y-4">
                <div className="bg-white/5 border border-white/5 rounded-xl p-4">
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                    <span>Expediente: Juan Pérez</span>
                    <span className="text-amber-400">En Evaluación</span>
                  </div>
                  <div className="mt-2 text-sm font-bold text-white">$450,000 MXN Financiamiento</div>
                  <div className="mt-1 text-xs text-slate-400">Semanas IMSS: 1,420 • AFORE: Validada</div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl p-4">
                  <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
                    <span>Expediente: Norberto Javier</span>
                    <span className="text-emerald-400">Listo para Presentar</span>
                  </div>
                  <div className="mt-2 text-sm font-bold text-white">ROI: 19 Meses • Pensión +330%</div>
                  <div className="mt-1 text-xs text-slate-400">Simulación Ley 73 emitida y validada comercialmente</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
