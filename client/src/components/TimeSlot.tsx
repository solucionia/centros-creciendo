import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, User } from "lucide-react";
import type { Doctor } from "@shared/schema";

interface TimeSlotProps {
  time: string;
  date: Date;
  doctor: Doctor;
  duration?: number;
  isAvailable?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
}

export default function TimeSlot({ 
  time, 
  date, 
  doctor, 
  duration = 30, 
  isAvailable = true, 
  isSelected = false,
  onSelect 
}: TimeSlotProps) {
  const getSpecialtyColor = (specialty: string) => {
    switch (specialty.toLowerCase()) {
      case 'pediatric':
        return 'border-l-pediatric bg-pediatric/5';
      case 'adult':
        return 'border-l-adult bg-adult/5';
      case 'family':
        return 'border-l-accent bg-accent/5';
      default:
        return 'border-l-muted bg-muted/5';
    }
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

  if (!isAvailable) {
    return (
      <div 
        className="p-3 border-l-4 border-l-muted bg-muted/20 rounded-lg opacity-50"
        data-testid={`slot-unavailable-${time}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span className="text-sm font-medium">{time}</span>
          </div>
          <Badge variant="secondary" className="text-xs">
            No disponible
          </Badge>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant={isSelected ? "default" : "ghost"}
      className={`w-full justify-between p-3 h-auto border-l-4 rounded-lg ${
        getSpecialtyColor(doctor.specialty)
      } ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={onSelect}
      data-testid={`button-timeslot-${time.replace(':', '')}`}
    >
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-2">
          <Clock className="h-4 w-4" />
          <span className="font-medium">{time}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          <User className="h-4 w-4" />
          <div className="text-left">
            <div className="text-sm font-medium">Dr. {doctor.name}</div>
            <div className="text-xs text-muted-foreground">
              {getSpecialtyLabel(doctor.specialty)}
            </div>
          </div>
        </div>
      </div>

      <div className="text-right">
        <Badge 
          variant="secondary" 
          className="text-xs"
          data-testid={`badge-duration-${time.replace(':', '')}`}
        >
          {duration} min
        </Badge>
      </div>
    </Button>
  );
}