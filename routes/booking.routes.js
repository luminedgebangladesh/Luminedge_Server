const { Router } = require("express");
const { ObjectId } = require("mongodb");
const sanitizeHtml = require("sanitize-html");
const { emailSender } = require("../emailSender");
const { verifyToken, verifyAdmin, verifyStaff } = require("../middleware/auth");

function convertTo12HourFormat(timeString) {
  if (!timeString) return "Not Available";
  const [hours, minutes] = timeString.split(":").map(Number);
  const ampm = hours >= 12 ? "PM" : "AM";
  const formattedHours = hours % 12 || 12;
  return `${formattedHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

async function sendBookingConfirmationEmail(user, bookingRecord) {
  try {
    const bookingDateFormatted = new Date(bookingRecord.bookingDate).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const testTimeRaw =
      bookingRecord.location === "Home" ? bookingRecord.testTime : bookingRecord.startTime;

    const testTime = convertTo12HourFormat(testTimeRaw);

    const safe = (v) => sanitizeHtml(String(v || ""), { allowedTags: [], allowedAttributes: {} });
    const subject = `Confirmation: Mock Test Booking for ${bookingDateFormatted}`;
    const messageContent = `
        <div>
          <p>Dear ${safe(user.name) || "Student"},</p>
          <p>This is a friendly reminder that your mock test is scheduled for <strong>${bookingDateFormatted}</strong>. Please find the details below:</p>
          <p><strong>Test Details:</strong></p>
          <ul>
            <li>Test Title: ${safe(bookingRecord.name)} ${safe(bookingRecord.testType)}</li>
            <li>Test Date: ${bookingDateFormatted}</li>
            <li>Test Time: ${testTime}</li>
            <li>Test Location: ${safe(bookingRecord.location)}</li>
            <li>Reporting Time: 30 minutes before Test Time</li>
            <li>Office Address: Level 12, Gawsia Twin Peak, 743 Satmasjid Road, Dhanmondi 9/A, Dhaka-1205, Bangladesh.</li>
          </ul>
          <p><strong>Important Instructions:</strong></p>
          <ul>
            <li>Arrive at least 30 minutes before the test time for check-in.</li>
            <li>Bring a valid photo ID (Passport/NID) that matches the ID information provided at the time of account creation.</li>
            <li>Bring your own stationery items (pens, pencils, erasers) as they will not be provided at the test venue.</li>
          </ul>
          <p><strong>Mock Test Terms & Conditions:</strong></p>
          <ul>
            <li>Purchased or course-provided mock test(s) must be used within 6 months of the MR date.</li>
            <li>Free mock test(s) must be taken within 10 days of the MR date.</li>
            <li>Mock test rescheduling requests must be made 24 hours prior to the booked test date.</li>
            <li>Any mismatch between the provided ID details and the ID shown on the test day may result in test cancellation, and no refunds will be issued in such cases.</li>
            <li>Late arrivals, no-shows, invalid photo IDs, or expired service validity may result in forfeiting the test, with no refund requests entertained.</li>
            <li>Students are required to maintain professional behavior with Luminedge employees at all times. Any instance of misbehavior may result in service cancellation, with no refund issued.</li>
          </ul>
          <p>To facilitate a smooth check-in process, kindly present your valid photo ID (Passport/NID) voucher to our office executive upon arrival. This step is crucial to confirm your eligibility for the mock test.</p>
          <p>We sincerely appreciate your cooperation in adhering to these guidelines. Your punctuality and preparedness will contribute to a successful and efficient mock test experience.</p>
          <p>Thank you for choosing Luminedge for your test preparation needs. If you have any questions or require further assistance, please do not hesitate to contact us.</p>
          <p>📞 01400-406374 | 01400-403475 | 01400-403486 | 01400-403487 | 01400-403493 | 01400-403494</p>
          <p>We wish you the best for your mock test!</p>
          <p>Best regards,</p>
          <p>The Luminedge Team</p>
        </div>
      `;

    await emailSender(subject, user.email, messageContent);
    console.log(`Confirmation email sent successfully to ${user.email}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}

module.exports = ({ usersCollection, schedulesCollection, bookingMockCollection, client }) => {
  const router = Router();

  router.post("/user/book-slot", verifyToken, async (req, res) => {
    try {
      const {
        scheduleId, userId, slotId, testType, testSystem,
        name, location, bookingDate, testTime,
      } = req.body;

      if (!userId || !location) {
        return res.status(400).json({
          message: "Missing required fields. 'userId' and 'location' are required.",
        });
      }

      if (!ObjectId.isValid(userId)) {
        return res.status(400).json({ message: "Invalid user ID format." });
      }

      // A user can only book for themselves; admins can book for anyone
      if (req.user.role !== "admin" && userId !== String(req.user.userId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user || user.mock <= 0) {
        return res.status(400).json({ message: "Insufficient mock tests available." });
      }

      const resolvedMockType = (name || user.mockType || "").toString().trim();
      const resolvedTestType = (testType || user.testType || "").toString().trim();

      if (resolvedMockType && resolvedTestType) {
        const lowerCourse = resolvedMockType.toLowerCase();
        const lowerTestType = resolvedTestType.toLowerCase();

        const purchasedForCourse = (Array.isArray(user.mocks) ? user.mocks : [])
          .filter((m) => {
            const mCourse = (m.mockType || "").toString().trim().toLowerCase();
            const mType = (m.testType || "").toString().trim().toLowerCase();
            return mCourse === lowerCourse && mType === lowerTestType;
          })
          .reduce((sum, m) => sum + (Number(m.mock) || 0), 0);

        if (purchasedForCourse > 0) {
          const usedForCourse = await bookingMockCollection.countDocuments({
            userId,
            name: resolvedMockType,
            testType: resolvedTestType,
          });

          if (usedForCourse >= purchasedForCourse) {
            return res.status(400).json({ message: "Insufficient mock tests available." });
          }
        }
      }

      if (location === "Home") {
        if (!bookingDate || !testTime) {
          return res.status(400).json({ message: "Please select a booking date and test time." });
        }

        const userTestType = testType || user.testType || "Unknown";
        const userTestName = name || user.name || "Unknown";

        const existingBooking = await bookingMockCollection.findOne({
          userId, bookingDate, location: "Home",
        });

        if (existingBooking) {
          return res.status(400).json({ message: "You already have a test booked for this date." });
        }

        const bookingRecord = {
          userId, location: "Home", status: "pending",
          name: userTestName, testType: userTestType,
          testSystem: testSystem || "N/A", bookingDate, testTime,
        };

        const homeSession = client.startSession();
        try {
          homeSession.startTransaction();

          await bookingMockCollection.insertOne(bookingRecord, { session: homeSession });

          const updateMock = await usersCollection.updateOne(
            { _id: new ObjectId(userId), mock: { $gt: 0 } },
            { $inc: { mock: -1 } },
            { session: homeSession }
          );

          if (updateMock.modifiedCount === 0) {
            await homeSession.abortTransaction();
            await homeSession.endSession();
            return res.status(400).json({ message: "Insufficient mock tests available." });
          }

          await homeSession.commitTransaction();
          await homeSession.endSession();
        } catch (err) {
          if (homeSession.inTransaction()) {
            try { await homeSession.abortTransaction(); } catch {}
          }
          try { await homeSession.endSession(); } catch {}
          throw err;
        }

        res.json({ success: true, message: "Home test booked successfully", bookingRecord });
        sendBookingConfirmationEmail(user, bookingRecord);
        return;
      }

      if (location === "Test Center") {
        if (!scheduleId || !slotId || !testType || !name) {
          return res.status(400).json({
            message: "Missing required fields: 'scheduleId', 'slotId', 'testType', and 'name' are required for Test Center bookings.",
          });
        }

        if (typeof testSystem === "string" && testSystem.trim() === "") {
          return res.status(400).json({
            message: "'testSystem' is required because a selection field was shown.",
          });
        }

        if (!ObjectId.isValid(scheduleId)) {
          return res.status(400).json({ message: "Invalid schedule ID format." });
        }

        const schedule = await schedulesCollection.findOne({ _id: new ObjectId(scheduleId) });
        if (!schedule) {
          return res.status(404).json({ message: "Schedule not found." });
        }

        const selectedTimeSlot = schedule.timeSlots.find((slot) => slot.slotId === slotId);
        if (!selectedTimeSlot || Number(selectedTimeSlot.slot) < 1) {
          return res.status(400).json({ message: "Invalid or unavailable time slot selected." });
        }

        const existingBooking = await bookingMockCollection.findOne({
          userId, scheduleId, bookingDate: schedule.startDate, slotId,
        });
        if (existingBooking) {
          return res.status(400).json({ message: "You have already booked a slot for this date." });
        }

        const session = client.startSession();
        session.startTransaction();

        let bookingRecord;
        try {
          const slotUpdate = await schedulesCollection.updateOne(
            { _id: new ObjectId(scheduleId), "timeSlots.slotId": slotId },
            { $inc: { "timeSlots.$.slot": -1 } },
            { session }
          );
          if (slotUpdate.modifiedCount === 0) throw new Error("Failed to update slot availability");

          const userUpdate = await usersCollection.updateOne(
            { _id: new ObjectId(userId), mock: { $gt: 0 } },
            { $inc: { mock: -1 } },
            { session }
          );
          if (userUpdate.modifiedCount === 0) throw new Error("Failed to update user mock count");

          bookingRecord = {
            userId, scheduleId, slotId, status: "pending", name, testType,
            testSystem: testSystem || null, bookingDate: schedule.startDate,
            startTime: selectedTimeSlot.startTime, endTime: selectedTimeSlot.endTime,
            location: "Test Center",
          };

          await bookingMockCollection.insertOne(bookingRecord, { session });
          await session.commitTransaction();
        } catch (err) {
          if (session.inTransaction()) {
            try { await session.abortTransaction(); } catch {}
          }
          throw err;
        } finally {
          try { await session.endSession(); } catch {}
        }

        res.json({ success: true, message: "Test Center test booked successfully", bookingRecord });
        sendBookingConfirmationEmail(user, bookingRecord);
      } else {
        return res.status(400).json({
          message: "Invalid location type. Must be 'Home' or 'Test Center'.",
        });
      }
    } catch (error) {
      console.error("Error booking slot:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  router.post("/send-reminder", verifyAdmin, async (req, res) => {
    const { emails } = req.body;

    if (!emails || !emails.length) {
      return res.status(400).json({ message: "No email data provided." });
    }

    try {
      const emailPromises = emails.map(({ email, subject, message }) =>
        emailSender(subject, email, message)
      );

      await Promise.all(emailPromises);
      res.status(200).json({ message: "Emails sent successfully!" });
    } catch (error) {
      console.error("Error sending emails:", error);
      res.status(500).json({ message: "Failed to send emails." });
    }
  });

  router.post("/user/attendance/bulk", verifyStaff, async (req, res) => {
    try {
      const { userIds } = req.body;
      if (!userIds || !Array.isArray(userIds)) {
        return res.status(400).json({ error: "Invalid userIds format" });
      }

      const attendanceData = await bookingMockCollection
        .aggregate([
          {
            $match: {
              userId: { $in: userIds },
              attendance: { $in: ["present", "absent"] },
            },
          },
          { $group: { _id: "$userId", count: { $sum: 1 } } },
        ], { maxTimeMS: 5000 })
        .toArray();

      const attendanceMap = attendanceData.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      res.json({ attendance: attendanceMap });
    } catch (error) {
      console.error("Error fetching bulk attendance:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  router.get("/user/bookings/:userId", verifyToken, async (req, res) => {
    const { userId } = req.params;

    const staffRoles = ["admin", "bdm", "teacher"];
    if (!staffRoles.includes(req.user.role) && userId !== String(req.user.userId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const BOOKING_PROJECTION = {
      _id: 1, userId: 1, scheduleId: 1, slotId: 1, name: 1, testType: 1, testSystem: 1,
      location: 1, bookingDate: 1, testTime: 1, startTime: 1, endTime: 1,
      status: 1, attendance: 1, trfEmailed: 1, trfEmailAt: 1,
    };
    try {
      const bookings = await bookingMockCollection
        .find({ userId }, { projection: BOOKING_PROJECTION })
        .sort({ bookingDate: -1 })
        .toArray();
      res.json({ bookings });
    } catch (err) {
      console.error("Error fetching user bookings:", err);
      res.status(500).json({ message: "Failed to load bookings." });
    }
  });

  router.get("/admin/bookings/home-with-users", verifyStaff, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
      const skip = (page - 1) * limit;

      const homeBookingsWithUsers = await bookingMockCollection
        .aggregate([
          { $match: { location: "Home" } },
          { $sort: { _id: -1 } },
          { $skip: skip },
          { $limit: limit },
          { $addFields: { userObjectId: { $toObjectId: "$userId" } } },
          {
            $lookup: {
              from: "users",
              localField: "userObjectId",
              foreignField: "_id",
              as: "user",
            },
          },
          { $unwind: "$user" },
          {
            $project: {
              _id: 1, name: 1, testType: 1, testSystem: 1, location: 1,
              bookingDate: 1, testTime: 1, attendance: 1, userId: 1,
              "user._id": 1, "user.name": 1, "user.email": 1,
              "user.contactNo": 1, "user.transactionId": 1,
              "user.mock": 1, "user.totalMock": 1, "user.status": 1, "user.passportNumber": 1,
            },
          },
        ], { maxTimeMS: 9000 })
        .toArray();

      res.json({ bookings: homeBookingsWithUsers, page, limit });
    } catch (error) {
      console.error("Error fetching home bookings:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  });

  router.get("/admin/bookings/by-schedule/:scheduleId", verifyStaff, async (req, res, next) => {
    try {
      const scheduleId = String(req.params.scheduleId || "");
      if (!scheduleId) return res.status(400).json({ message: "scheduleId is required" });

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 500));
      const skip = (page - 1) * limit;

      const projection = {
        _id: 1, id: 1, name: 1, testType: 1, testSystem: 1, bookingDate: 1,
        scheduleId: 1, slotId: 1, startTime: 1, endTime: 1, userId: 1,
        userCount: 1, attendance: 1,
      };

      const bookings = await bookingMockCollection
        .find({ scheduleId }, { projection })
        .sort({ _id: -1 })
        .skip(skip)
        .limit(limit)
        .maxTimeMS(8000)
        .toArray();

      return res.json({ bookings, page, limit });
    } catch (err) {
      if (err?.code === 50) {
        return res.status(504).json({ message: "Query took too long for this page/limit." });
      }
      next(err);
    }
  });

  router.get("/admin/bookings", verifyAdmin, async (req, res, next) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(2000, Math.max(1, parseInt(req.query.limit, 10) || 500));
      const skip = (page - 1) * limit;

      const q = {};
      if (req.query.location) q.location = String(req.query.location);
      if (req.query.status) q.status = String(req.query.status);

      const projection = {
        _id: 1, userId: 1, scheduleId: 1, slotId: 1, name: 1, testType: 1, testSystem: 1,
        location: 1, bookingDate: 1, testTime: 1, startTime: 1, endTime: 1,
        status: 1, attendance: 1, trfEmailed: 1, trfEmailAt: 1,
      };

      const [bookings, total] = await Promise.all([
        bookingMockCollection
          .find(q, { projection })
          .sort({ _id: -1 })
          .skip(skip)
          .limit(limit)
          .maxTimeMS(9000)
          .toArray(),
        page === 1
          ? bookingMockCollection.countDocuments(q, { maxTimeMS: 5000 })
          : Promise.resolve(null),
      ]);

      if (bookings.length === 0 && page === 1) {
        return res.status(404).json({ message: "No bookings found" });
      }
      res.json({ bookings, ...(total !== null && { total }), page, limit });
    } catch (err) {
      if (err?.code === 50) {
        return res.status(504).json({ message: "Query took too long. Try a smaller page/limit." });
      }
      next(err);
    }
  });

  router.put("/user/bookings/:scheduleId", verifyAdmin, async (req, res) => {
    try {
      const { scheduleId } = req.params;
      const { userId, attendance, status, bookingDate } = req.body;

      if (!userId || !attendance || !status) {
        return res.status(400).json({ message: "Missing required fields." });
      }

      let updateFilter = {};
      let schedule = null;
      let testDateFormatted;

      if (scheduleId.toLowerCase() === "home") {
        if (!bookingDate) {
          return res.status(400).json({ message: "Booking date is required for Home bookings." });
        }

        const bookingDateParsed = new Date(bookingDate);
        if (isNaN(bookingDateParsed.getTime())) {
          return res.status(400).json({ message: "Invalid booking date format." });
        }

        updateFilter = { userId, location: "Home", bookingDate };
        testDateFormatted = bookingDateParsed.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

      } else {
        if (!ObjectId.isValid(scheduleId)) {
          return res.status(400).json({ message: "Invalid schedule ID format." });
        }

        updateFilter = { scheduleId, userId };

        schedule = await schedulesCollection.findOne({ _id: new ObjectId(scheduleId) });
        if (!schedule) {
          return res.status(404).json({ message: "Schedule not found" });
        }

        testDateFormatted = new Date(schedule.startDate).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

      }

      const existingBooking = await bookingMockCollection.findOne(updateFilter);
      if (!existingBooking) {
        console.error("❌ Booking not found for update:", updateFilter);
        return res.status(404).json({ message: "Booking not found." });
      }

      const updateResult = await bookingMockCollection.updateOne(
        updateFilter,
        { $set: { status, attendance } }
      );

      if (updateResult.matchedCount === 0) {
        return res.status(404).json({ message: "Booking not found." });
      }

      if (updateResult.modifiedCount === 0) {
        console.warn("⚠️ Booking found but attendance was not modified:", updateFilter);
        return res.status(200).json({ message: "Attendance already updated." });
      }

      const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      if (!user) {
        console.error("❌ User not found for email notification.");
        return res.status(404).json({ message: "User not found." });
      }

      let subject, messageContent;

      const safeUserName = sanitizeHtml(user.name || "Student", { allowedTags: [], allowedAttributes: {} });
      if (attendance === "present") {
        subject = "Thank You for Participating in Your Mock Test";
        messageContent = `
          <div>
            <p>Dear ${safeUserName},</p>
            <p>Thank you for attending your mock test on <strong>${testDateFormatted}</strong> at Luminedge! We hope the experience was helpful in assessing your preparation.</p>
            <p>Here are a few next steps to make the most of your mock test:</p>
            <ul>
              <li>Review your performance and identify improvement areas.</li>
              <li>Reach out to us if you need additional resources or support to enhance your preparation.</li>
            </ul>
            <p>Your insights help us improve our services. If you have any feedback about the test experience, feel free to share it with us at:</p>
            <p>📞 01400-406374 | 01400-403475 | 01400-403486 | 01400-403487 | 01400-403493 | 01400-403494</p>
            <p>We wish you the best of luck as you continue your journey toward success!</p>
            <p>Best regards,</p>
            <p>The Luminedge Team</p>
          </div>
        `;
      } else if (attendance === "absent") {
        subject = "We Missed You at Your Mock Test";
        messageContent = `
          <div>
            <p>Dear ${safeUserName},</p>
            <p>We noticed that you couldn't attend your mock test scheduled on <strong>${testDateFormatted}</strong> at Luminedge! We understand that unexpected situations can arise, and we genuinely care about your preparation journey.</p>
            <p>Here are a few options to help you get back on track:</p>
            <ul>
              <li>Consider purchasing additional mock tests to continue your preparation journey.</li>
              <li>Reach out to our expert instructors for personalized guidance and strategies to enhance your test readiness.</li>
            </ul>
            <p>We're here to support you in achieving your goals. If you need assistance or have any questions, feel free to contact us at:</p>
            <p>📞 01400-406374 | 01400-403475 | 01400-403486 | 01400-403487 | 01400-403493 | 01400-403494</p>
            <p>Your success is our priority, and we're committed to helping you every step of the way!</p>
            <p>Best regards,</p>
            <p>The Luminedge Team</p>
          </div>
        `;
      }

      if (subject && messageContent) {
        try {
          await emailSender(subject, user.email, messageContent);
        } catch (emailError) {
          console.error("Error sending attendance email:", emailError);
        }
      }

      res.json({
        success: true,
        message: `Attendance updated successfully for ${scheduleId.toLowerCase() === "home" ? "Home" : "Test Center"} booking.`,
      });
    } catch (error) {
      console.error("❌ Error updating attendance:", error);
      res.status(500).json({ message: "Error updating attendance" });
    }
  });

  // User can cancel their own booking; admin can cancel any
  router.delete("/bookings/:bookingId", verifyToken, async (req, res) => {
    const { bookingId } = req.params;

    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID format." });
    }

    const session = client.startSession();
    try {
      session.startTransaction();

      const existingBooking = await bookingMockCollection.findOne(
        { _id: new ObjectId(bookingId) },
        { session }
      );
      if (!existingBooking) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Booking not found." });
      }

      if (req.user.role !== "admin" && existingBooking.userId !== String(req.user.userId)) {
        await session.abortTransaction();
        return res.status(403).json({ message: "Forbidden" });
      }

      const deleteResult = await bookingMockCollection.deleteOne(
        { _id: new ObjectId(bookingId) },
        { session }
      );

      if (deleteResult.deletedCount === 0) {
        await session.abortTransaction();
        return res.status(500).json({ message: "Failed to cancel booking." });
      }

      if (
        existingBooking.location === "Test Center" &&
        existingBooking.scheduleId &&
        existingBooking.slotId
      ) {
        await schedulesCollection.updateOne(
          {
            _id: new ObjectId(existingBooking.scheduleId),
            "timeSlots.slotId": existingBooking.slotId,
          },
          { $inc: { "timeSlots.$.slot": 1 } },
          { session }
        );
      }

      const userUpdate = await usersCollection.updateOne(
        { _id: new ObjectId(existingBooking.userId) },
        { $inc: { mock: 1 } },
        { session }
      );

      if (userUpdate.modifiedCount === 0) {
        console.warn(`Warning: User mock count update failed for userId ${existingBooking.userId}`);
        await session.abortTransaction();
        return res.status(500).json({ message: "Failed to update mock count." });
      }

      await session.commitTransaction();

      res.json({
        success: true,
        message: "Booking canceled successfully, and mock count restored",
      });
    } catch (error) {
      if (session.inTransaction()) {
        try { await session.abortTransaction(); } catch {}
      }
      console.error("Error canceling booking:", error);
      res.status(500).json({ message: "Internal server error" });
    } finally {
      await session.endSession();
    }
  });

  return router;
};
