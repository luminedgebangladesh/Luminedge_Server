const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const bookingRoutes = require("./routes/booking.routes");
const feedbackRoutes = require("./routes/feedback.routes");
const statsRoutes = require("./routes/stats.routes");
const scheduleRoutes = require("./routes/schedule.routes");
const cronRoutes = require("./routes/cron.routes");

module.exports = function createApp(collections) {
  const { usersCollection, coursesCollection, schedulesCollection, bookingMockCollection, client } = collections;

  const app = express();

  app.set("trust proxy", 1);

  app.use(cookieParser());
  app.use(
    cors({
      origin: [
        "https://luminedge.io",
        "https://testingfunctionality.netlify.app",
        "http://localhost:3000",
      ],
      methods: ["GET", "POST", "PUT", "DELETE"],
      credentials: true,
    })
  );
  app.use(express.json({ limit: "10mb" }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many attempts, please try again later." },
  });

  app.get("/", (req, res) => {
    res.json({ message: "Server is running smoothly", timestamp: new Date() });
  });

  // booking routes first so /user/bookings/:userId is matched before /user/:userId
  app.use("/api/v1", bookingRoutes({ usersCollection, schedulesCollection, bookingMockCollection, client }));
  app.use("/api/v1/login", authLimiter);
  app.use("/api/v1/auth/forget-password", authLimiter);
  app.use("/api/v1", authRoutes({ usersCollection }));
  app.use("/api/v1", userRoutes({ usersCollection }));
  app.use("/api/v1", feedbackRoutes({ usersCollection, bookingMockCollection, client }));
  app.use("/api/v1", statsRoutes({ usersCollection, bookingMockCollection }));
  app.use("/api/v1", scheduleRoutes({ schedulesCollection, coursesCollection }));
  app.use("/api/v1", cronRoutes({ usersCollection }));

  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: "An unexpected error occurred. Please try again later." });
  });

  return app;
};
