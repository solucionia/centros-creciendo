import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { 
  CheckCircle2, 
  Calendar, 
  Clock, 
  User, 
  Mail, 
  Phone, 
  FileText,
  Download,
  Share2
} from "lucide-react";
import type { Doctor } from "@shared/schema";

interface AppointmentData {
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

interface AppointmentConfirmationProps {
  doctor: Doctor;
  appointmentTime: string;
  appointmentDate: Date;
  patientData: AppointmentData;
  appointmentId?: string;
  /** Precio de la consulta (si está disponible en la fuente de datos). */
  price?: string;
  onNewAppointment?: () => void;
  onDownloadConfirmation?: () => void;
  onShareConfirmation?: () => void;
}

export default function AppointmentConfirmation({
  doctor,
  appointmentTime,
  appointmentDate,
  patientData,
  appointmentId = "CC-2024-001",
  price,
  onNewAppointment,
  onDownloadConfirmation,
  onShareConfirmation
}: AppointmentConfirmationProps) {
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

  const getSpecialtyColor = (specialty: string) => {
    switch (specialty.toLowerCase()) {
      case 'pediatric':
        return 'bg-pediatric text-pediatric-foreground';
      case 'adult':
        return 'bg-adult text-adult-foreground';
      case 'family':
        return 'bg-accent text-accent-foreground';
      default:
        return 'bg-secondary text-secondary-foreground';
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getAppointmentForLabel = (value?: string) => {
    switch (value) {
      case 'my-child':
        return 'Mi hijo/a';
      case 'grandparent':
        return 'Mi abuelo/a';
      case 'other':
        return 'Otra persona';
      default:
        return 'Para mí';
    }
  };

  const getAdvancePreferenceLabel = (value?: string) => {
    switch (value) {
      case 'morning':
        return 'Por la mañana';
      case 'afternoon':
        return 'Por la tarde';
      default:
        return 'Mañana o tarde';
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center pb-4">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-16 h-16 bg-success/20 rounded-full">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
        </div>
        
        <CardTitle className="text-2xl font-bold text-success">
          ¡Cita Confirmada!
        </CardTitle>
        
        <p className="text-muted-foreground">
          Tu cita ha sido reservada exitosamente
        </p>
        
        <Badge variant="outline" className="w-fit mx-auto mt-2" data-testid="badge-appointment-id">
          ID: {appointmentId}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Doctor Information */}
        <div className="flex items-center space-x-4 p-4 bg-muted/50 rounded-lg">
          <Avatar className="h-16 w-16">
            <AvatarImage src={doctor.photoUrl || undefined} alt={doctor.name} />
            <AvatarFallback className="text-lg font-semibold">
              {doctor.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1">
            <h3 className="text-lg font-semibold" data-testid="text-doctor-name">
              Dr. {doctor.name}
            </h3>
            <Badge className={`${getSpecialtyColor(doctor.specialty)} mb-2`}>
              {getSpecialtyLabel(doctor.specialty)}
            </Badge>
            <p className="text-sm text-muted-foreground">Centro Creciendo</p>
          </div>
        </div>

        {/* Appointment Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Fecha</p>
              <p className="font-semibold" data-testid="text-appointment-date">
                {formatDateShort(appointmentDate)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 p-3 border rounded-lg">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Hora</p>
              <p className="font-semibold" data-testid="text-appointment-time">
                {appointmentTime}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Patient Information */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center space-x-2">
            <User className="h-4 w-4" />
            <span>Información del Paciente</span>
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Nombre</p>
              <p className="font-medium" data-testid="text-patient-name">
                {patientData.patientName}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Edad</p>
              <p className="font-medium" data-testid="text-patient-age">
                {patientData.patientAge} años
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-medium text-primary" data-testid="text-patient-email">
                {patientData.patientEmail}
              </p>
            </div>

            <div>
              <p className="text-muted-foreground">Teléfono</p>
              <p className="font-medium" data-testid="text-patient-phone">
                {patientData.patientPhone}
              </p>
            </div>

            {patientData.patientBirthDate && (
              <div>
                <p className="text-muted-foreground">Fecha de nacimiento</p>
                <p className="font-medium">{patientData.patientBirthDate}</p>
              </div>
            )}

            {patientData.patientDni && (
              <div>
                <p className="text-muted-foreground">DNI / NIE</p>
                <p className="font-medium">{patientData.patientDni}</p>
              </div>
            )}

            <div>
              <p className="text-muted-foreground">La cita es para</p>
              <p className="font-medium" data-testid="text-appointment-for">
                {getAppointmentForLabel(patientData.appointmentFor)}
              </p>
            </div>
          </div>

          {/* Datos del tutor / acompañante */}
          {patientData.appointmentFor && patientData.appointmentFor !== "me" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {patientData.tutorName && (
                <div>
                  <p className="text-muted-foreground">Tutor / acompañante</p>
                  <p className="font-medium">{patientData.tutorName}</p>
                </div>
              )}
              {patientData.tutorPhone && (
                <div>
                  <p className="text-muted-foreground">Teléfono del tutor</p>
                  <p className="font-medium">{patientData.tutorPhone}</p>
                </div>
              )}
              {patientData.tutorDni && (
                <div>
                  <p className="text-muted-foreground">DNI del tutor</p>
                  <p className="font-medium">{patientData.tutorDni}</p>
                </div>
              )}
            </div>
          )}

          {/* Lista de espera */}
          {patientData.wantsAdvance && (
            <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg text-sm">
              <p className="font-medium text-green-900 dark:text-green-100">
                📅 Indicó que desea adelantar la cita si hay hueco antes
              </p>
              <p className="text-green-800 dark:text-green-200">
                Preferencia: {getAdvancePreferenceLabel(patientData.advancePreference)}
              </p>
            </div>
          )}

          {/* Precio de la consulta (si está disponible) */}
          {price && (
            <div className="flex items-center justify-between p-3 border rounded-lg text-sm">
              <span className="text-muted-foreground">Precio de la consulta</span>
              <span className="font-semibold" data-testid="text-appointment-price">
                {price}
              </span>
            </div>
          )}

          {patientData.notes && (
            <div>
              <p className="text-muted-foreground text-sm">Notas</p>
              <p className="text-sm bg-muted/50 p-3 rounded-lg" data-testid="text-appointment-notes">
                {patientData.notes}
              </p>
            </div>
          )}
        </div>

        <Separator />

        {/* Important Information */}
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            Información Importante
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Llega 15 minutos antes de tu cita</li>
            <li>• Trae tu documento de identidad</li>
            <li>• Si tienes exámenes previos, llévalos contigo</li>
            <li>• En caso de cancelar, hazlo con 24 horas de anticipación</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button 
            variant="outline"
            onClick={onDownloadConfirmation}
            className="flex items-center space-x-2"
            data-testid="button-download"
          >
            <Download className="h-4 w-4" />
            <span>Descargar</span>
          </Button>
          
          <Button 
            variant="outline"
            onClick={onShareConfirmation}
            className="flex items-center space-x-2"
            data-testid="button-share"
          >
            <Share2 className="h-4 w-4" />
            <span>Compartir</span>
          </Button>
          
          <Button 
            onClick={onNewAppointment}
            className="flex items-center space-x-2"
            data-testid="button-new-appointment"
          >
            <Calendar className="h-4 w-4" />
            <span>Nueva Cita</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}