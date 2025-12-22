require("dotenv").config();

const nodemailer = require("nodemailer");

const toBool = (v) => {
    if (typeof v === "boolean") return v;
    if (!v) return false;
    return String(v).toLowerCase() === "true";
};

const maskEmail = (email) => {
    if (!email) return null;
    const s = String(email);
    const at = s.indexOf("@");
    if (at <= 1) return "***";
    return `${s.slice(0, 1)}***${s.slice(at)}`;
};

(async () => {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const secure = process.env.SMTP_SECURE ? toBool(process.env.SMTP_SECURE) : port === 465;

    const from = (process.env.EMAIL_FROM || "").trim() || user;
    const to = (process.env.EMAIL_TEST_TO || "").trim() || user;
    const appName = (process.env.APP_NAME || "StoreTrack").trim();

    const missing = [
        !host ? "SMTP_HOST" : null,
        !port ? "SMTP_PORT" : null,
        !user ? "SMTP_USER" : null,
        !pass ? "SMTP_PASS" : null,
    ].filter(Boolean);

    if (missing.length) {
        console.error(`Missing email env vars: ${missing.join(", ")}`);
        process.exit(1);
    }

    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
    });

    try {
        await transporter.verify();

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    mode: "verify",
                    smtp: {
                        host,
                        port,
                        secure,
                        user: maskEmail(user),
                    },
                },
                null,
                2
            )
        );

        const send = String(process.env.EMAIL_TEST_SEND || "false").toLowerCase() === "true";
        if (!send) return;

        await transporter.sendMail({
            from,
            to,
            subject: `${appName} SMTP test`,
            text: `This is a test email from ${appName}.`,
        });

        console.log(
            JSON.stringify(
                {
                    ok: true,
                    mode: "send",
                    from: maskEmail(from),
                    to: maskEmail(to),
                },
                null,
                2
            )
        );
    } catch (err) {
        console.error(
            JSON.stringify(
                {
                    ok: false,
                    error: {
                        name: err?.name,
                        code: err?.code,
                        message: err?.message,
                    },
                },
                null,
                2
            )
        );
        process.exit(1);
    }
})();
