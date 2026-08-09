import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppContextProvider } from "@/utils/context/AppContext";
import ToastSimulator from "@/components/ToastSimulator";
import GlobalChat from "@/components/GlobalChat";
import BankingReminder from "@/components/BankingReminder";
import ActividadTracker from "@/components/ActividadTracker";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Pensión Perfecta - Asesoría y Financiamiento Ley 73",
  description: "Gestión comercial y operativa de pensiones para aliados y directores",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body className={`${inter.className} antialiased text-slate-900 bg-slate-50`}>
        <AppContextProvider>
          {children}
          <ToastSimulator />
          <GlobalChat />
          {/* Recordatorio de datos de cobro: una vez por inicio de sesión,
              mientras el usuario no tenga registrado cómo se le paga. */}
          <BankingReminder />
          {/* Mide el tiempo y la actividad del Account Manager para el reporte
              de gestión. No pinta nada y solo actúa para ese rol. */}
          <ActividadTracker />
        </AppContextProvider>
      </body>
    </html>
  );
}
