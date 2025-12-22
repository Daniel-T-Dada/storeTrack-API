require("dotenv").config();

const maskEmail = (email) => {
    if (!email) return null;
    const s = String(email);
    const at = s.indexOf("@");
    if (at <= 1) return "***";
    return `${s.slice(0, 1)}***${s.slice(at)}`;
};

const baseUrl = (process.env.E2E_BASE_URL || `http://localhost:${process.env.PORT || 5000}`).replace(/\/$/, "");

const rawEmail = (process.env.E2E_EMAIL || process.env.SMTP_USER || "").trim();
if (!rawEmail) {
    console.error("Missing E2E_EMAIL (or SMTP_USER in .env)");
    process.exit(1);
}

const email = rawEmail.toLowerCase();
const password = (process.env.E2E_PASSWORD || "Test12345!").trim();
const newPassword = (process.env.E2E_NEW_PASSWORD || "NewTest12345!").trim();
const store = (process.env.E2E_STORE || "E2E Store").trim();
const name = (process.env.E2E_NAME || "E2E User").trim();

const extractTokenFromResetLink = (maybeUrl) => {
    if (!maybeUrl) return null;
    try {
        const u = new URL(String(maybeUrl));
        const token = u.searchParams.get("token");
        return token || null;
    } catch {
        return null;
    }
};

const postJson = async (path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        // ignore
    }

    return {
        status: res.status,
        ok: res.ok,
        json,
        text,
    };
};

(async () => {
    console.log(
        JSON.stringify(
            {
                baseUrl,
                e2eEmail: maskEmail(email),
            },
            null,
            2
        )
    );

    // 1) Ensure a user exists for forgot-password
    const register = await postJson("/api/auth/register", { name, email, password, store });
    const registerMsg = register.json?.message;

    console.log(
        JSON.stringify(
            {
                step: "register",
                status: register.status,
                ok: register.ok,
                message: registerMsg,
            },
            null,
            2
        )
    );

    // Allow "already exists" to proceed
    if (!register.ok && !(register.status === 400 && registerMsg === "User already exists")) {
        console.error(
            JSON.stringify(
                {
                    step: "register",
                    error: "Unexpected response",
                    status: register.status,
                    body: register.json || register.text,
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    // 2) Call forgot-password
    const forgot = await postJson("/api/auth/forgot-password", { email });

    // Don’t print reset tokens/urls if present; only show which fields came back.
    const forgotFields = forgot.json && typeof forgot.json === "object" ? Object.keys(forgot.json) : null;

    console.log(
        JSON.stringify(
            {
                step: "forgot-password",
                status: forgot.status,
                ok: forgot.ok,
                fields: forgotFields,
                message: forgot.json?.message,
                error: forgot.ok ? undefined : forgot.json || forgot.text,
            },
            null,
            2
        )
    );

    if (!forgot.ok) process.exit(1);

    // 3) Reset password
    const tokenFromEnv = (process.env.E2E_RESET_TOKEN || "").trim() || null;
    const tokenFromLink = extractTokenFromResetLink((process.env.E2E_RESET_LINK || "").trim()) || null;
    const tokenFromResponse = forgot.json?.resetToken || null;

    const resetToken = tokenFromEnv || tokenFromLink || tokenFromResponse;
    if (!resetToken) {
        console.error(
            JSON.stringify(
                {
                    step: "reset-password",
                    ok: false,
                    error:
                        "No reset token available. Set E2E_RESET_LINK (from your email) or enable RETURN_RESET_TOKEN=true in non-production.",
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    const reset = await postJson(`/api/auth/reset-password/${resetToken}`, { password: newPassword });
    const resetFields = reset.json && typeof reset.json === "object" ? Object.keys(reset.json) : null;

    console.log(
        JSON.stringify(
            {
                step: "reset-password",
                status: reset.status,
                ok: reset.ok,
                fields: resetFields,
                message: reset.json?.message,
                error: reset.ok ? undefined : reset.json || reset.text,
            },
            null,
            2
        )
    );

    if (!reset.ok) process.exit(1);

    // 4) Verify login with new password
    const login = await postJson("/api/auth/login", { email, password: newPassword });
    const loginFields = login.json && typeof login.json === "object" ? Object.keys(login.json) : null;

    console.log(
        JSON.stringify(
            {
                step: "login-with-new-password",
                status: login.status,
                ok: login.ok,
                fields: loginFields,
                hasTokens: Boolean(login.json?.tokens?.accessToken && login.json?.tokens?.refreshToken),
                hasUser: Boolean(login.json?.user?._id),
                error: login.ok ? undefined : login.json || login.text,
            },
            null,
            2
        )
    );

    if (!login.ok) process.exit(1);
})();
