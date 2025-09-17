import AppointmentConfirmation from '../AppointmentConfirmation';
import drPediatricImage from '@assets/generated_images/Female_pediatric_doctor_portrait_cb1e4f59.png';

export default function AppointmentConfirmationExample() {
  const mockDoctor = {
    id: '1',
    name: 'Ana María González',
    specialty: 'pediatric' as const,
    photoUrl: drPediatricImage,
    email: 'ana.gonzalez@centrocreciendo.com',
    phone: '+57 300 123 4567'
  };

  const mockPatientData = {
    patientName: 'María José García',
    patientEmail: 'maria.garcia@email.com',
    patientPhone: '+57 300 987 6543',
    patientAge: 8,
    notes: 'Control rutinario de crecimiento y desarrollo'
  };

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <AppointmentConfirmation
        doctor={mockDoctor}
        appointmentTime="09:30"
        appointmentDate={tomorrow}
        patientData={mockPatientData}
        appointmentId="CC-2024-0567"
        onNewAppointment={() => console.log('New appointment clicked')}
        onDownloadConfirmation={() => console.log('Download confirmation')}
        onShareConfirmation={() => console.log('Share confirmation')}
      />
    </div>
  );
}