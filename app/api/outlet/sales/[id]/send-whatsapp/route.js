import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendWhatsAppInvoice } from "@/lib/sivaahWhatsappService"; // adjust path to where you saved sivaahWhatsappService.js

async function uploadPdfToCloudinary(pdfBuffer, filename) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  const timestamp = Math.round(Date.now() / 1000);
  const publicId = `sivaah_invoices/${filename.replace(/\.pdf$/i, "")}_${timestamp}`;
  const folder = "sivaah_invoices";

  // Sign Cloudinary upload request
  const signatureString = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

  const formData = new FormData();
  formData.append("file", new Blob([pdfBuffer], { type: "application/pdf" }), filename);
  formData.append("api_key", apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  formData.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/raw/upload`, {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Failed to upload invoice PDF to Cloudinary");
  }

  return data.secure_url;
}

export async function POST(request, { params }) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get("file");
    const customerPhone = formData.get("customerPhone");
    const customerName = formData.get("customerName");
    const invoiceNo = formData.get("invoiceNo");
    const totalPaid = formData.get("totalPaid");

    if (!pdfFile || !customerPhone) {
      return NextResponse.json(
        { error: "Invoice PDF file and customer WhatsApp number are required." },
        { status: 400 }
      );
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const filename = `${invoiceNo || params.id || "Sivaah-Invoice"}.pdf`;

    // 1. Upload PDF to get a public HTTPS URL for Meta Cloud API
    const pdfUrl = await uploadPdfToCloudinary(pdfBuffer, filename);

    // 2. Send via WhatsApp Cloud API (sivaah_invoice_pdf template)
    const waResponse = await sendWhatsAppInvoice({
      customerPhone,
      customerName: customerName || "Customer",
      invoiceNo: invoiceNo || params.id,
      totalPaid: Number(totalPaid) || 0,
      pdfUrl,
    });

    return NextResponse.json({
      success: true,
      pdfUrl,
      messageId: waResponse?.messages?.[0]?.id || null,
    });
  } catch (error) {
    console.error("[Send Invoice WhatsApp Error]:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send invoice on WhatsApp." },
      { status: 500 }
    );
  }
}