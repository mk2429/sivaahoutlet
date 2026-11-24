import { NextResponse } from "next/server";
import { uploadWhatsAppMedia, sendWhatsAppInvoice } from "@/lib/sivaahWhatsappService";

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

    // 1. Upload PDF directly to Meta WhatsApp Cloud API
    const mediaId = await uploadWhatsAppMedia(pdfBuffer, filename);

    // 2. Send invoice template using the returned mediaId
    const waResponse = await sendWhatsAppInvoice({
      customerPhone,
      customerName: customerName || "Customer",
      invoiceNo: invoiceNo || params.id,
      totalPaid: Number(totalPaid) || 0,
      mediaId,
    });

    return NextResponse.json({
      success: true,
      mediaId,
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