

const Staff = require("../models/Staff");
const jwt = require("jsonwebtoken");

const isProd = process.env.NODE_ENV === "production";

const buildCookieOptions = (maxAgeMs) => ({
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: maxAgeMs,
    path: "/",
});

const generateTokens = (staff) => {
    const accessToken = jwt.sign({ id: staff._id, typ: "staff", role: staff.role }, process.env.JWT_ACCESS_SECRET, {
        expiresIn: process.env.JWT_ACCESS_EXPIRES,
    });

    const refreshToken = jwt.sign({ id: staff._id, typ: "staff" }, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES,
    });

    return { accessToken, refreshToken };
};

const setStaffAuthCookies = (res, tokens) => {
    const accessMaxAgeMs = 1000 * 60 * 60 * 24; // 1 day
    const refreshMaxAgeMs = 1000 * 60 * 60 * 24 * 7; // 7 days

    res.cookie("accessToken", tokens.accessToken, buildCookieOptions(accessMaxAgeMs));
    // Separate cookie name to avoid clobbering admin refreshToken
    res.cookie("staffRefreshToken", tokens.refreshToken, buildCookieOptions(refreshMaxAgeMs));
};

const clearStaffAuthCookies = (res) => {
    res.clearCookie("accessToken", { path: "/" });
    res.clearCookie("staffRefreshToken", { path: "/" });
};

exports.loginStaff = async (req, res) => {
    const { email, password } = req.body;

    const staff = await Staff.findOne({ email }).select("+password");
    if (!staff) return res.status(400).json({ message: "Invalid credentials" });

    const match = await staff.comparePassword(password);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    const tokens = generateTokens(staff);

    // Store refresh token in DB so we can revoke/rotate
    staff.refreshToken = tokens.refreshToken;
    await staff.save();

    // Cookie-based auth support for staff
    setStaffAuthCookies(res, tokens);

    res.json({
        staff: {
            id: staff._id,
            name: staff.name,
            role: staff.role,
            store: staff.store,
        },
        tokens,
    });
};

exports.refreshStaff = async (req, res) => {
    const refreshToken = (req.body?.refreshToken ?? req.cookies?.staffRefreshToken) || null;

    if (!refreshToken) {
        return res.status(400).json({
            message: "Refresh token required",
            hint: "Send JSON body { \"refreshToken\": \"...\" } or use the HttpOnly staffRefreshToken cookie",
        });
    }

    try {
        const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        if (payload?.typ !== "staff") {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        const staff = await Staff.findById(payload.id).select("+refreshToken");
        if (!staff || staff.refreshToken !== refreshToken) {
            return res.status(401).json({ message: "Invalid refresh token" });
        }

        const tokens = generateTokens(staff);

        staff.refreshToken = tokens.refreshToken;
        await staff.save();

        setStaffAuthCookies(res, tokens);
        res.json({ tokens });
    } catch (err) {
        res.status(401).json({ message: "Invalid refresh token" });
    }
};

exports.logoutStaff = async (req, res) => {
    const refreshToken = (req.body?.refreshToken ?? req.cookies?.staffRefreshToken) || null;

    try {
        if (refreshToken) {
            const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            if (payload?.typ === "staff") {
                const staff = await Staff.findById(payload.id).select("+refreshToken");
                if (staff && staff.refreshToken === refreshToken) {
                    staff.refreshToken = null;
                    await staff.save();
                }
            }
        }
    } catch {
        // ignore invalid refresh tokens on logout
    }

    clearStaffAuthCookies(res);
    res.json({ message: "Logged out" });
};
