import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Hook para obtener doctores de DriCloud
export function useDriCloudDoctors() {
  return useQuery({
    queryKey: ['/api/dricloud/doctors'],
    queryFn: async () => {
      const response = await fetch('/api/dricloud/doctors');
      if (!response.ok) {
        throw new Error('Error al cargar los doctores');
      }
      return response.json();
    },
  });
}

// Hook para obtener disponibilidad
export function useDriCloudAvailability(doctorId: string, fecha: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['/api/dricloud/availability', doctorId, fecha],
    queryFn: async () => {
      const response = await fetch(`/api/dricloud/availability?doctorId=${doctorId}&fecha=${fecha}&diasRecuperar=7`);
      if (!response.ok) {
        throw new Error('Error al cargar la disponibilidad');
      }
      return response.json();
    },
    enabled,
  });
}

// Hook para crear cita en DriCloud
export function useCreateDriCloudAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (appointmentData: {
      doctorId: string;
      patientName: string;
      patientEmail: string;
      patientPhone: string;
      patientAge: number;
      appointmentDate: string;
      notes?: string;
    }) => {
      const response = await fetch('/api/dricloud/appointments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(appointmentData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al crear la cita');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dricloud/availability'] });
      toast({
        title: "Cita creada exitosamente",
        description: "La cita ha sido reservada en el sistema DriCloud.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al crear la cita",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

// Hook para cancelar cita en DriCloud
export function useCancelDriCloudAppointment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (citaId: number) => {
      const response = await fetch(`/api/dricloud/appointments/${citaId}/cancel`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al cancelar la cita');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dricloud/availability'] });
      toast({
        title: "Cita cancelada",
        description: "La cita ha sido cancelada exitosamente.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error al cancelar la cita",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
