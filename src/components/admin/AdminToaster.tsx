"use client";

import { Toaster } from "sonner";
import { useTheme } from "../site/ThemeToggle";

export function AdminToaster() {
  const theme = useTheme();
  return <Toaster theme={theme ?? "light"} position="top-center" richColors closeButton />;
}
