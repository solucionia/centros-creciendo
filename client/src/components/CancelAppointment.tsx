import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Search, Calendar, User, Clock, Trash2, MessageCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { isWithin48Hours, buildHelpWhatsAppUrl } from "@/lib/appointment-window";
import type { AppointmentWithDoctor } from "@shared/schema";

interface CancelAppointmentProps {
  onBack: () => void;
}

export default function CancelAppointment({ onBack }: CancelAppointmentProps) {
  const [searchEmail, setSearchEmail] = useState("");
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
        title: "Cita cancelada exitosamente",
        description: "La cita ha sido cancelada y se ha notificado al sistema.",
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error al cancelar la cita",
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
          <Trash2 className="h-5 w-5 text-destructive" />
          <span>Cancelar Cita</span>
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
                data-testid="input-search-cancel-email"
              />
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline"
                onClick={onBack}
                data-testid="button-back-cancel"
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
            <p className="text-muted-foreground">No se encontraron citas programadas para este email.</p>
          </div>
        )}

        {!isLoading && filteredAppointments.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Citas encontradas:</h3>
            {filteredAppointments.map((appointment) => {
              const tooLate = isWithin48Hours(appointment.appointmentDate);
              return (
                <Card key={appointment.id} className="p-4 border-l-4 border-l-destructive/50">
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
                            Tu cita es en menos de 48 horas. Ya no puedes cancelarla
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={cancelMutation.isPending}
                              data-testid={`button-cancel-confirm-${appointment.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Cancelar Cita
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta acción cancelará permanentemente la cita del {formatDate(appointment.appointmentDate.toString())}
                                a las {formatTime(appointment.appointmentDate.toString())} con Dr. {appointment.doctor.name}.
                                Esta acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>No, mantener cita</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => cancelMutation.mutate(appointment.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Sí, cancelar cita
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <h4 className="font-medium mb-2">Instrucciones:</h4>
          <ol className="text-sm text-muted-foreground space-y-1">
            <li>1. Ingresa el email del paciente en el campo de búsqueda</li>
            <li>2. Selecciona la cita que deseas cancelar</li>
            <li>3. Confirma la cancelación en el diálogo que aparece</li>
            <li>4. La cita será cancelada automáticamente en el sistema</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}