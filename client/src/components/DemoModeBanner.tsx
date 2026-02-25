import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useDriCloudStatus, useRefreshDriCloud } from "@/hooks/use-dricloud";

export function DemoModeBanner() {
  const { data: status } = useDriCloudStatus();
  const refreshMutation = useRefreshDriCloud();

  // No mostrar nada mientras carga
  if (!status) return null;

  // Si está conectado a DriCloud real, mostrar banner verde brevemente
  if (!status.isDemoMode) {
    return (
      <Alert className="mb-4 border-green-500/50 bg-green-50 dark:bg-green-950/20" data-testid="banner-connected">
        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          <strong>Conectado a DriCloud:</strong> Los datos son reales y las citas se sincronizan en tiempo real.
        </AlertDescription>
      </Alert>
    );
  }

  // Modo demo - suscripción no activa
  return (
    <Alert className="mb-4 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" data-testid="banner-demo-mode">
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 mt-0.5 shrink-0" />
      <AlertDescription className="text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-3">
        <span>
          <strong>Modo Demostración:</strong> Suscripción DriCloud no activa. Las citas no se sincronizan con DriCloud.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-600 text-amber-800 dark:text-amber-200 shrink-0"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          <RefreshCw className={`h-3 w-3 mr-1 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          {refreshMutation.isPending ? 'Reconectando...' : 'Reconectar'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
