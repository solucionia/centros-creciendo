import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User, Calendar, Clock, UserCheck, ShieldCheck } from "lucide-react";
import type { Doctor } from "@shared/schema";

const patientFormSchema = z
  .object({
    patientName: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
    patientEmail: z.string().email("Email inválido"),
    patientPhone: z.string().min(10, "Número de teléfono inválido"),
    patientAge: z.coerce.number().min(0, "La edad debe ser mayor o igual a 0").max(120, "La edad debe ser menor a 120"),
    patientDni: z.string().optional(),
    patientBirthDate: z.string().optional(),
    appointmentFor: z.string().default("me"),
    tutorName: z.string().optional(),
    tutorPhone: z.string().optional(),
    tutorDni: z.string().optional(),
    privacyAccepted: z.boolean().refine((v) => v, {
      message: "Para continuar debes autorizar el tratamiento de tus datos.",
    }),
    wantsAdvance: z.boolean().default(false),
    advancePreference: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) =>
      data.appointmentFor === "me" ||
      (!!data.tutorName && !!data.tutorPhone),
    {
      message: "Si la cita es para otra persona, indica el nombre y el teléfono del tutor/acompañante.",
      path: ["tutorName"],
    },
  );

type PatientFormData = z.infer<typeof patientFormSchema>;

interface PatientFormProps {
  doctor: Doctor;
  appointmentTime: string;
  appointmentDate: Date;
  onSubmit?: (data: PatientFormData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  /** Phone number from the active session. When provided the phone field is
   *  pre-filled and locked so it always matches the authenticated account. */
  sessionPhone?: string;
}

/**
 * Calcula la edad a partir de una fecha de nacimiento "yyyy-MM-dd".
 * Devuelve 0 si la fecha es inválida o futura (para recién nacidos).
 */
export function calculateAgeFromBirthDate(birthDate: string): number {
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }
  return Math.max(0, age);
}

const APPOINTMENT_FOR_OPTIONS = [
  { value: "me", label: "Para mí" },
  { value: "my-child", label: "Para mi hijo/a" },
  { value: "grandparent", label: "Para mi abuelo/a" },
  { value: "other", label: "Para otra persona" },
];

const ADVANCE_PREFERENCE_OPTIONS = [
  { value: "morning", label: "Por la mañana" },
  { value: "afternoon", label: "Por la tarde" },
  { value: "any", label: "Da igual (mañana o tarde)" },
];

export default function PatientForm({
  doctor,
  appointmentTime,
  appointmentDate,
  onSubmit,
  onCancel,
  isLoading = false,
  sessionPhone,
}: PatientFormProps) {
  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      patientName: "",
      patientEmail: "",
      patientPhone: sessionPhone ?? "",
      patientAge: undefined,
      notes: "",
      appointmentFor: "me",
      wantsAdvance: false,
      privacyAccepted: false,
    },
  });

  const appointmentFor = form.watch("appointmentFor");

  // Cuando el usuario introduce la fecha de nacimiento, autocompletamos la edad.
  // Así la edad se deriva de la fecha (la edad manual queda como respaldo).
  useEffect(() => {
    const birthDate = form.watch("patientBirthDate");
    if (birthDate) {
      form.setValue("patientAge", calculateAgeFromBirthDate(birthDate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.watch("patientBirthDate")]);

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

  const handleSubmit = (data: PatientFormData) => {
    const derivedAge = data.patientBirthDate
      ? calculateAgeFromBirthDate(data.patientBirthDate)
      : data.patientAge;
    onSubmit?.({ ...data, patientAge: derivedAge });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <UserCheck className="h-5 w-5 text-primary" />
          <span>Información del Paciente</span>
        </CardTitle>

        {/* Appointment Summary */}
        <div className="bg-muted/50 p-4 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Dr. {doctor.name}</span>
            </div>
            <Badge className={getSpecialtyColor(doctor.specialty)}>
              {getSpecialtyLabel(doctor.specialty)}
            </Badge>
          </div>

          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
            <div className="flex items-center space-x-1">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(appointmentDate)}</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>{appointmentTime}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="patientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre completo del paciente *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej: María José García"
                        {...field}
                        data-testid="input-patient-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="appointmentFor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>La cita es para... *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-appointment-for">
                          <SelectValue placeholder="¿Para quién es la cita?" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {APPOINTMENT_FOR_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="patientBirthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha de nacimiento</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-patient-birthdate"
                      />
                    </FormControl>
                    <FormDescription>La edad se calcula automáticamente.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="patientAge"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Edad *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Ej: 25"
                        {...field}
                        data-testid="input-patient-age"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="patientDni"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>DNI / NIE (Opcional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: 12345678Z"
                      {...field}
                      data-testid="input-patient-dni"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="patientEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="ejemplo@gmail.com"
                        {...field}
                        data-testid="input-patient-email"
                      />
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
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="+57 300 123 4567"
                        {...field}
                        readOnly={!!sessionPhone}
                        className={sessionPhone ? "bg-muted cursor-not-allowed" : ""}
                        data-testid="input-patient-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Tutor / acompañante: solo si la cita es para otra persona */}
            {appointmentFor && appointmentFor !== "me" && (
              <div className="space-y-4 border border-muted rounded-lg p-4">
                <div className="text-sm font-medium">Datos del tutor / acompañante</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tutorName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre del tutor *</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ej: Ana García"
                            {...field}
                            data-testid="input-tutor-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tutorPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Teléfono del tutor *</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="+57 300 000 0000"
                            {...field}
                            data-testid="input-tutor-phone"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="tutorDni"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>DNI / NIE del tutor (Opcional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Ej: 12345678Z"
                          {...field}
                          data-testid="input-tutor-dni"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas adicionales (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Información adicional sobre el motivo de la consulta..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Lista de espera: interés en adelantar la cita */}
            <FormField
              control={form.control}
              name="wantsAdvance"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start space-x-3 border rounded-lg p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-advance"
                        id="checkbox-advance"
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel htmlFor="checkbox-advance" className="font-medium cursor-pointer">
                        ¿Le interesaría adelantar la cita si hay hueco antes?
                      </FormLabel>
                      <FormDescription>
                        Si se libera un hueco antes de su cita, le avisamos para
                        adelantarla (no es un compromiso).
                      </FormDescription>
                    </div>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("wantsAdvance") && (
              <FormField
                control={form.control}
                name="advancePreference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preferencia para adelantar</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-advance-preference">
                          <SelectValue placeholder="Elige franja horaria" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ADVANCE_PREFERENCE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Consentimiento RGPD obligatorio */}
            <FormField
              control={form.control}
              name="privacyAccepted"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start space-x-3 border rounded-lg p-4 bg-muted/30">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="checkbox-privacy"
                        id="checkbox-privacy"
                      />
                    </FormControl>
                    <div className="space-y-1">
                      <FormLabel htmlFor="checkbox-privacy" className="font-medium cursor-pointer">
                        <div className="flex items-center space-x-1">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          <span>Consentimiento de datos (obligatorio)</span>
                        </div>
                      </FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Al continuar, autoriza el tratamiento de sus datos para la
                        gestión de la cita conforme a la normativa vigente.
                      </p>
                      <FormMessage />
                    </div>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={isLoading}
                className="flex-1"
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1"
                data-testid="button-confirm-appointment"
              >
                {isLoading ? "Procesando..." : "Confirmar Cita"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
