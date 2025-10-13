import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";

interface DriCloudStatus {
  isDemoMode: boolean;
  message: string;
  error?: string;
}

export function DemoModeBanner() {
  const { data: status, isError } = useQuery<DriCloudStatus>({
    queryKey: ['/api/dricloud/status'],
    refetchInterval: 30000, // Verificar cada 30 segundos
    retry: 3,
  });

  // No mostrar banner si hay error de conexión (no es error de suscripción)
  if (isError || !status) {
    return null;
  }

  // Solo mostrar banner si estamos confirmadamente en modo demo
  if (!status.isDemoMode) {
    return null;
  }

  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" data-testid="banner-demo-mode">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        <strong>Modo Demostración:</strong> La suscripción de DriCloud WebAPI no está activa. 
        Las citas se guardan localmente y no se sincronizan con DriCloud. 
        Contacte con soporte DriCloud para activar la suscripción.
      </AlertDescription>
    </Alert>
  );
}
