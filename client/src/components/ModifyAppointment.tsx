import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, User, Clock, Save, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { AppointmentWithDoctor } from "@shared/schema";

interface ModifyAppointmentProps {
  onBack: () => void;
}

export default function ModifyAppointment({ onBack }: ModifyAppointmentProps) {
  const [searchEmail, setSearchEmail] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDoctor | undefined>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: appointments, isLoading, refetch } = useQuery({
    queryKey: ['/api/appointments'],
    queryFn: async (): Promise<AppointmentWithDoctor[]> => {
      const response = await fetch('/api/appointments');
      if (!response.ok) {
        throw new Error('Error al cargar las citas');
      }
      return response.json();
    },
  });

  // Form schema for updating appointments
  const updateAppointmentSchema = z.object({
    patientName: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    patientEmail: z.string().email("Email inválido"),
    patientPhone: z.string().min(10, "Número de teléfono inválido"),
    patientAge: z.coerce.number().min(1, "Edad debe ser mayor a 0").max(120, "Edad debe ser menor a 120"),
    notes: z.string().optional(),
  });

  type UpdateAppointmentData = z.infer<typeof updateAppointmentSchema>;

  const updateMutation = useMutation({
    mutationFn: async ({ appointmentId, data }: { appointmentId: string; data: UpdateAppointmentData }) => {
      const response = await fetch(`/api/appointments/${appointmentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Error al actualizar la cita');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({
        title: "Cita actualizada",
        description: "La cita ha sido actualizada exitosamente.",
      });
      setSelectedAppointment(undefined);
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al actualizar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (appointmentId: string) => {
      const response = await fetch(`/api/appointments/${appointmentId}/cancel`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Error al cancelar la cita');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({
        title: "Cita cancelada",
        description: "La cita ha sido cancelada exitosamente.",
      });
      setSelectedAppointment(undefined);
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredAppointments = appointments?.filter(appointment => 
    appointment.patientEmail.toLowerCase().includes(searchEmail.toLowerCase()) &&
    appointment.status === 'scheduled'
  ) || [];

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSpecialtyLabel = (specialty: string) => {
    switch (specialty.toLowerCase()) {
      case 'pediatric':
        return 'Pediatría';
      case 'adult':
        return 'Medicina General';
      case 'family':
        return 'Medicina Familiar';
      default:
        return specialty;
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Search className="h-5 w-5 text-primary" />
          <span>Modificar Cita</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Search Section */}
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Buscar por email del paciente
              </label>
              <Input
                type="email"
                placeholder="ejemplo@email.com"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
                data-testid="input-search-email"
              />
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline"
                onClick={onBack}
                data-testid="button-back-modify"
              >
                Volver
              </Button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        {isLoading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Cargando citas...</p>
          </div>
        )}

        {!isLoading && searchEmail && filteredAppointments.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No se encontraron citas para este email.</p>
          </div>
        )}

        {!isLoading && filteredAppointments.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Citas encontradas:</h3>
            {filteredAppointments.map((appointment) => (
              <Card key={appointment.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Dr. {appointment.doctor.name}</span>
                      </div>
                      <Badge>{getSpecialtyLabel(appointment.doctor.specialty)}</Badge>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-1">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(appointment.appointmentDate.toString())}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Clock className="h-4 w-4" />
                        <span>{formatTime(appointment.appointmentDate.toString())}</span>
                      </div>
                    </div>
                    
                    <div className="text-sm">
                      <p><strong>Paciente:</strong> {appointment.patientName}</p>
                      <p><strong>Email:</strong> {appointment.patientEmail}</p>
                      <p><strong>Teléfono:</strong> {appointment.patientPhone}</p>
                      {appointment.notes && <p><strong>Notas:</strong> {appointment.notes}</p>}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAppointment(appointment)}
                      data-testid={`button-modify-${appointment.id}`}
                    >
                      Modificar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => cancelMutation.mutate(appointment.id)}
                      disabled={cancelMutation.isPending}
                      data-testid={`button-cancel-${appointment.id}`}
                    >
                      {cancelMutation.isPending ? "Cancelando..." : "Cancelar"}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Modification Form */}
        {selectedAppointment && <ModificationForm 
          appointment={selectedAppointment}
          onCancel={() => setSelectedAppointment(undefined)}
          onSubmit={(data) => updateMutation.mutate({ appointmentId: selectedAppointment.id, data })}
          isLoading={updateMutation.isPending}
          updateAppointmentSchema={updateAppointmentSchema}
        />}
      </CardContent>
    </Card>
  );
}

// ModificationForm component
interface ModificationFormProps {
  appointment: AppointmentWithDoctor;
  onCancel: () => void;
  onSubmit: (data: any) => void;
  isLoading: boolean;
  updateAppointmentSchema: z.ZodSchema<any>;
}

function ModificationForm({ appointment, onCancel, onSubmit, isLoading, updateAppointmentSchema }: ModificationFormProps) {
  const form = useForm({
    resolver: zodResolver(updateAppointmentSchema),
    defaultValues: {
      patientName: appointment.patientName,
      patientEmail: appointment.patientEmail,
      patientPhone: appointment.patientPhone,
      patientAge: appointment.patientAge,
      notes: appointment.notes || "",
    },
  });

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric', 
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSpecialtyLabel = (specialty: string) => {
    switch (specialty.toLowerCase()) {
      case 'pediatric':
        return 'Pediatría';
      case 'adult':
        return 'Medicina General';
      case 'family':
        return 'Medicina Familiar';
      default:
        return specialty;
    }
  };

  return (
    <Card className="p-4 bg-muted/50">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Save className="h-5 w-5 text-primary" />
          <span>Modificar Cita</span>
        </CardTitle>
        
        {/* Appointment Summary (non-editable) */}
        <div className="bg-card p-4 rounded-lg border">
          <h4 className="font-medium mb-2">Información de la Cita</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Dr. {appointment.doctor.name}</span>
              <Badge>{getSpecialtyLabel(appointment.doctor.specialty)}</Badge>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{formatDate(appointment.appointmentDate.toString())}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatTime(appointment.appointmentDate.toString())}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * Para cambiar fecha u horario, deberás cancelar esta cita y crear una nueva
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="patientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del Paciente</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre completo" {...field} data-testid="input-patient-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="patientAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Edad</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="Edad" {...field} data-testid="input-patient-age" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="patientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@ejemplo.com" {...field} data-testid="input-patient-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="patientPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono</FormLabel>
                    <FormControl>
                      <Input placeholder="Número de teléfono" {...field} data-testid="input-patient-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Información adicional sobre la consulta..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="input-patient-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                data-testid="button-cancel-modification"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="button-save-modification"
              >
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}