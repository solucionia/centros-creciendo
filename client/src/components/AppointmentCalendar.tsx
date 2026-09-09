import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Filter, Loader2, CalendarDays } from "lucide-react";
import TimeSlot from "./TimeSlot";
import type { Doctor } from "@shared/schema";
import centroLogo from "@assets/centrocreciendo_1758144139702.png";
import { useDriCloudAvailability, useDriCloudSpecialties } from "@/hooks/use-dricloud";
import {
  availabilityToSlotSet,
  isSlotAvailableFromSet,
  formatDateForAvailabilityQuery,
} from "@shared/availability";

// El backend GET /api/dricloud/doctors devuelve además el campo `especialidadIds`
// (los ESP_ID que cada doctor atiende), pero el type `Doctor` de la BD no lo
// incluye. Definimos un tipo local con esa extensión para poder filtrar por la
// especialidad real de DriCloud.
type DoctorWithEspecialidad = Doctor & { especialidadIds?: number[] };

interface AppointmentCalendarProps {
  doctors: Doctor[];
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  onSlotSelect?: (doctor: Doctor, time: string, date: Date) => void;
  selectedSlot?: { doctorId: string; time: string; date: Date };
}

export default function AppointmentCalendar({ 
  doctors, 
  selectedDate = new Date(),
  onDateSelect,
  onSlotSelect,
  selectedSlot
}: AppointmentCalendarProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  // La especialidad es un filtro OBLIGATORIO: comienza sin seleccionar y el
  // paciente debe elegir una para ver los médicos y horarios de esa especialidad.
  // Guarda el ESP_ID (number) de las especialidades reales de DriCloud.
  const [filterSpecialty, setFilterSpecialty] = useState<number | "">("");
  const [filterDoctor, setFilterDoctor] = useState<string>("all");

  // Especialidades reales de DriCloud (Odontología, Alergología, Pediatría, ...)
  const {
    data: specialties,
    isLoading: isLoadingSpecialties,
  } = useDriCloudSpecialties();

  // Filtra los doctores por especialidad y doctor. Sin especialidad elegida no
  // hay médicos que mostrar (filtro obligatorio). Se filtra por `especialidadIds`
  // (los ESP_ID que atiende el doctor); si la API no trajo el campo, el doctor
  // no coincide.
  const filteredDoctors = useMemo(() => {
    if (filterSpecialty === "") return [];
    const allDoctors = doctors as DoctorWithEspecialidad[];
    let filtered = allDoctors.filter((doctor) =>
      Array.isArray(doctor.especialidadIds)
        ? doctor.especialidadIds.includes(filterSpecialty)
        : false
    );
    if (filterDoctor !== "all") {
      filtered = filtered.filter((doctor) => doctor.id === filterDoctor);
    }
    return filtered;
  }, [doctors, filterSpecialty, filterDoctor]);

  // Derive the active doctor id for the availability query.
  // When the user has selected a specific doctor, use that id.
  // Otherwise default to the first doctor in the filtered list so the
  // calendar is never blank when there is a doctor for that specialty.
  const activeDoctorId = useMemo(() => {
    if (filterSpecialty === "") return null;
    if (filterDoctor !== "all") return filterDoctor;
    return filteredDoctors[0]?.id ?? null;
  }, [filterSpecialty, filterDoctor, filteredDoctors]);

  // Fetch real availability from DriCloud for the selected doctor + week start.
  // We query starting from the Monday of the current week (diasRecuperar=7)
  // so the response covers all days visible in the calendar.
  const weekStart = useMemo(() => {
    const d = new Date(currentWeek);
    const day = d.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + offset);
    return d;
  }, [currentWeek]);

  const {
    data: availabilityData,
    isLoading: isAvailabilityLoading,
  } = useDriCloudAvailability(
    activeDoctorId ?? "",
    formatDateForAvailabilityQuery(weekStart),
    activeDoctorId !== null
  );

  // Convert the raw availability array into a Set<"HH:MM"> for the selected date.
  const availableSlotSet = useMemo<Set<string> | null>(() => {
    if (isAvailabilityLoading) return null;
    if (!availabilityData) return new Set<string>();
    return availabilityToSlotSet(availabilityData, selectedDate);
  }, [availabilityData, selectedDate, isAvailabilityLoading]);

  // Get week days starting from Monday
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentWeek);
    const dayOfWeek = startOfWeek.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);

    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      return date;
    });
  }, [currentWeek]);

  // Filter doctors by specialty and doctor
  const checkSlotAvailable = (_doctor: Doctor, time: string, date: Date): boolean => {
    return isSlotAvailableFromSet(availableSlotSet, time, date);
  };

  // Build the visible time grid from the real availability data for the selected date.
  // When loading or empty, fall back to an empty array so no phantom slots render.
  const timeSlots = useMemo<string[]>(() => {
    if (!availableSlotSet || availableSlotSet.size === 0) return [];
    return Array.from(availableSlotSet).sort();
  }, [availableSlotSet]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(newWeek);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const isToday = (date: Date) => {
    return date.toDateString() === new Date().toDateString();
  };

  const isSelectedDate = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="flex flex-col space-y-2">
            <img 
              src={centroLogo} 
              alt="Centro Creciendo" 
              className="h-8 w-auto self-start"
            />
            <CardTitle className="text-primary">
              Reserva tu Cita
            </CardTitle>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 lg:max-w-2xl">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Especialidad *
              </label>
              <Select
                value={filterSpecialty === "" ? "" : String(filterSpecialty)}
                onValueChange={(value) => setFilterSpecialty(value === "" ? "" : Number(value))}
              >
                <SelectTrigger data-testid="select-specialty-filter" className="w-full">
                  <SelectValue
                    placeholder={isLoadingSpecialties ? "Cargando especialidades..." : "Selecciona la especialidad"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {(specialties ?? []).map((spec) => (
                    <SelectItem key={spec.ESP_ID} value={String(spec.ESP_ID)}>
                      {spec.ESP_NOMBRE}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filterSpecialty && (
              <div className="sm:w-64">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Médico
                </label>
                <Select value={filterDoctor} onValueChange={setFilterDoctor}>
                  <SelectTrigger data-testid="select-doctor-filter">
                    <SelectValue placeholder="Todos los médicos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los médicos</SelectItem>
                    {filteredDoctors.map((doctor) => (
                      <SelectItem key={doctor.id} value={doctor.id}>
                        Dr. {doctor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        {!filterSpecialty && (
          <div className="min-h-[400px] flex flex-col items-center justify-center text-center space-y-3">
            <CalendarDays className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-medium">Elige una especialidad para continuar</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Selecciona arriba la especialidad que necesitas y te mostraremos los
              médicos y horarios disponibles para esa consulta.
            </p>
          </div>
        )}

        {filterSpecialty && (
          <>
            {filteredDoctors.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                No hay médicos disponibles para esta especialidad. Prueba a elegir otra.
              </div>
            )}

            {/* Week Navigation */}
            <div className="flex items-center justify-between pb-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateWeek('prev')}
                data-testid="button-prev-week"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="text-lg font-semibold">
                {currentWeek.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => navigateWeek('next')}
                data-testid="button-next-week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Week Days Header */}
            <div className="grid grid-cols-7 gap-2 mb-4">
              {weekDays.map((date, index) => (
                <Button
                  key={index}
                  variant={isSelectedDate(date) ? "default" : "ghost"}
                  className={`h-auto p-3 flex flex-col items-center ${
                    isToday(date) ? 'ring-2 ring-primary/50' : ''
                  }`}
                  onClick={() => onDateSelect?.(date)}
                  data-testid={`button-date-${date.getDate()}`}
                >
                  <span className="text-xs font-medium">
                    {formatDate(date).split(' ')[0]}
                  </span>
                  <span className="text-lg font-bold">
                    {date.getDate()}
                  </span>
                  {isToday(date) && (
                    <Badge variant="secondary" className="text-xs mt-1">
                      Hoy
                    </Badge>
                  )}
                </Button>
              ))}
            </div>

            {/* Available Slots for Selected Date */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Citas disponibles para {formatDate(selectedDate)}
                </span>
                {isAvailabilityLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {timeSlots.length} hueco{timeSlots.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              <div className="grid gap-2 max-h-96 overflow-y-auto">
                {isAvailabilityLoading && (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Cargando disponibilidad...
                  </div>
                )}

                {!isAvailabilityLoading && timeSlots.length === 0 && (
                  <div className="text-sm text-muted-foreground italic py-4 text-center">
                    No hay huecos disponibles para este día.
                  </div>
                )}

                {!isAvailabilityLoading && timeSlots.map((time) => {
                  // All times in the set are confirmed available from DriCloud;
                  // use checkSlotAvailable to guard weekends (already handled by the
                  // set derivation, but kept as a safety net).
                  const availableDoctors = filteredDoctors.filter((doctor) =>
                    checkSlotAvailable(doctor, time, selectedDate)
                  );

                  if (availableDoctors.length === 0) return null;

                  return (
                    <div key={time} className="space-y-1">
                      {availableDoctors.map((doctor) => (
                        <TimeSlot
                          key={`${doctor.id}-${time}`}
                          time={time}
                          date={selectedDate}
                          doctor={doctor}
                          isAvailable={true}
                          isSelected={
                            selectedSlot?.doctorId === doctor.id &&
                            selectedSlot?.time === time &&
                            selectedSlot?.date.toDateString() === selectedDate.toDateString()
                          }
                          onSelect={() => onSlotSelect?.(doctor, time, selectedDate)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}