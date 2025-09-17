import { type User, type InsertUser, type Doctor, type InsertDoctor, type Appointment, type InsertAppointment, type AppointmentWithDoctor } from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Doctor operations
  getDoctors(): Promise<Doctor[]>;
  getDoctor(id: string): Promise<Doctor | undefined>;
  createDoctor(doctor: InsertDoctor): Promise<Doctor>;
  
  // Appointment operations
  getAppointments(): Promise<AppointmentWithDoctor[]>;
  getAppointmentsByDate(date: Date): Promise<AppointmentWithDoctor[]>;
  getAppointmentsByDoctor(doctorId: string): Promise<AppointmentWithDoctor[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  cancelAppointment(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private doctors: Map<string, Doctor>;
  private appointments: Map<string, Appointment>;

  constructor() {
    this.users = new Map();
    this.doctors = new Map();
    this.appointments = new Map();
    
    // Initialize with mock doctors
    this.initializeMockData();
  }
  
  private initializeMockData() {
    const mockDoctors: Doctor[] = [
      {
        id: '1',
        name: 'Ana María González',
        specialty: 'pediatric',
        photoUrl: 'https://via.placeholder.com/150',
        email: 'ana.gonzalez@centrocreciendo.com',
        phone: '+57 300 123 4567'
      },
      {
        id: '2',
        name: 'Carlos Rodríguez',
        specialty: 'adult',
        photoUrl: 'https://via.placeholder.com/150',
        email: 'carlos.rodriguez@centrocreciendo.com',
        phone: '+57 300 234 5678'
      },
      {
        id: '3',
        name: 'María Elena Vargas',
        specialty: 'family',
        photoUrl: 'https://via.placeholder.com/150',
        email: 'maria.vargas@centrocreciendo.com',
        phone: '+57 300 345 6789'
      },
      {
        id: '4',
        name: 'Diego Martínez',
        specialty: 'pediatric',
        photoUrl: 'https://via.placeholder.com/150',
        email: 'diego.martinez@centrocreciendo.com',
        phone: '+57 300 456 7890'
      }
    ];
    
    mockDoctors.forEach(doctor => this.doctors.set(doctor.id, doctor));
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Doctor operations
  async getDoctors(): Promise<Doctor[]> {
    return Array.from(this.doctors.values());
  }

  async getDoctor(id: string): Promise<Doctor | undefined> {
    return this.doctors.get(id);
  }

  async createDoctor(insertDoctor: InsertDoctor): Promise<Doctor> {
    const id = randomUUID();
    const doctor: Doctor = { 
      ...insertDoctor, 
      id,
      photoUrl: insertDoctor.photoUrl ?? null,
      phone: insertDoctor.phone ?? null
    };
    this.doctors.set(id, doctor);
    return doctor;
  }

  // Appointment operations
  async getAppointments(): Promise<AppointmentWithDoctor[]> {
    const appointmentsArray = Array.from(this.appointments.values());
    const appointmentsWithDoctors: AppointmentWithDoctor[] = [];
    
    for (const appointment of appointmentsArray) {
      const doctor = this.doctors.get(appointment.doctorId);
      if (doctor) {
        appointmentsWithDoctors.push({ ...appointment, doctor });
      }
    }
    
    return appointmentsWithDoctors;
  }

  async getAppointmentsByDate(date: Date): Promise<AppointmentWithDoctor[]> {
    const allAppointments = await this.getAppointments();
    const targetDateString = date.toDateString();
    
    return allAppointments.filter(appointment => 
      appointment.appointmentDate.toDateString() === targetDateString
    );
  }

  async getAppointmentsByDoctor(doctorId: string): Promise<AppointmentWithDoctor[]> {
    const allAppointments = await this.getAppointments();
    return allAppointments.filter(appointment => appointment.doctorId === doctorId);
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const id = randomUUID();
    const appointment: Appointment = { 
      ...insertAppointment, 
      id,
      status: insertAppointment.status ?? 'scheduled',
      duration: insertAppointment.duration ?? 30,
      notes: insertAppointment.notes ?? null
    };
    this.appointments.set(id, appointment);
    return appointment;
  }

  async cancelAppointment(id: string): Promise<boolean> {
    const appointment = this.appointments.get(id);
    if (appointment) {
      appointment.status = 'cancelled';
      this.appointments.set(id, appointment);
      return true;
    }
    return false;
  }
}

export const storage = new MemStorage();
