const { Router } = require("express");
const { startReminderCron } = require("../jobs/reminderCron");

const router = Router();

module.exports = ({ usersCollection }) => {
  // Called by Vercel Cron at 10:00 Asia/Dhaka (04:00 UTC)
  router.get("/cron/reminder", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      await startReminderCron(usersCollection, { runOnce: true });
      res.json({ success: true, message: "Reminder cron executed" });
    } catch (err) {
      console.error("Cron route error:", err);
      res.status(500).json({ success: false, message: "Cron failed" });
    }
  });

  return router;
};
