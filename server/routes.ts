import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertDoctorSchema, insertAppointmentSchema } from "@shared/schema";
import { z } from "zod";
import { registerDriCloudRoutes } from "./routes/dricloud.routes";
import { registerAuthRoutes, requireAuth } from "./routes/auth.routes";
import { normalizePhone } from "./lib/phone";

export async function registerRoutes(app: Express): Promise<Server> {
  // Registrar rutas de autenticación (login OTP por WhatsApp)
  registerAuthRoutes(app);
  // Registrar rutas de DriCloud
  registerDriCloudRoutes(app);
  // Doctor routes
  app.get('/api/doctors', async (req, res) => {
    try {
      const doctors = await storage.getDoctors();
      res.json(doctors);
    } catch (error) {
      console.error('Error fetching doctors:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/doctors/:id', async (req, res) => {
    try {
      const doctor = await storage.getDoctor(req.params.id);
      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }
      res.json(doctor);
    } catch (error) {
      console.error('Error fetching doctor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/doctors', async (req, res) => {
    try {
      const validatedData = insertDoctorSchema.parse(req.body);
      const doctor = await storage.createDoctor(validatedData);
      res.status(201).json(doctor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: error.errors });
      }
      console.error('Error creating doctor:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Appointment routes
  app.get('/api/appointments', requireAuth, async (req, res) => {
    try {
      const { date, doctorId } = req.query;
      // Ownership key: only return appointments for the authenticated user's phone.
      const sessionPhone = normalizePhone(req.session!.user!.phone);
      let appointments;

      if (date) {
        const queryDate = new Date(date as string);
        // Check if date is valid
        if (isNaN(queryDate.getTime())) {
          return res.status(400).json({ error: 'Invalid date format' });
        }
        appointments = await storage.getAppointmentsByDate(queryDate);
      } else if (doctorId) {
        // Verify doctor exists when filtering by doctorId
        const doctor = await storage.getDoctor(doctorId as string);
        if (!doctor) {
          return res.status(404).json({ error: 'Doctor not found' });
        }
        appointments = await storage.getAppointmentsByDoctor(doctorId as string);
      } else {
        appointments = await storage.getAppointments();
      }

      // Ownership filter: always applied after the query-level filter.
      const owned = appointments.filter(
        (a) => normalizePhone(a.patientPhone) === sessionPhone,
      );
      res.json(owned);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/appointments', requireAuth, async (req, res) => {
    try {
      // Ownership check: the patientPhone in the body must match the authenticated session.
      const sessionPhone = normalizePhone(req.session!.user!.phone);
      if (!sessionPhone || normalizePhone(req.body.patientPhone) !== sessionPhone) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Parse and convert appointmentDate from ISO string to Date object
      const requestData = {
        ...req.body,
        appointmentDate: new Date(req.body.appointmentDate)
      };

      const validatedData = insertAppointmentSchema.parse(requestData);

      // Verify doctor exists
      const doctor = await storage.getDoctor(validatedData.doctorId);
      if (!doctor) {
        return res.status(404).json({ error: 'Doctor not found' });
      }

      const appointment = await storage.createAppointment(validatedData);

      // Return appointment with doctor info for consistency with GET routes
      const appointmentWithDoctor = { ...appointment, doctor };
      res.status(201).json(appointmentWithDoctor);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid data', details: error.errors });
      }
      console.error('Error creating appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/appointments/:id/cancel', requireAuth, async (req, res) => {
    try {
      const sessionPhone = normalizePhone(req.session!.user!.phone);
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found' });
      }
      // Ownership check: only the patient who owns the appointment may cancel it.
      if (normalizePhone(appointment.patientPhone) !== sessionPhone) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await storage.cancelAppointment(req.params.id);
      res.json({ message: 'Appointment cancelled successfully' });
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
