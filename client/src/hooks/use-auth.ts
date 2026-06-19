import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ─── Estado de la sesión ──────────────────────────────────────────────────────
export interface AuthStatus {
  authenticated: boolean;
  phone?: string;
}

export function useAuthStatus() {
  return useQuery<AuthStatus>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return { authenticated: false };
      return res.json();
    },
    staleTime: 0,
  });
}

// ─── Solicitar OTP ──────────────────────────────────────────────────────────────
export function useRequestOtp() {
  return useMutation({
    mutationFn: async (phoneNumber: string) => {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "No se pudo enviar el código.");
      }
      return data;
    },
  });
}

// ─── Verificar OTP ──────────────────────────────────────────────────────────────
// Error enriquecido con attemptsLeft para informar al usuario.
export type VerifyError = Error & { attemptsLeft?: number };

export function useVerifyOtp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { phoneNumber: string; otp: string }) => {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || "Código incorrecto.") as VerifyError;
        err.attemptsLeft = data.attemptsLeft;
        throw err;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

// ─── Logout ──────────────────────────────────────────────────────────────────────
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
      return res.json().catch(() => ({}));
    },
    onSuccess: () => {
      // Vaciar la caché para no dejar datos de citas de la sesión anterior.
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}
