import DoctorCard from '../DoctorCard';
import drPediatricImage from '@assets/generated_images/Female_pediatric_doctor_portrait_cb1e4f59.png';

export default function DoctorCardExample() {
  const mockDoctor = {
    id: '1',
    name: 'Ana María González',
    specialty: 'pediatric' as const,
    photoUrl: drPediatricImage,
    email: 'ana.gonzalez@centrocreciendo.com',
    phone: '+57 300 123 4567'
  };

  return (
    <div className="max-w-sm">
      <DoctorCard 
        doctor={mockDoctor}
        onSelect={() => console.log('Doctor selected:', mockDoctor.name)}
      />
    </div>
  );
}