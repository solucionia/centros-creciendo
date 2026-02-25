import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Hook para obtener doctores de DriCloud - sin caché para datos siempre frescos
export function useDriCloudDoctors() {
  return useQuery({
    queryKey: ['/api/dricloud/doctors'],
    queryFn: async () => {
      const response = await fetch('/api/dricloud/doctors', {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Error al cargar los doctores');
      }
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
  });
}

// Hook para obtener estado de conexión DriCloud
export function useDriCloudStatus() {
  return useQuery({
    queryKey: ['/api/dricloud/status'],
    queryFn: async () => {
      const response = await fetch('/api/dricloud/status', {
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
    refetchInterval: 60000, // Verificar cada 60 segundos
  });
}

// Hook para obtener disponibilidad
export function useDriCloudAvailability(doctorId: string, fecha: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ['/api/dricloud/availability', doctorId, fecha],
    queryFn: async () => {
      const response = await fetch(
        `/api/dricloud/availability?doctorId=${doctorId}&fecha=${fecha}&diasRecuperar=7`,
        { cache: 'no-store' }
      );
      if (!response.ok) {
        throw new Error('Error al cargar la disponibilidad');
      }
      return response.json();
    },
    staleTime: 0,
    gcTime: 0,
    enabled,
  });
}

// Hook para forzar reconexión con DriCloud
export function useRefreshDriCloud() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/dricloud/refresh', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Error al reconectar');
      }
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidar toda la caché de DriCloud para forzar recarga
      queryClient.invalidateQueries({ queryKey: ['/api/dricloud'] });
      queryClient.removeQueries({ queryKey: ['/api/dricloud'] });

      toast({
        title: data.isDemoMode ? 'Suscripción no activa' : '¡Conectado a DriCloud!',
        description: data.message,
        variant: data.isDemoMode ? 'destructive' : 'default',
      });
    },
    onError: () => {
      toast({
        title: 'Error al reconectar',
        description: 'No se pudo reconectar con DriCloud. Inténtalo de nuevo.',
        variant: 'destructive',
      });
    },
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
      specialtyName?: string;
      notes?: string;
    }) => {
      const response = await fetch('/api/dricloud/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        title: 'Cita creada exitosamente',
        description: 'La cita ha sido reservada en el sistema DriCloud.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al crear la cita',
        description: error.message,
        variant: 'destructive',
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
        title: 'Cita cancelada',
        description: 'La cita ha sido cancelada exitosamente.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al cancelar la cita',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
