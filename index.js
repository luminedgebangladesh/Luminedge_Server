require("dotenv").config();
const { connectDB, getCollections, client } = require("./config/db");
const createApp = require("./app");

let appInstance = null;

async function bootstrap() {
  if (appInstance) return appInstance;

  await connectDB();

  const collections = { ...getCollections(), client };

  // Skip index creation on Vercel serverless — too slow for cold starts.
  // Indexes are created on Render/local server startup instead.
  if (!process.env.VERCEL) {
    const { usersCollection, bookingMockCollection, schedulesCollection } = collections;
    await Promise.all([
      usersCollection.createIndex({ email: 1 }, { unique: true }),
      usersCollection.createIndex({ status: 1 }),
      usersCollection.createIndex({ role: 1 }),
      usersCollection.createIndex({ createdAt: -1 }),
      usersCollection.createIndex({ "mocks.mrValidationExpiry": 1 }),
      usersCollection.createIndex({ profileChangeRequestStatus: 1 }),
      usersCollection.createIndex({ nameLower: 1 }),
      usersCollection.createIndex({ emailLower: 1 }),
      bookingMockCollection.createIndex({ userId: 1 }),
      bookingMockCollection.createIndex({ scheduleId: 1 }),
      bookingMockCollection.createIndex({ location: 1 }),
      bookingMockCollection.createIndex({ bookingDate: 1 }),
      bookingMockCollection.createIndex({ attendance: 1 }),
      bookingMockCollection.createIndex({ userId: 1, scheduleId: 1 }),
      bookingMockCollection.createIndex({ userId: 1, location: 1 }),
      bookingMockCollection.createIndex({ userId: 1, bookingDate: -1 }),
      schedulesCollection.createIndex({ courseId: 1, startDate: 1, endDate: 1 }),
      schedulesCollection.createIndex({ startDate: 1 }),
    ]);
  }

  appInstance = createApp(collections);
  return appInstance;
}

// On Vercel: VERCEL=1 is set automatically — use the exported handler below.
// On Render / local dev: start a real HTTP server.
if (!process.env.VERCEL) {
  const { startReminderCron } = require("./jobs/reminderCron");
  const port = process.env.PORT || 5000;
  bootstrap().then((app) => {
    const { usersCollection } = getCollections();
    startReminderCron(usersCollection);
    app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
  }).catch(console.error);
}

// Vercel serverless handler
module.exports = async (req, res) => {
  const app = await bootstrap();
  app(req, res);
};
