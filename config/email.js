const nodemailer = require("nodemailer");

const isProd = process.env.NODE_ENV === "production";

const toBool = (v) => {
    if (typeof v === "boolean") return v;
    if (!v) return false;
    return String(v).toLowerCase() === "true";
};

const getSmtpConfig = () => {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const secure = process.env.SMTP_SECURE
        ? toBool(process.env.SMTP_SECURE)
        : port === 465;

    return { host, port, user, pass, secure };
};

const ensureEmailConfigured = () => {
    const { host, port, user, pass } = getSmtpConfig();
    if (!host || !port || !user || !pass) {
        const missing = [
            !host ? "SMTP_HOST" : null,
            !port ? "SMTP_PORT" : null,
            !user ? "SMTP_USER" : null,
            !pass ? "SMTP_PASS" : null,
        ].filter(Boolean);

        const err = new Error(`Email is not configured (missing: ${missing.join(", ")})`);
        err.status = isProd ? 500 : 400;
        err.code = "EMAIL_NOT_CONFIGURED";
        throw err;
    }
};

let cachedTransporter = null;

const getTransporter = () => {
    if (cachedTransporter) return cachedTransporter;

    const { host, port, secure, user, pass } = getSmtpConfig();

    cachedTransporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });

    return cachedTransporter;
};

const buildResetUrl = (resetToken, req) => {
    const frontendBase = (process.env.FRONTEND_BASE_URL || "").trim().replace(/\/$/, "");
    if (frontendBase) {
        return `${frontendBase}/reset-password?token=${encodeURIComponent(resetToken)}`;
    }

    // Fallback (useful for local testing): link to backend reset endpoint.
    const origin = req ? `${req.protocol}://${req.get("host")}` : "";
    return origin ? `${origin}/api/auth/reset-password/${encodeURIComponent(resetToken)}` : null;
};

const sendPasswordResetEmail = async ({ to, resetToken, req }) => {
    ensureEmailConfigured();

    const from = (process.env.EMAIL_FROM || "").trim() || process.env.SMTP_USER;
    const appName = (process.env.APP_NAME || "StoreTrack").trim();

    const resetUrl = buildResetUrl(resetToken, req);
    if (!resetUrl) {
        const err = new Error("Unable to construct reset URL");
        err.status = 500;
        err.code = "RESET_URL_MISSING";
        throw err;
    }

    const transporter = getTransporter();

    const subject = `${appName} password reset`;

    const text = [
        `You requested a password reset for ${appName}.`,
        "",
        `Reset your password using this link (valid for 30 minutes):`,
        resetUrl,
        "",
        "If you did not request this, you can ignore this email.",
    ].join("\n");

    const html = `
    <p>You requested a password reset for <strong>${appName}</strong>.</p>
    <p>Reset your password using this link (valid for 30 minutes):</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you did not request this, you can ignore this email.</p>
  `.trim();

    await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });

    return { resetUrl };
};

const sendEmailVerificationOtp = async ({ to, otp }) => {
    ensureEmailConfigured();

    const from = (process.env.EMAIL_FROM || "").trim() || process.env.SMTP_USER;
    const appName = (process.env.APP_NAME || "StoreTrack").trim();

    const transporter = getTransporter();

    const subject = `${appName} verification code`;

    const text = [
        `Your ${appName} verification code is: ${otp}`,
        "",
        "This code expires soon. If you did not create an account, you can ignore this email.",
    ].join("\n");

    const html = `
    <p>Your <strong>${appName}</strong> verification code is:</p>
    <p style="font-size: 20px; letter-spacing: 2px;"><strong>${otp}</strong></p>
    <p>This code expires soon. If you did not create an account, you can ignore this email.</p>
  `.trim();

    await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
    });
};

module.exports = {
    ensureEmailConfigured,
    buildResetUrl,
    sendPasswordResetEmail,
    sendEmailVerificationOtp,
};
