require("dotenv").config();

// Smoke tests run in a controlled dev environment; allow returning OTP so we can auto-verify.
if (process.env.NODE_ENV !== "production") {
  process.env.RETURN_EMAIL_OTP = process.env.RETURN_EMAIL_OTP || "true";
}

const app = require("../server");

if (typeof fetch !== "function") {
  console.error(
    "This smoke test requires Node.js with global fetch (Node 18+). Please upgrade Node or polyfill fetch."
  );
  process.exit(1);
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

(async () => {
  const server = app.listen(0);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const adminEmail = process.env.SMOKE_ADMIN_EMAIL || "zintra.local@cth.com";
    const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || "secure1234";
    const adminName = process.env.SMOKE_ADMIN_NAME || "Smoke Admin";
    const adminStore = process.env.SMOKE_ADMIN_STORE || "Smoke Store";

    const ensureVerifiedLogin = async () => {
      try {
        const login = await jsonFetch(`${base}/api/auth/login`, {
          method: "POST",
          body: JSON.stringify({ email: adminEmail, password: adminPassword }),
        });
        return login;
      } catch (e) {
        const msg = String(e.body?.message || "");

        // If user doesn't exist, create it.
        if (e.status === 400 && msg === "Invalid credentials") {
          try {
            await jsonFetch(`${base}/api/auth/register`, {
              method: "POST",
              body: JSON.stringify({ name: adminName, email: adminEmail, password: adminPassword, store: adminStore }),
            });
          } catch (regErr) {
            // ignore "already exists" during races or reruns
            if (!(regErr.status === 400 && String(regErr.body?.message || "") === "User already exists")) {
              throw regErr;
            }
          }
        }

        // If not verified (or just created), request/resend code and verify.
        if (e.status === 403 || (e.status === 400 && msg === "Invalid credentials")) {
          const resend = await jsonFetch(`${base}/api/auth/resend-verification`, {
            method: "POST",
            body: JSON.stringify({ email: adminEmail }),
          });

          const otp = resend?.verificationOtp;
          if (!otp) {
            throw new Error(
              "Smoke test requires RETURN_EMAIL_OTP=true to auto-verify. OTP was not returned by /resend-verification."
            );
          }

          await jsonFetch(`${base}/api/auth/verify-email`, {
            method: "POST",
            body: JSON.stringify({ email: adminEmail, code: otp }),
          });

          return await jsonFetch(`${base}/api/auth/login`, {
            method: "POST",
            body: JSON.stringify({ email: adminEmail, password: adminPassword }),
          });
        }

        throw e;
      }
    };

    const login = await ensureVerifiedLogin();

    const token = login?.tokens?.accessToken;
    if (!token) throw new Error("Login did not return accessToken");

    const headers = { Authorization: `Bearer ${token}` };

    const milk = await jsonFetch(`${base}/api/products`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Milk",
        sku: "SKU-MILK",
        barcode: "123MILK",
        price: 500,
        costPrice: 350,
        quantity: 20,
      }),
    });

    const bread = await jsonFetch(`${base}/api/products`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Bread",
        sku: "SKU-BREAD",
        barcode: "123BREAD",
        price: 300,
        costPrice: 200,
        quantity: 10,
      }),
    });

    const lookup = await jsonFetch(`${base}/api/products/lookup?sku=SKU-MILK`, { headers });
    const search = await jsonFetch(`${base}/api/products/search?q=bre&limit=5`, { headers });

    const staff = await jsonFetch(`${base}/api/staff`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Cashier", email: `cashier_${Date.now()}@test.com`, password: "password123", role: "staff" }),
    });

    const staffLogin = await jsonFetch(`${base}/api/staff-auth/login`, {
      method: "POST",
      body: JSON.stringify({ email: staff.email, password: "password123" }),
    });

    const staffRefreshToken = staffLogin?.tokens?.refreshToken;
    if (!staffRefreshToken) throw new Error("Staff login did not return refreshToken");

    const staffRefresh = await jsonFetch(`${base}/api/staff-auth/refresh`, {
      method: "POST",
      body: JSON.stringify({ refreshToken: staffRefreshToken }),
    });

    const staffLogout = await jsonFetch(`${base}/api/staff-auth/logout`, {
      method: "POST",
      body: JSON.stringify({ refreshToken: staffRefresh?.tokens?.refreshToken ?? staffRefreshToken }),
    });

    let checkout;
    try {
      checkout = await jsonFetch(`${base}/api/sales/checkout`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          items: [
            { product: milk._id, quantity: 2 },
            { product: bread._id, quantity: 1 },
          ],
          client: { expectedTotal: 1300 },
        }),
      });
    } catch (e) {
      // Transactions require a replica set; print a helpful hint.
      if (String(e.body?.message || e.message).toLowerCase().includes("replica set")) {
        console.error("Checkout failed: MongoDB transactions require a replica set (Atlas cluster supports this).", e.body);
        checkout = null;
      } else {
        throw e;
      }
    }

    const salesList = await jsonFetch(`${base}/api/sales?limit=2&sort=-createdAt`, { headers });

    const transactions = await jsonFetch(`${base}/api/sales/transactions?limit=5`, { headers });

    const firstTxId = transactions?.data?.[0]?.id || checkout?.transaction?.id;
    const transactionDetails = firstTxId
      ? await jsonFetch(`${base}/api/sales/transactions/${firstTxId}`, { headers })
      : null;

    const receipt = firstTxId
      ? await jsonFetch(`${base}/api/sales/transactions/${firstTxId}/receipt`, { headers })
      : null;

    const cashierType = checkout?.transaction?.cashierType ?? receipt?.transaction?.cashierType ?? null;
    const cashierUser = checkout?.transaction?.cashierUser ?? receipt?.transaction?.cashierUser ?? null;
    const cashierName = checkout?.transaction?.cashierName ?? receipt?.transaction?.cashierName ?? null;

    // If checkout succeeded, assert we got the new cashier attribution fields.
    if (checkout) {
      if (cashierType !== "user") {
        throw new Error(`Expected cashierType='user' for admin/manager checkout, got '${cashierType}'`);
      }
      if (!cashierUser) {
        throw new Error("Expected cashierUser to be present for admin/manager checkout");
      }
      if (!cashierName) {
        throw new Error("Expected cashierName to be present for admin/manager checkout");
      }
    }

    console.log(JSON.stringify({
      ok: true,
      productLookupSku: lookup.sku,
      productSearchCount: Array.isArray(search) ? search.length : null,
      checkoutTotal: checkout?.transaction?.total ?? null,
      checkoutMatches: checkout?.validation?.matches ?? null,
      checkoutCashierType: cashierType,
      checkoutCashierUser: cashierUser,
      checkoutCashierName: cashierName,
      salesMeta: salesList?.meta,
      salesDataCount: Array.isArray(salesList?.data) ? salesList.data.length : null,
      transactionsCount: Array.isArray(transactions?.data) ? transactions.data.length : null,
      firstTransactionTotal: transactionDetails?.transaction?.total ?? null,
      receiptTotal: receipt?.transaction?.total ?? null,
      staffLogoutMessage: staffLogout?.message ?? null,
    }, null, 2));
  } finally {
    server.close();
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
