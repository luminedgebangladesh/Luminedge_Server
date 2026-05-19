const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: "mail.luminedge.com.bd",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.APP_PASS,
  },
});

const sendWithRetry = async (mailOptions, retries = 2) => {
  for (let i = 0; i <= retries; i++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err) {
      if (i === retries) throw err;
      console.warn(`📨 Retry ${i + 1} failed: ${err.message}`);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
};

const emailSender = async (subject, to, content, attachments) => {
  try {
    if (!subject || !to || !content) {
      throw new Error("Missing required fields: subject, to, or content");
    }

    const info = await sendWithRetry({
      from: `"Luminedge" <${process.env.EMAIL}>`,
      to,
      subject,
      html: content,
      ...(attachments?.length ? { attachments } : {}),
    });

    console.log(`📩 Email sent to ${to}: ${info.response}`);
    return { success: true, info };
  } catch (error) {
    console.error(`❌ Final email failure to ${to}:`, error.message);
    return { success: false, error };
  }
};

module.exports = { emailSender };
