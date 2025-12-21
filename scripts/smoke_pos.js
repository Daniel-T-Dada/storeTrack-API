require("dotenv").config();

const app = require("../server");

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

    const login = await jsonFetch(`${base}/api/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });

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
          staff: staff._id,
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

    console.log(JSON.stringify({
      ok: true,
      productLookupSku: lookup.sku,
      productSearchCount: Array.isArray(search) ? search.length : null,
      checkoutTotal: checkout?.transaction?.total ?? null,
      checkoutMatches: checkout?.validation?.matches ?? null,
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
