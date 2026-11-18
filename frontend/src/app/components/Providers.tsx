"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import { ToastProvider } from "../components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <ToastProvider>{children}</ToastProvider>
    </LazyMotion>
  );
}