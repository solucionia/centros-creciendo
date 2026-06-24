# 🏥 CitaFacil — DriCloud Integration Status

**Last verified:** 2026-06-23 (live against the real API)

## ✅ Working

1. **Authentication** — `LoginExternalHash` succeeds; the MD5 hash matches the
   official Postman recipe (`md5(userName + md5(password) + timeSpanString + salt)`,
   uppercase, timestamp in `Europe/Madrid`). Token cached ~23h.
2. **WebAPI subscription — ACTIVE.** Data endpoints respond with real data
   (no "Suscripción a WebAPI no activa" error):
   - `GetEspecialidades` → `Data.Especialidades[]` (with `ListadoTIPO_CITA`: duration + price)
   - `GetDoctores` → `Data.Doctores[]`
   - `GetAgendaDisponibilidad` → `Data.Disponibilidad[]`
3. **Calendar wired to real availability** — `AppointmentCalendar` reads slots
   from `GET /api/dricloud/availability` (no more hardcoded slots). See PR #11.

## ⚙️ Configuration

| Variable | Value / shape |
| --- | --- |
| `DRICLOUD_URL_CLINICA` | clinic path segment only, e.g. `Dricloud_centrocreciendo_20423221` |
| `DRICLOUD_CLINICA_ID` | `idClinica` for the login body, e.g. `20423` |
| `DRICLOUD_API_PASSWORD` | WebAPI user password (keep in `.env`, never commit) |

The base URL (`https://apidricloud.dricloud.net`), `userName` (`WebAPI`) and the
salt are set in `server/dricloud/auth.ts`; only the three variables above come
from the environment.

## ⚠️ Important: this is a TEST environment

The seeded doctor (USU_ID 98, "Jose Maria Arias Aguilera") is flagged
*"Entorno de pruebas (no acepta citas con pacientes)"* and has **no published
agenda**, so `GetAgendaDisponibilidad` currently returns **0 slots**. The
connection and parsing are correct — the calendar shows a real empty state
rather than fabricated slots. Real availability/booking needs a production
clinic with a published agenda.

## 📋 Open follow-ups

- Booking (`AppointmentBooking.tsx`) now targets DriCloud via
  `useCreateDriCloudAppointment` — see PR #12 (pending review; not verifiable
  end-to-end in the test environment).
- Verify `GetAgendaDisponibilidad` with `DES_ID` / `TCI_ID` once a real agenda
  exists, in case slots require those params.

---

### Historical note

A previous diagnosis (2025-10-13) against a different clinic
(`Dricloud_creciendomirasierra_20627620`) reported the WebAPI subscription as
**inactive** — only `Login` worked then. That is no longer the case for the
current clinic (`centrocreciendo`, `idClinica 20423`).
