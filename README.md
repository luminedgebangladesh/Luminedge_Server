# Luminedge Server

Backend REST API for the Luminedge Mock Testing Portal — manages mock test bookings, user accounts, scheduling, and student assessments.

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** MongoDB Atlas (raw driver, no ORM)
- **Auth:** JWT + bcrypt
- **Email:** Nodemailer
- **Scheduling:** node-cron
- **Deployment:** Vercel (serverless)

## Project Structure

```text
├── index.js          # Entry point
├── app.js            # Express app factory & route registration
├── emailSender.js    # Email utility with retry logic
├── config/
│   └── db.js         # MongoDB connection & index setup
├── routes/           # Feature-based API routes
├── middleware/       # Auth (JWT) & file upload (Multer)
└── jobs/
    └── reminderCron.js  # Daily 4AM UTC reminder job
```

## Setup

1. Clone the repo

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your values:

   ```bash
   cp .env.example .env
   ```

4. Start the dev server:

   ```bash
   npm run dev
   ```

## Environment Variables

See `.env.example` for all required variables.

## API Base URL

All endpoints are prefixed with `/api/v1/`.

| Route Group | Path |
| --- | --- |
| Auth | `/api/v1/register`, `/api/v1/login` |
| Users | `/api/v1/user/*`, `/api/v1/admin/users` |
| Bookings | `/api/v1/user/book-slot`, `/api/v1/admin/bookings` |
| Schedules | `/api/v1/admin/create-schedule`, `/api/v1/schedule/*` |
| Feedback | `/api/v1/admin/save-feedback` |
| Stats | `/api/v1/admin/stats/*` |
| Cron | `/api/v1/cron/reminder` |

## Deployment

Deployed on Vercel. The `vercel.json` config sets up the serverless function and a daily cron trigger at 4 AM UTC for expiry reminders.
