/**
 * Sivaah WhatsApp Cloud API Service (Node.js / Next.js)
 * Supports:
 * 1. Direct PDF Upload to Meta Media API + Automated GST Invoice Delivery
 * 2. Automated Daily Birthday Wishes (Cron Job)
 * 3. Bulk Promotional Offer Broadcasts (Rate-limited Queue)
 * 4. Webhook Verification, Delivery Status Logging & Opt-Out ("Stop Promotions")
 *
 * Required .env variables:
 *   WHATSAPP_PHONE_NUMBER_ID=1509637195559400
 *   WHATSAPP_BUSINESS_ACCOUNT_ID=1459672209620000
 *   WHATSAPP_ACCESS_TOKEN=your_permanent_system_user_token
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN=sivaah_webhook_secret_2026
 */

const GRAPH_API_VERSION = "v21.0";

function formatIndianPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `91${digits.slice(-10)}`;
}

async function callWhatsAppApi(payload) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in .env");
  }
console.log("[DEBUG WP] Using PhoneNumberID:", phoneNumberId);
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("[Sivaah WhatsApp API Error]:", JSON.stringify(data));
    throw new Error(data?.error?.message || "WhatsApp API request failed");
  }

  return data;
}

/**
 * Upload PDF buffer directly to Meta WhatsApp Cloud API
 */
async function uploadWhatsAppMedia(pdfBuffer, filename) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN in .env");
  }

  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);
  formData.append("type", "application/pdf");

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  const data = await res.json();
  if (!res.ok) {
    console.error("[WhatsApp Media Upload Error]:", JSON.stringify(data));
    throw new Error(data?.error?.message || "Failed to upload PDF to WhatsApp");
  }

  return data.id;
}

/**
 * 1. Send Automated GST PDF Invoice (Utility Template: sivaah_invoice_pdf)
 */
async function sendWhatsAppInvoice({
  customerPhone,
  customerName,
  invoiceNo,
  totalPaid,
  mediaId,
  pdfUrl,
}) {
  const to = formatIndianPhone(customerPhone);
  if (!to) throw new Error(`Invalid customer phone number: ${customerPhone}`);

  const documentObj = mediaId
    ? { id: mediaId, filename: `Sivaah_Invoice_${invoiceNo}.pdf` }
    : { link: pdfUrl, filename: `Sivaah_Invoice_${invoiceNo}.pdf` };

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: "sivaah_invoice_pdf",
      language: { code: "en" },
      components: [
        {
          type: "header",
          parameters: [{ type: "document", document: documentObj }],
        },
        {
          type: "body",
          parameters: [
            { type: "text", text: customerName || "Customer" },
            { type: "text", text: String(invoiceNo) },
            { type: "text", text: Number(totalPaid).toLocaleString("en-IN") },
          ],
        },
      ],
    },
  };

  return await callWhatsAppApi(payload);
}

/**
 * 2. Send Automated Birthday Wish (Marketing Template: sivaah_birthday_wish)
 */
async function sendWhatsAppBirthdayWish({
  customerPhone,
  customerName,
  discountPercent = "20",
  couponCode = "BDAY20",
  bannerImageUrl = null,
}) {
  const to = formatIndianPhone(customerPhone);
  if (!to) throw new Error(`Invalid customer phone number: ${customerPhone}`);

  const components = [];

  if (bannerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: bannerImageUrl },
        },
      ],
    });
  }

  components.push({
    type: "body",
    parameters: [
      { type: "text", text: customerName || "Valued Customer" },
      { type: "text", text: String(discountPercent) },
      { type: "text", text: couponCode },
    ],
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: "sivaah_birthday_wish",
      language: { code: "en" },
      components,
    },
  };

  return await callWhatsAppApi(payload);
}

/**
 * 3. Send Promotional / Festive Offer Broadcast (Marketing Template: sivaah_promo_offer)
 */
async function sendWhatsAppPromoOffer({
  customerPhone,
  customerName,
  offerMessage,
  bannerImageUrl = null,
}) {
  const to = formatIndianPhone(customerPhone);
  if (!to) throw new Error(`Invalid customer phone number: ${customerPhone}`);

  const components = [];

  if (bannerImageUrl) {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: { link: bannerImageUrl },
        },
      ],
    });
  }

  components.push({
    type: "body",
    parameters: [
      { type: "text", text: customerName || "Friend" },
      { type: "text", text: offerMessage },
    ],
  });

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: "sivaah_promo_offer",
      language: { code: "en" },
      components,
    },
  };

  return await callWhatsAppApi(payload);
}

/**
 * 4. Rate-Limited Bulk Campaign Runner
 */
async function runBulkPromoCampaign(customers, offerMessage, bannerImageUrl = null, delayMs = 250) {
  const results = { sent: 0, failed: 0, errors: [] };

  for (const customer of customers) {
    if (customer.whatsapp_opt_in === false) continue;

    try {
      await sendWhatsAppPromoOffer({
        customerPhone: customer.phone,
        customerName: customer.name,
        offerMessage,
        bannerImageUrl,
      });
      results.sent += 1;
    } catch (err) {
      results.failed += 1;
      results.errors.push({ phone: customer.phone, error: err.message });
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return results;
}

/**
 * 5. Daily Birthday Cron Helper
 */
async function runDailyBirthdayJob(CustomerModel, options = {}) {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const month = nowIST.getMonth() + 1;
  const day = nowIST.getDate();

  const birthdayCustomers = await CustomerModel.find({
    whatsapp_opt_in: { $ne: false },
    $expr: {
      $and: [
        { $eq: [{ $month: "$dob" }, month] },
        { $eq: [{ $dayOfMonth: "$dob" }, day] },
      ],
    },
  });

  const results = { total: birthdayCustomers.length, sent: 0, failed: 0 };

  for (const customer of birthdayCustomers) {
    try {
      await sendWhatsAppBirthdayWish({
        customerPhone: customer.phone,
        customerName: customer.name,
        discountPercent: options.discountPercent || "20",
        couponCode: options.couponCode || "BDAY20",
        bannerImageUrl: options.bannerImageUrl || null,
      });
      results.sent += 1;
    } catch (err) {
      results.failed += 1;
      console.error(`[Birthday Wish Failed] ${customer.phone}:`, err.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return results;
}

/**
 * 6. Express / Next.js Webhook Handlers
 */
function verifyWhatsAppWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function handleWhatsAppWebhook(req, res, CustomerModel) {
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes) return;

    if (Array.isArray(changes.messages)) {
      for (const msg of changes.messages) {
        const buttonText = msg?.button?.text || msg?.interactive?.button_reply?.title || "";
        if (buttonText.trim().toLowerCase() === "stop promotions") {
          const last10 = String(msg.from).slice(-10);
          await CustomerModel.updateMany(
            { phone: { $regex: `${last10}$` } },
            { $set: { whatsapp_opt_in: false, whatsapp_opted_out_at: new Date() } }
          );
          console.log(`[WhatsApp Opt-Out] Marked ${last10} as opted out from promotions.`);
        }
      }
    }

    if (Array.isArray(changes.statuses)) {
      for (const statusObj of changes.statuses) {
        console.log(
          `[WhatsApp Status] ID: ${statusObj.id} | To: ${statusObj.recipient_id} | Status: ${statusObj.status}`
        );
        if (statusObj.errors) {
          console.error("[WhatsApp Delivery Error]:", JSON.stringify(statusObj.errors));
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp Webhook Processing Error]:", err);
  }
}

module.exports = {
  uploadWhatsAppMedia,
  sendWhatsAppInvoice,
  sendWhatsAppBirthdayWish,
  sendWhatsAppPromoOffer,
  runBulkPromoCampaign,
  runDailyBirthdayJob,
  verifyWhatsAppWebhook,
  handleWhatsAppWebhook,
};