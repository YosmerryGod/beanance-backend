import nodemailer from "nodemailer";

export function createEmailSender(config) {
  if (!config.smtpHost || !config.smtpFrom) {
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser
      ? { user: config.smtpUser, pass: config.smtpPassword }
      : undefined
  });

  return async ({ to, code, purpose }) => {
    const subject = purpose === "register"
      ? "Verify your Beanance email"
      : "Confirm your Beanance password change";

    const action = purpose === "register"
      ? "complete your Beanance registration"
      : "confirm your password change";

    await transporter.sendMail({
      from: config.smtpFrom,
      to,
      subject,
      text: `Your Beanance verification code is ${code}. Use this code to ${action}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#171717"><h2>Beanance verification</h2><p>Use this code to ${action}:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:16px 0">${code}</div><p>This code expires in 10 minutes.</p><p>If you did not request this, you can ignore this email.</p></div>`
    });
  };
}
