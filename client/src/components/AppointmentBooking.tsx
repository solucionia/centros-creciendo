import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Calendar, UserCheck, CheckCircle2 } from "lucide-react";
import AppointmentCalendar from "./AppointmentCalendar";
import PatientForm from "./PatientForm";
import AppointmentConfirmation from "./AppointmentConfirmation";
import ModifyAppointment from "./ModifyAppointment";
import { DemoModeBanner } from "./DemoModeBanner";
import { useCreateDriCloudAppointment } from "@/hooks/use-dricloud";
import { useAuthStatus } from "@/hooks/use-auth";
import type { Doctor } from "@shared/schema";

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
  patientDni?: string;
  patientBirthDate?: string;
  appointmentFor?: string;
  tutorName?: string;
  tutorPhone?: string;
  tutorDni?: string;
  privacyAccepted?: boolean;
  wantsAdvance?: boolean;
  advancePreference?: string;
  notes?: string;
}

interface AppointmentBookingProps {
  doctors: Doctor[];
}

export default function AppointmentBooking({ doctors }: AppointmentBookingProps) {
  const [currentView, setCurrentView] = useState<'booking' | 'modify'>('booking');
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

  const createDriCloudAppointment = useCreateDriCloudAppointment();
  const { data: authStatus } = useAuthStatus();
  const sessionPhone = authStatus?.authenticated ? authStatus.phone : undefined;

  const handlePatientFormSubmit = async (data: PatientData) => {
    if (!selectedSlot) return;

    setIsLoading(true);

    // Build a timezone-naive local datetime string "yyyy-MM-ddTHH:mm" from the
    // selected calendar date and time slot. Never call toISOString() here —
    // that would convert to UTC and corrupt the wall-clock slot when the
    // server timezone differs from the browser timezone.
    const slotDate = selectedSlot.date;
    const year = slotDate.getFullYear();
    const month = String(slotDate.getMonth() + 1).padStart(2, '0');
    const day = String(slotDate.getDate()).padStart(2, '0');
    const [slotHH, slotMM] = selectedSlot.time.split(':');
    const naiveLocalDateTime = `${year}-${month}-${day}T${slotHH}:${slotMM}`;

    try {
      await createDriCloudAppointment.mutateAsync({
        doctorId: selectedSlot.doctor.id,
        patientName: data.patientName,
        patientEmail: data.patientEmail,
        patientPhone: data.patientPhone,
        patientAge: data.patientAge,
        appointmentDate: naiveLocalDateTime,
        notes: data.notes,
        patientDni: data.patientDni,
        patientBirthDate: data.patientBirthDate,
        appointmentFor: data.appointmentFor,
        tutorName: data.tutorName,
        tutorPhone: data.tutorPhone,
        tutorDni: data.tutorDni,
        privacyAccepted: data.privacyAccepted,
        wantsAdvance: data.wantsAdvance,
        advancePreference: data.advancePreference,
      });
      setPatientData(data);
      // Guardamos el interés en adelantar la cita para persistirlo entre sesiones.
      if (data.wantsAdvance) {
        try {
          localStorage.setItem('citafacil_waitlist', JSON.stringify({
            advancePreference: data.advancePreference || 'any',
            requestDate: new Date().toISOString(),
          }));
        } catch {
          // localStorage puede no estar disponible; el dato ya viaja al backend.
        }
      }
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
            sessionPhone={sessionPhone}
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
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Demo Mode Banner */}
      <DemoModeBanner />

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