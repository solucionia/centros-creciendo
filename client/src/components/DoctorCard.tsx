import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Doctor } from "@shared/schema";

interface DoctorCardProps {
  doctor: Doctor;
  isSelected?: boolean;
  onSelect?: () => void;
}

export default function DoctorCard({ doctor, isSelected = false, onSelect }: DoctorCardProps) {
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
    <Card 
      className={`cursor-pointer hover-elevate transition-all duration-200 ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={onSelect}
      data-testid={`card-doctor-${doctor.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center space-x-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={doctor.photoUrl || undefined} alt={doctor.name} />
            <AvatarFallback className="text-lg">
              {doctor.name.split(' ').map(n => n[0]).join('').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate" data-testid={`text-doctor-name-${doctor.id}`}>
              Dr. {doctor.name}
            </h3>
            <Badge 
              className={`text-xs ${getSpecialtyColor(doctor.specialty)}`}
              data-testid={`badge-specialty-${doctor.id}`}
            >
              {getSpecialtyLabel(doctor.specialty)}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}