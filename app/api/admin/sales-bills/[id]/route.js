
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "../../../../../lib/db";
import { verifyAdminToken } from "../../../../../lib/admin-auth";

import Sale from "../../../../models/Sale";
import Product from "../../../../models/Product";
import JewelleryLedger from "../../../../models/JewelleryLedger";
import SilverMatch from "../../../../models/SilverMatch";

async function isAdmin() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("sivaah_admin_access")?.value;

        if (!token) return false;

        return Boolean(await verifyAdminToken(token));
    } catch {
        return false;
    }
}

export async function DELETE(request, { params }) {
    let session = null;

    try {
        if (!(await isAdmin())) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
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

        session = await mongoose.startSession();

        let result = null;

        await session.withTransaction(async () => {
            const sale = await Sale.findById(id).session(session);

            if (!sale) {
                throw new Error("BILL_NOT_FOUND");
            }

            if (sale.status !== "completed") {
                throw new Error("BILL_ALREADY_CANCELLED");
            }

            const items = sale.items || [];

            if (!items.length) {
                throw new Error("BILL_HAS_NO_ITEMS");
            }

            const affectedProducts = new Set();

            // 1. Validate and restore every sold jewellery piece.
            for (const item of items) {
                if (
                    !mongoose.Types.ObjectId.isValid(
                        String(item.productId || "")
                    ) ||
                    !mongoose.Types.ObjectId.isValid(
                        String(item.pieceId || "")
                    )
                ) {
                    throw new Error("INVALID_STOCK_REFERENCE");
                }

                const product = await Product.findById(
                    item.productId
                ).session(session);

                const piece = product?.pieces?.id(item.pieceId);

                if (!product || !piece || piece.status !== "sold") {
                    throw new Error(
                        `STOCK_NOT_AVAILABLE:${item.name || "Unknown product"}`
                    );
                }

                const update = await Product.updateOne(
                    {
                        _id: item.productId,
                        pieces: {
                            $elemMatch: {
                                _id: item.pieceId,
                                status: "sold",
                            },
                        },
                    },
                    {
                        $set: {
                            "pieces.$.status": "inStock",
                        },
                    },
                    { session }
                );

                if (update.modifiedCount !== 1) {
                    throw new Error("STOCK_UPDATE_FAILED");
                }

                affectedProducts.add(String(item.productId));
            }

            // 2. Recalculate stock quantity for affected products.
            for (const productId of affectedProducts) {
                const product = await Product.findById(
                    productId
                ).session(session);

                if (!product) {
                    throw new Error("PRODUCT_NOT_FOUND");
                }

                product.stockQuantity = product.pieces.filter(
                    (piece) => piece.status === "inStock"
                ).length;

                await product.save({ session });
            }

            // 3. Void all silver ledger entries created by this sale.
            const ledgerResult = await JewelleryLedger.updateMany(
                {
                    saleId: sale._id,
                    movementType: "sale",
                    isVoided: { $ne: true },
                },
                {
                    $set: {
                        isVoided: true,
                        voidReason: `Bill ${sale.billNumber} cancelled`,
                    },
                },
                { session }
            );

            // 4. Reverse confirmed silver matches belonging to this sale.
            const matchResult = await SilverMatch.updateMany(
                {
                    saleId: sale._id,
                    status: "confirmed",
                },
                {
                    $set: {
                        status: "reversed",
                        reversalReason: `Bill ${sale.billNumber} cancelled`,
                    },
                },
                { session }
            );

            // 5. Cancel the sale instead of permanently deleting it.
            sale.status = "cancelled";
            await sale.save({ session });

            result = {
                billNumber: sale.billNumber,
                restoredPieces: items.length,
                affectedProducts: affectedProducts.size,
                voidedLedgerEntries: ledgerResult.modifiedCount,
                reversedSilverMatches: matchResult.modifiedCount,
            };
        });

        return NextResponse.json({
            success: true,
            message: `Bill ${result.billNumber} cancelled successfully. Stock restored and accounting entries reversed.`,
            details: result,
        });

    } catch (error) {
        console.error("Bill cancellation error:", error);

        const messages = {
            BILL_NOT_FOUND: ["Bill not found.", 404],
            BILL_ALREADY_CANCELLED: ["This bill is already cancelled.", 409],
            BILL_HAS_NO_ITEMS: ["Bill has no item snapshots.", 409],
            INVALID_STOCK_REFERENCE: ["Invalid stock references. No changes were saved.", 409],
            STOCK_UPDATE_FAILED: ["Stock update failed. No changes were saved.", 409],
            PRODUCT_NOT_FOUND: ["Product not found. No changes were saved.", 409],
        };

        if (error.message.startsWith("STOCK_NOT_AVAILABLE:")) {
            return NextResponse.json(
                {
                    error: `Cannot cancel safely. ${error.message.split(":")[1]} is missing or not marked as sold.`,
                },
                { status: 409 }
            );
        }

        const knownError = messages[error.message];

        return NextResponse.json(
            {
                error: knownError
                    ? knownError[0]
                    : "Unable to cancel bill. No partial changes were saved.",
            },
            { status: knownError ? knownError[1] : 500 }
        );

    } finally {
        if (session) {
            await session.endSession();
        }
    }
}
