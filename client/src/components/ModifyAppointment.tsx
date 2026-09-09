import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Calendar, User, Clock, MessageCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isWithin48Hours, buildHelpWhatsAppUrl } from "@/lib/appointment-window";
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
            {filteredAppointments.map((appointment) => {
              const tooLate = isWithin48Hours(appointment.appointmentDate);
              return (
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

                    {tooLate ? (
                      <div className="flex flex-col gap-2 max-w-xs">
                        <div className="flex items-start space-x-2 text-sm text-destructive">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>
                            Tu cita es en menos de 48 horas. Ya no puedes modificarla
                            en línea: contacta con recepción.
                          </span>
                        </div>
                        <Button asChild variant="outline" size="sm" className="w-full">
                          <a
                            href={buildHelpWhatsAppUrl(appointment.patientName, appointment.appointmentDate.toString())}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <MessageCircle className="h-4 w-4 mr-2" />
                            Ayuda con mi cita
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedAppointment(appointment)}
                          data-testid={`button-modify-${appointment.id}`}
                        >
                          Modificar mi cita
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
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modification Form (placeholder for now) */}
        {selectedAppointment && (
          <Card className="p-4 bg-muted/50">
            <h3 className="text-lg font-semibold mb-4">Modificar Cita</h3>
            <p className="text-muted-foreground">
              Funcionalidad de modificación disponible próximamente. 
              Por ahora puedes cancelar la cita y crear una nueva.
            </p>
            <Button
              variant="outline"
              onClick={() => setSelectedAppointment(undefined)}
              className="mt-4"
            >
              Cerrar
            </Button>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}