// DriCloud automation - Server version
interface PatientData {
  patientName: string;
  patientEmail: string;
  patientPhone: string;
  patientAge: number;
  notes?: string;
}

interface DoctorSpecialty {
  pediatric: string;
  adult: string;
  family: string;
}

export const startDriCloudReservation = async (
  patientData: PatientData, 
  doctorSpecialty: keyof DoctorSpecialty
): Promise<void> => {
  try {
    console.log("🤖 Enviando solicitud de automatización al servidor...");
    
    const response = await fetch('/api/dricloud/automate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientData,
        doctorSpecialty
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Error en la automatización');
    }

    const result = await response.json();
    console.log("✅ Automatización completada:", result.message);
    
  } catch (error) {
    console.error("❌ Error en automatización:", error);
    throw error;
  }
};