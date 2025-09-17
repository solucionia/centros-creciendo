import TimeSlot from '../TimeSlot';
import drPediatricImage from '@assets/generated_images/Female_pediatric_doctor_portrait_cb1e4f59.png';

export default function TimeSlotExample() {
  const mockDoctor = {
    id: '1',
    name: 'Ana María González',
    specialty: 'pediatric' as const,
    photoUrl: drPediatricImage,
    email: 'ana.gonzalez@centrocreciendo.com',
    phone: '+57 300 123 4567'
  };

  return (
    <div className="space-y-2 max-w-md">
      <TimeSlot 
        time="09:00"
        date={new Date()}
        doctor={mockDoctor}
        onSelect={() => console.log('Time slot selected: 09:00')}
      />
      <TimeSlot 
        time="09:30"
        date={new Date()}
        doctor={mockDoctor}
        isSelected={true}
        onSelect={() => console.log('Time slot selected: 09:30')}
      />
      <TimeSlot 
        time="10:00"
        date={new Date()}
        doctor={mockDoctor}
        isAvailable={false}
      />
    </div>
  );
}