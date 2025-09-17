import { useState } from 'react';
import PatientForm from '../PatientForm';
import drPediatricImage from '@assets/generated_images/Female_pediatric_doctor_portrait_cb1e4f59.png';

export default function PatientFormExample() {
  const [isLoading, setIsLoading] = useState(false);

  const mockDoctor = {
    id: '1',
    name: 'Ana María González',
    specialty: 'pediatric' as const,
    photoUrl: drPediatricImage,
    email: 'ana.gonzalez@centrocreciendo.com',
    phone: '+57 300 123 4567'
  };

  const handleSubmit = (data: any) => {
    console.log('Patient form submitted:', data);
    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      alert('Cita confirmada exitosamente!');
    }, 2000);
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <PatientForm
        doctor={mockDoctor}
        appointmentTime="09:30"
        appointmentDate={tomorrow}
        onSubmit={handleSubmit}
        onCancel={() => console.log('Form cancelled')}
        isLoading={isLoading}
      />
    </div>
  );
}