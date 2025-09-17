import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Calendar, Filter } from "lucide-react";
import TimeSlot from "./TimeSlot";
import type { Doctor } from "@shared/schema";

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
  const [filterSpecialty, setFilterSpecialty] = useState<string>("all");

  // Generate time slots for a day (9 AM to 5 PM, 30-minute intervals)
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        slots.push(`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`);
      }
    }
    return slots;
  }, []);

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

  // Filter doctors by specialty
  const filteredDoctors = useMemo(() => {
    if (filterSpecialty === "all") return doctors;
    return doctors.filter(doctor => doctor.specialty === filterSpecialty);
  }, [doctors, filterSpecialty]);

  // Mock availability data - in real app this would come from the backend
  const isSlotAvailable = (doctor: Doctor, time: string, date: Date): boolean => {
    // Skip weekends
    if (date.getDay() === 0 || date.getDay() === 6) return false;
    // Skip past times for today
    if (date.toDateString() === new Date().toDateString()) {
      const now = new Date();
      const [hours, minutes] = time.split(':').map(Number);
      const slotTime = new Date();
      slotTime.setHours(hours, minutes, 0, 0);
      if (slotTime <= now) return false;
    }
    // Mock some unavailable slots
    const unavailableSlots = ['11:00', '14:00', '15:30'];
    return !unavailableSlots.includes(time);
  };

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
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-primary" />
            <span>Calendario de Citas</span>
          </CardTitle>
          
          <Tabs value={filterSpecialty} onValueChange={setFilterSpecialty} className="w-auto">
            <TabsList className="grid grid-cols-4 w-full">
              <TabsTrigger value="all" className="text-xs" data-testid="filter-all">
                Todas
              </TabsTrigger>
              <TabsTrigger value="pediatric" className="text-xs" data-testid="filter-pediatric">
                Pediatría
              </TabsTrigger>
              <TabsTrigger value="adult" className="text-xs" data-testid="filter-adult">
                Adultos
              </TabsTrigger>
              <TabsTrigger value="family" className="text-xs" data-testid="filter-family">
                Familiar
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-between pt-4">
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
      </CardHeader>

      <CardContent className="p-6">
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
            <Badge variant="outline" className="text-xs">
              {filteredDoctors.length} doctor{filteredDoctors.length !== 1 ? 'es' : ''}
            </Badge>
          </div>

          <div className="grid gap-2 max-h-96 overflow-y-auto">
            {timeSlots.map((time) => {
              // Find available doctors for this time slot
              const availableDoctors = filteredDoctors.filter(doctor => 
                isSlotAvailable(doctor, time, selectedDate)
              );

              if (availableDoctors.length === 0) {
                return (
                  <div key={time} className="text-xs text-muted-foreground italic p-2">
                    {time} - No hay disponibilidad
                  </div>
                );
              }

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
      </CardContent>
    </Card>
  );
}