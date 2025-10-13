import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Calendar, UserCheck, CheckCircle2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import AppointmentCalendar from "./AppointmentCalendar";
import PatientForm from "./PatientForm";
import AppointmentConfirmation from "./AppointmentConfirmation";
import ModifyAppointment from "./ModifyAppointment";
import CancelAppointment from "./CancelAppointment";
import type { Doctor, InsertAppointment } from "@shared/schema";

interface SelectedSlot {
  doctor: Doctor;
  time: string;
  date: Date;
}

interface PatientData {
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientAge: number;
  notes?: string;
}

interface AppointmentBookingProps {
  doctors: Doctor[];
}

export default function AppointmentBooking({ doctors }: AppointmentBookingProps) {
  const [currentView, setCurrentView] = useState<'booking' | 'modify' | 'cancel'>('booking');
  const [currentStep, setCurrentStep] = useState<'calendar' | 'form' | 'confirmation'>('calendar');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | undefined>();
  const [patientData, setPatientData] = useState<PatientData | undefined>();
  const [isLoading, setIsLoading] = useState(false);

  const steps = [
    { key: 'calendar', label: 'Seleccionar Cita', icon: Calendar },
    { key: 'form', label: 'Datos del Paciente', icon: UserCheck },
    { key: 'confirmation', label: 'Confirmación', icon: CheckCircle2 },
  ];

  const currentStepIndex = steps.findIndex(step => step.key === currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleSlotSelect = (doctor: Doctor, time: string, date: Date) => {
    setSelectedSlot({ doctor, time, date });
    setCurrentStep('form');
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const createAppointmentMutation = useMutation({
    mutationFn: async (appointmentData: InsertAppointment) => {
      const response = await fetch('/api/appointments', {
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
      // Invalidate appointments cache
      queryClient.invalidateQueries({ queryKey: ['/api/appointments'] });
      toast({
        title: "Cita creada exitosamente",
        description: "Su cita ha sido reservada correctamente.",
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

  const handlePatientFormSubmit = async (data: PatientData) => {
    if (!selectedSlot) return;
    
    setIsLoading(true);
    
    // Create appointment date-time
    const [hours, minutes] = selectedSlot.time.split(':').map(Number);
    const appointmentDateTime = new Date(selectedSlot.date);
    appointmentDateTime.setHours(hours, minutes, 0, 0);
    
    const appointmentData: InsertAppointment = {
      doctorId: selectedSlot.doctor.id,
      patientName: data.patientName,
      patientEmail: data.patientEmail,
      patientPhone: data.patientPhone,
      patientAge: data.patientAge,
      appointmentDate: appointmentDateTime,
      notes: data.notes || null,
      duration: 30,
      status: 'scheduled',
    };
    
    try {
      await createAppointmentMutation.mutateAsync(appointmentData);
      setPatientData(data);
      setCurrentStep('confirmation');
    } catch (error) {
      console.error('Error creating appointment:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToCalendar = () => {
    setCurrentStep('calendar');
    setSelectedSlot(undefined);
  };

  const handleBackToForm = () => {
    setCurrentStep('form');
  };

  const handleNewAppointment = () => {
    setCurrentStep('calendar');
    setSelectedSlot(undefined);
    setPatientData(undefined);
    setSelectedDate(new Date());
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'calendar':
        return (
          <AppointmentCalendar
            doctors={doctors}
            selectedDate={selectedDate}
            onDateSelect={setSelectedDate}
            onSlotSelect={handleSlotSelect}
            selectedSlot={selectedSlot ? {
              doctorId: selectedSlot.doctor.id,
              time: selectedSlot.time,
              date: selectedSlot.date
            } : undefined}
          />
        );

      case 'form':
        if (!selectedSlot) {
          handleBackToCalendar();
          return null;
        }
        return (
          <PatientForm
            doctor={selectedSlot.doctor}
            appointmentTime={selectedSlot.time}
            appointmentDate={selectedSlot.date}
            onSubmit={handlePatientFormSubmit}
            onCancel={handleBackToCalendar}
            isLoading={isLoading}
          />
        );

      case 'confirmation':
        if (!selectedSlot || !patientData) {
          handleBackToCalendar();
          return null;
        }
        return (
          <AppointmentConfirmation
            doctor={selectedSlot.doctor}
            appointmentTime={selectedSlot.time}
            appointmentDate={selectedSlot.date}
            patientData={patientData}
            onNewAppointment={handleNewAppointment}
            onDownloadConfirmation={() => console.log('Download confirmation')}
            onShareConfirmation={() => console.log('Share confirmation')}
          />
        );


      default:
        return null;
    }
  };

  // Renderizar contenido según la vista actual
  const renderMainContent = () => {
    if (currentView === 'modify') {
      return (
        <ModifyAppointment
          onBack={() => setCurrentView('booking')}
        />
      );
    }
    
    if (currentView === 'cancel') {
      return (
        <CancelAppointment
          onBack={() => setCurrentView('booking')}
        />
      );
    }
    
    // Vista de reserva (booking)
    return (
      <>
        {/* Progress Steps */}
        {currentView === 'booking' && (
          <Card>
            <CardHeader>
              <div className="space-y-4">
                <Progress value={progress} className="w-full" data-testid="progress-booking" />
                
                <div className="grid grid-cols-3 gap-4">
                  {steps.map((step, index) => {
                    const StepIcon = step.icon;
                    const isActive = currentStep === step.key;
                    const isCompleted = index < currentStepIndex;
                    
                    return (
                      <div
                        key={step.key}
                        className={`flex items-center space-x-2 p-2 rounded-lg text-sm ${
                          isActive 
                            ? 'bg-primary text-primary-foreground' 
                            : isCompleted 
                            ? 'bg-success/20 text-success' 
                            : 'bg-muted text-muted-foreground'
                        }`}
                        data-testid={`step-${step.key}`}
                      >
                        <StepIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
          </Card>
        )}

        {/* Back Navigation */}
        {currentStep !== 'calendar' && currentView === 'booking' && (
          <div className="flex justify-start">
            <Button
              variant="outline"
              onClick={currentStep === 'form' ? handleBackToCalendar : handleBackToForm}
              className="flex items-center space-x-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Volver</span>
            </Button>
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[600px]">
          {renderStepContent()}
        </div>
      </>
    );
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      {/* Header with Navigation Buttons */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <CardTitle className="text-2xl font-bold text-primary">
              CitaFacil
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={currentView === 'booking' ? 'default' : 'outline'}
                onClick={() => {
                  setCurrentView('booking');
                  setCurrentStep('calendar');
                }}
                data-testid="button-reserva-cita"
              >
                Reserva Cita
              </Button>
              <Button
                variant={currentView === 'modify' ? 'default' : 'outline'}
                onClick={() => setCurrentView('modify')}
                data-testid="button-modifica-cita"
              >
                Modifica Cita
              </Button>
              <Button
                variant={currentView === 'cancel' ? 'default' : 'outline'}
                onClick={() => setCurrentView('cancel')}
                data-testid="button-cancela-cita"
              >
                Cancela Cita
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Content */}
      {renderMainContent()}

      {/* Footer */}
      <Card>
        <CardContent className="p-4">
          <div className="text-center text-sm text-muted-foreground">
            <p>CitaFacil - Sistema de Gestión de Citas Médicas</p>
            <p>📧 info@citafacil.com | 📞 +57 (1) 123-4567</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}