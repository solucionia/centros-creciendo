import { useState } from 'react';
import AppointmentCalendar from '../AppointmentCalendar';
import drPediatricImage from '@assets/generated_images/Female_pediatric_doctor_portrait_cb1e4f59.png';
import drAdultImage from '@assets/generated_images/Male_adult_medicine_doctor_portrait_35015c47.png';
import drFamilyImage from '@assets/generated_images/Female_family_doctor_portrait_0aa52486.png';
import drPediatricMaleImage from '@assets/generated_images/Male_pediatric_specialist_portrait_10491633.png';

export default function AppointmentCalendarExample() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState<{ doctorId: string; time: string; date: Date } | undefined>();

  // todo: remove mock functionality
  const mockDoctors = [
    {
      id: '1',
      name: 'Ana María González',
      specialty: 'pediatric' as const,
      photoUrl: drPediatricImage,
      email: 'ana.gonzalez@centrocreciendo.com',
      phone: '+57 300 123 4567'
    },
    {
      id: '2', 
      name: 'Carlos Rodríguez',
      specialty: 'adult' as const,
      photoUrl: drAdultImage,
      email: 'carlos.rodriguez@centrocreciendo.com',
      phone: '+57 300 234 5678'
    },
    {
      id: '3',
      name: 'María Elena Vargas',
      specialty: 'family' as const,
      photoUrl: drFamilyImage,
      email: 'maria.vargas@centrocreciendo.com',
      phone: '+57 300 345 6789'
    },
    {
      id: '4',
      name: 'Diego Martínez',
      specialty: 'pediatric' as const,
      photoUrl: drPediatricMaleImage,
      email: 'diego.martinez@centrocreciendo.com',
      phone: '+57 300 456 7890'
    }
  ];

  const handleSlotSelect = (doctor: any, time: string, date: Date) => {
    setSelectedSlot({ doctorId: doctor.id, time, date });
    console.log('Selected appointment:', { doctor: doctor.name, time, date });
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <AppointmentCalendar
        doctors={mockDoctors}
        selectedDate={selectedDate}
        onDateSelect={setSelectedDate}
        onSlotSelect={handleSlotSelect}
        selectedSlot={selectedSlot}
      />
    </div>
  );
}