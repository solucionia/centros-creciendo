import AppointmentBooking from "@/components/AppointmentBooking";
import { useDriCloudDoctors } from "@/hooks/use-dricloud";
import type { Doctor } from "@shared/schema";

export default function Home() {
  const { data: doctors, isLoading, error } = useDriCloudDoctors();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Conectando con DriCloud...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive font-semibold">Error al conectar con DriCloud</p>
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Error desconocido'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover-elevate active-elevate-2"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!doctors || doctors.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No hay médicos disponibles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AppointmentBooking doctors={doctors} />
      </div>
    </div>
  );
}