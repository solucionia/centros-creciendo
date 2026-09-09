/**
 * Política de modificación/cancelación de citas (ventana de 48 horas).
 *
 * Si la cita está a más de 48 horas del momento actual, el paciente puede
 * modificarla o cancelarla en línea. Si está a menos de 48 horas, solo se le
 * ofrece "Ayuda con mi cita" y debe contactar con recepción.
 */

export const CANCELLATION_WINDOW_HOURS = 48;

/** Número de WhatsApp de recepción (solo dígitos, con prefijo de país). */
export const RECEPTION_WHATSAPP_NUMBER = '573001234567';

export const RECEPTION_PHONE_DISPLAY = '+57 (1) 123-4567';

/**
 * Horas que faltan desde ahora hasta la fecha de la cita.
 * Devuelve un número (puede ser negativo si la cita ya pasó).
 */
export function hoursUntilAppointment(date: Date | string): number {
  const target = date instanceof Date ? date : new Date(date);
  const diffMs = target.getTime() - Date.now();
  return diffMs / (1000 * 60 * 60);
}

/**
 * Devuelve true si la cita está a menos de `CANCELLATION_WINDOW_HOURS` horas.
 * Las citas ya pasadas también caen dentro de la ventana (imposible modificar).
 */
export function isWithin48Hours(date: Date | string): boolean {
  return hoursUntilAppointment(date) < CANCELLATION_WINDOW_HOURS;
}

/** Construye la URL de WhatsApp para pedir ayuda con una cita. */
export function buildHelpWhatsAppUrl(patientName?: string, appointmentDate?: string): string {
  const text = encodeURIComponent(
    `Hola, necesito ayuda con mi cita en CitaFácil${
      patientName ? ` (paciente: ${patientName})` : ''
    }${
      appointmentDate
        ? ` el ${new Date(appointmentDate).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}`
        : ''
    }.`,
  );
  return `https://wa.me/${RECEPTION_WHATSAPP_NUMBER}?text=${text}`;
}
