
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "../../../../../lib/db";
import { verifyAdminToken } from "../../../../../lib/admin-auth";
import Sale from "../../../../models/Sale";
import Product from "../../../../models/Product";

async function isAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sivaah_admin_access")?.value;
  return Boolean(token && verifyAdminToken(token));
}

export async function DELETE(request, { params }) {
  const restoredPieces = [];

  try {
    if (!(await isAdmin())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const expectedCode = process.env.SALE_DELETE_CODE;

    if (!expectedCode) {
      return NextResponse.json(
        { error: "SALE_DELETE_CODE is not configured on the server." },
        { status: 500 }
      );
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { error: "Invalid bill ID." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const suppliedCode = String(body.deleteCode || "");

    if (suppliedCode !== expectedCode) {
      return NextResponse.json(
        { error: "Incorrect delete code." },
        { status: 403 }
      );
    }

    await connectDB();

    const sale = await Sale.findById(id);

    if (!sale) {
      return NextResponse.json(
        { error: "Bill not found." },
        { status: 404 }
      );
    }

    const items = sale.items || [];

    if (!items.length) {
      return NextResponse.json(
        { error: "This bill has no item snapshots. Cannot safely restore stock." },
        { status: 409 }
      );
    }

    // Validate every product and piece before modifying any stock.
    const stockRows = [];

    for (const item of items) {
      if (
        !mongoose.Types.ObjectId.isValid(String(item.productId || "")) ||
        !mongoose.Types.ObjectId.isValid(String(item.pieceId || ""))
      ) {
        return NextResponse.json(
          { error: "A bill item has invalid stock references. No stock was changed." },
          { status: 409 }
        );
      }

      const product = await Product.findById(item.productId);
      const piece = product?.pieces?.id(item.pieceId);

      if (!product || !piece || piece.status !== "sold") {
        return NextResponse.json(
          {
            error: `Cannot safely delete bill: stock for "${item.name || "an item"}" is missing or no longer marked sold. No stock was changed.`,
          },
          { status: 409 }
        );
      }

      stockRows.push({
        productId: product._id,
        pieceId: piece._id,
      });
    }

    // Restore stock conditionally. Roll back earlier changes if a later
    // update or bill deletion fails.
    for (const row of stockRows) {
      const result = await Product.updateOne(
        {
          _id: row.productId,
          pieces: {
            $elemMatch: {
              _id: row.pieceId,
              status: "sold",
            },
          },
        },
        { $set: { "pieces.$.status": "inStock" } }
      );

      if (result.modifiedCount !== 1) {
        throw new Error(
          "Stock changed during deletion. Refresh inventory and investigate before retrying."
        );
      }

      restoredPieces.push(row);
    }

    await Sale.deleteOne({ _id: sale._id });

    return NextResponse.json({
      success: true,
      message: `Bill ${sale.billNumber || ""} deleted and stock restored.`,
    });
  } catch (error) {
    console.error("Bill deletion error:", error);

    // Best-effort stock rollback if deletion fails.
    for (const row of restoredPieces.reverse()) {
      try {
        await Product.updateOne(
          {
            _id: row.productId,
            pieces: {
              $elemMatch: {
                _id: row.pieceId,
                status: "inStock",
              },
            },
          },
          { $set: { "pieces.$.status": "sold" } }
        );
      } catch (rollbackError) {
        console.error("Stock rollback error:", rollbackError);
      }
    }

    return NextResponse.json(
      { error: error.message || "Unable to delete bill." },
      { status: 500 }
    );
  }
}
