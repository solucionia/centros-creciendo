import AppointmentBooking from "@/components/AppointmentBooking";
import { useQuery } from "@tanstack/react-query";
import type { Doctor } from "@shared/schema";

export default function Home() {
  const { data: doctors, isLoading, error } = useQuery({
    queryKey: ['/api/doctors'],
    queryFn: async (): Promise<Doctor[]> => {
      const response = await fetch('/api/doctors');
      if (!response.ok) {
        throw new Error('Failed to fetch doctors');
      }
      return response.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Cargando médicos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600">Error al cargar los médicos</p>
          <p className="text-sm text-muted-foreground">Por favor, intenta recargar la página</p>
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