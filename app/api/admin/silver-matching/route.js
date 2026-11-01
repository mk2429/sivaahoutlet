
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";
import connectDB from "@/lib/db";
import { verifyAdminToken } from "@/lib/admin-auth";

import JewelleryLedger from "@/app/models/JewelleryLedger";
import SilverMatch from "@/app/models/SilverMatch";
import Sale from "@/app/models/Sale";

async function authorized() {
    try {
        const token = (await cookies()).get("sivaah_admin_access")?.value;
        return token ? Boolean(await verifyAdminToken(token)) : false;
    } catch {
        return false;
    }
}

function error(message, status = 400) {
    return NextResponse.json(
        { success: false, message },
        { status }
    );
}

// Convert grams to integer milligrams for accurate calculations.
function toMilligrams(value) {
    return Math.round(Number(value || 0) * 1000);
}

function fromMilligrams(value) {
    return Number((value / 1000).toFixed(3));
}

export async function GET() {
    if (!(await authorized())) {
        return error("Unauthorized", 401);
    }

    try {
        await connectDB();

        // 1. Get all active confirmed matches.
        const matches = await SilverMatch.find({
            status: "confirmed",
        })
            .select(
                "saleLedgerEntryId replacementLedgerEntryId matchedGrams"
            )
            .lean();

        // Calculate already matched weight against each ledger entry.
        const matchedSaleMap = new Map();
        const matchedReplacementMap = new Map();

        for (const match of matches) {
            const saleId = String(match.saleLedgerEntryId);
            const replacementId = String(match.replacementLedgerEntryId);
            const grams = toMilligrams(match.matchedGrams);

            matchedSaleMap.set(
                saleId,
                (matchedSaleMap.get(saleId) || 0) + grams
            );

            matchedReplacementMap.set(
                replacementId,
                (matchedReplacementMap.get(replacementId) || 0) + grams
            );
        }

        // 2. Find valid completed sales.
        const saleEntries = await JewelleryLedger.find({
            movementType: "sale",
            direction: "out",
            isVoided: false,
            saleId: { $ne: null },
        })
            .sort({ entryDate: 1, createdAt: 1 })
            .lean();

        const saleIds = [
            ...new Set(saleEntries.map((entry) => String(entry.saleId))),
        ];

        const sales = await Sale.find({
            _id: { $in: saleIds },
            status: "completed",
        })
            .select("_id billNumber silverRateAtSale createdAt")
            .lean();

        const salesMap = new Map(
            sales.map((sale) => [String(sale._id), sale])
        );

        // 3. Build the unmatched sales queue (FIFO).
        const unmatchedSales = [];

        for (const entry of saleEntries) {
            const sale = salesMap.get(String(entry.saleId));

            if (!sale) continue;

            const totalMilligrams = toMilligrams(entry.weight);
            const matchedMilligrams =
                matchedSaleMap.get(String(entry._id)) || 0;

            const remainingMilligrams =
                totalMilligrams - matchedMilligrams;

            if (remainingMilligrams <= 0) continue;

            unmatchedSales.push({
                saleLedgerEntryId: String(entry._id),
                saleId: String(sale._id),
                billNumber: sale.billNumber,
                pieceId: entry.pieceId
                    ? String(entry.pieceId)
                    : null,
                productId: entry.productId
                    ? String(entry.productId)
                    : null,
                productName: entry.productName,
                sku: entry.sku,
                batchId: entry.batchId,
                saleDate: entry.entryDate,
                totalGrams: fromMilligrams(totalMilligrams),
                matchedGrams: fromMilligrams(matchedMilligrams),
                remainingGrams: fromMilligrams(remainingMilligrams),
                saleSilverRatePerGram: Number(sale.silverRateAtSale),
            });
        }

        // 4. Find eligible replacement stock receipts.
        // Opening stock, adjustments and customer returns are excluded.
        const replacementEntries = await JewelleryLedger.find({
            movementType: "stock_in",
            direction: "in",
            isVoided: false,
        })
            .sort({ entryDate: 1, createdAt: 1 })
            .lean();

        const availableReplacementStock = [];

        for (const entry of replacementEntries) {
            const totalMilligrams = toMilligrams(entry.weight);

            const matchedMilligrams =
                matchedReplacementMap.get(String(entry._id)) || 0;

            const remainingMilligrams =
                totalMilligrams - matchedMilligrams;

            if (remainingMilligrams <= 0) continue;

            availableReplacementStock.push({
                replacementLedgerEntryId: String(entry._id),
                pieceId: entry.pieceId
                    ? String(entry.pieceId)
                    : null,
                productId: entry.productId
                    ? String(entry.productId)
                    : null,
                productName: entry.productName,
                sku: entry.sku,
                batchId: entry.batchId,
                receivedDate: entry.entryDate,
                totalGrams: fromMilligrams(totalMilligrams),
                matchedGrams: fromMilligrams(matchedMilligrams),
                remainingGrams: fromMilligrams(remainingMilligrams),
                replacementSilverRatePerGram:
                    entry.sourceSilverRate === null ||
                    entry.sourceSilverRate === undefined
                        ? null
                        : Number(entry.sourceSilverRate),
                labourPerGram:
                    entry.labourPerGram === null ||
                    entry.labourPerGram === undefined
                        ? null
                        : Number(entry.labourPerGram),
                rateAvailable:
                    Number.isFinite(Number(entry.sourceSilverRate)) &&
                    entry.sourceSilverRate !== null &&
                    entry.sourceSilverRate !== undefined,
            });
        }

        // 5. Summary.
        const totalUnmatchedMilligrams = unmatchedSales.reduce(
            (sum, item) => sum + toMilligrams(item.remainingGrams),
            0
        );

        const totalReplacementMilligrams = availableReplacementStock.reduce(
            (sum, item) => sum + toMilligrams(item.remainingGrams),
            0
        );

        const eligibleReplacementMilligrams =
            availableReplacementStock
                .filter((item) => item.rateAvailable)
                .reduce(
                    (sum, item) => sum + toMilligrams(item.remainingGrams),
                    0
                );

        return NextResponse.json({
            success: true,
            summary: {
                unmatchedSalesCount: unmatchedSales.length,
                replacementEntriesCount:
                    availableReplacementStock.length,
                totalUnmatchedGrams:
                    fromMilligrams(totalUnmatchedMilligrams),
                totalReplacementGrams:
                    fromMilligrams(totalReplacementMilligrams),
                eligibleReplacementGrams:
                    fromMilligrams(eligibleReplacementMilligrams),
                insufficientReplacementStock:
                    eligibleReplacementMilligrams <
                    totalUnmatchedMilligrams,
            },
            unmatchedSales,
            availableReplacementStock,
            note: "Read-only preview. No silver matches have been created or modified.",
        });
    } catch (e) {
        console.error("Silver matching GET error:", e);

        return error(
            "Unable to load silver matching data.",
            500
        );
    }
}


export async function POST() {
    if (!(await authorized())) {
        return error("Unauthorized", 401);
    }

    let session = null;
    let lockOwner = null;
    let lockAcquired = false;

    try {
        await connectDB();

        // Prevent two matching requests from running simultaneously.
        lockOwner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        const lockCollection =
            mongoose.connection.collection("silverMatchingLocks");

        const now = new Date();

        try {
            const lockResult = await lockCollection.updateOne(
                {
                    _id: "global",
                    $or: [
                        { lockedUntil: { $lte: now } },
                        { lockedUntil: { $exists: false } },
                    ],
                },
                {
                    $set: {
                        owner: lockOwner,
                        lockedUntil: new Date(now.getTime() + 120000),
                    },
                },
                { upsert: true }
            );

            lockAcquired =
                lockResult.modifiedCount === 1 ||
                lockResult.upsertedCount === 1;
        } catch (lockError) {
            if (lockError.code === 11000) {
                return error(
                    "Another silver matching operation is running. Please try again.",
                    409
                );
            }

            throw lockError;
        }

        if (!lockAcquired) {
            return error(
                "Another silver matching operation is running.",
                409
            );
        }

        session = await mongoose.startSession();

        let result = null;

        await session.withTransaction(async () => {
            // 1. Load existing confirmed matches.
            const existingMatches = await SilverMatch.find({
                status: "confirmed",
            })
                .session(session)
                .lean();

            const matchedSales = new Map();
            const matchedReceipts = new Map();

            function addMatched(map, id, grams) {
                const key = String(id);
                map.set(
                    key,
                    (map.get(key) || 0) + Math.round(grams * 1000)
                );
            }

            for (const match of existingMatches) {
                addMatched(
                    matchedSales,
                    match.saleLedgerEntryId,
                    match.matchedGrams
                );

                addMatched(
                    matchedReceipts,
                    match.replacementLedgerEntryId,
                    match.matchedGrams
                );
            }

            // 2. Load eligible sale ledger entries.
            const saleEntries = await JewelleryLedger.find({
                movementType: "sale",
                direction: "out",
                isVoided: false,
                saleId: { $ne: null },
            })
                .sort({ entryDate: 1, createdAt: 1 })
                .session(session)
                .lean();

            const saleIds = [
                ...new Set(
                    saleEntries.map((entry) => String(entry.saleId))
                ),
            ];

            const sales = await Sale.find({
                _id: { $in: saleIds },
                status: "completed",
            })
                .select("_id billNumber silverRateAtSale")
                .session(session)
                .lean();

            const salesMap = new Map(
                sales.map((sale) => [String(sale._id), sale])
            );

            // 3. Load eligible replacement receipts.
            const receipts = await JewelleryLedger.find({
                movementType: "stock_in",
                direction: "in",
                isVoided: false,
            })
                .sort({ entryDate: 1, createdAt: 1 })
                .session(session)
                .lean();

            // 4. Create a chronological event stream.
            const events = [];

            let skippedSales = 0;
            let skippedReceipts = 0;

            for (const entry of saleEntries) {
                const sale = salesMap.get(String(entry.saleId));

                if (!sale) continue;

                const rate = Number(sale.silverRateAtSale);

                if (!Number.isFinite(rate) || rate <= 0) {
                    skippedSales += 1;
                    continue;
                }

                const totalMg = Math.round(Number(entry.weight) * 1000);
                const alreadyMatched =
                    matchedSales.get(String(entry._id)) || 0;

                const remainingMg = totalMg - alreadyMatched;

                if (remainingMg < 0) {
                    throw new Error(
                        `Existing matches exceed sold weight for ledger entry ${entry._id}`
                    );
                }

                if (remainingMg === 0) continue;

                events.push({
                    type: "sale",
                    date: new Date(entry.entryDate),
                    entry,
                    sale,
                    remainingMg,
                });
            }

            for (const entry of receipts) {
                const rate = Number(entry.sourceSilverRate);

                if (!Number.isFinite(rate) || rate <= 0) {
                    skippedReceipts += 1;
                    continue;
                }

                const totalMg = Math.round(Number(entry.weight) * 1000);
                const alreadyMatched =
                    matchedReceipts.get(String(entry._id)) || 0;

                const remainingMg = totalMg - alreadyMatched;

                if (remainingMg < 0) {
                    throw new Error(
                        `Existing matches exceed receipt weight for ledger entry ${entry._id}`
                    );
                }

                if (remainingMg === 0) continue;

                events.push({
                    type: "receipt",
                    date: new Date(entry.entryDate),
                    entry,
                    remainingMg,
                    rate,
                });
            }

            // Sales come before receipts if timestamps are identical.
            events.sort((a, b) => {
                const dateDifference =
                    a.date.getTime() - b.date.getTime();

                if (dateDifference !== 0) return dateDifference;

                if (a.type === b.type) return 0;

                return a.type === "sale" ? -1 : 1;
            });

            // 5. FIFO allocation.
            const unmatchedQueue = [];
            const allocations = [];

            let matchedTotalMg = 0;
            let adjustmentTotalPaise = 0;

            for (const event of events) {
                if (event.type === "sale") {
                    unmatchedQueue.push(event);
                    continue;
                }

                // A receipt can only replace silver already sold.
                let receiptRemainingMg = event.remainingMg;

                while (
                    receiptRemainingMg > 0 &&
                    unmatchedQueue.length > 0
                ) {
                    const saleEvent = unmatchedQueue[0];

                    const matchedMg = Math.min(
                        saleEvent.remainingMg,
                        receiptRemainingMg
                    );

                    if (matchedMg <= 0) {
                        unmatchedQueue.shift();
                        continue;
                    }

                    const saleRate = Number(
                        saleEvent.sale.silverRateAtSale
                    );

                    const replacementRate = event.rate;

                    // mg × rupees/gram ÷ 10 = paise
                    const adjustmentPaise = Math.round(
                        (matchedMg * (saleRate - replacementRate)) / 10
                    );

                    const matchedGrams = Number(
                        (matchedMg / 1000).toFixed(3)
                    );

                    allocations.push({
                        saleId: saleEvent.sale._id,
                        pieceId: saleEvent.entry.pieceId,
                        saleLedgerEntryId: saleEvent.entry._id,
                        replacementLedgerEntryId: event.entry._id,
                        matchedGrams,
                        saleSilverRatePerGram: saleRate,
                        replacementSilverRatePerGram:
                            replacementRate,
                        adjustmentPaise,
                        matchDate: event.date,
                        status: "confirmed",
                        createdBy: "admin",
                        notes: "Automatic chronological FIFO matching",
                    });

                    saleEvent.remainingMg -= matchedMg;
                    receiptRemainingMg -= matchedMg;

                    matchedTotalMg += matchedMg;
                    adjustmentTotalPaise += adjustmentPaise;

                    if (saleEvent.remainingMg === 0) {
                        unmatchedQueue.shift();
                    }
                }
            }

            // 6. Save all allocations atomically.
         
// 6. Save all allocations atomically.
if (allocations.length > 0) {
    await SilverMatch.insertMany(allocations, {
        session,
        ordered: true,
    });

    // 7. Update per-piece profit snapshots on affected sale bills.
    const affectedSaleIds = [
        ...new Set(allocations.map((item) => String(item.saleId))),
    ];

    for (const saleId of affectedSaleIds) {
        const confirmedMatches = await SilverMatch.find({
            saleId,
            status: "confirmed",
        })
            .session(session)
            .lean();

        const adjustmentByPiece = new Map();

        for (const match of confirmedMatches) {
            const pieceKey = String(match.pieceId);

            adjustmentByPiece.set(
                pieceKey,
                (adjustmentByPiece.get(pieceKey) || 0) +
                    Number(match.adjustmentPaise || 0)
            );
        }

        const sale = await Sale.findById(saleId).session(session);

        if (!sale) {
            throw new Error(`Sale ${saleId} not found during profit update.`);
        }

        let billProfitAtSale = 0;
        let billSilverAdjustmentPaise = 0;
        let billActualProfit = 0;
        let billTotalCost = 0;

        for (const item of sale.items) {
            const pieceAdjustmentPaise =
                adjustmentByPiece.get(String(item.pieceId)) || 0;

            const originalProfit = Number(item.profitAtSale || 0);

            const actualProfit =
                originalProfit + pieceAdjustmentPaise / 100;

            item.silverReplacementAdjustment =
                Number((pieceAdjustmentPaise / 100).toFixed(2));

            item.actualProfitAfterReplenishment =
                Number(actualProfit.toFixed(2));

            billProfitAtSale += originalProfit;
            billSilverAdjustmentPaise += pieceAdjustmentPaise;
            billActualProfit += actualProfit;
            billTotalCost += Number(item.costAtSale || 0);
        }

        sale.totalCostAtSale = Number(billTotalCost.toFixed(2));
        sale.profitAtSale = Number(billProfitAtSale.toFixed(2));

        sale.silverReplacementAdjustment = Number(
            (billSilverAdjustmentPaise / 100).toFixed(2)
        );

        sale.actualProfitAfterReplenishment = Number(
            billActualProfit.toFixed(2)
        );

        await sale.save({ session });
    }
}


            const remainingUnmatchedMg =
                unmatchedQueue.reduce(
                    (sum, item) => sum + item.remainingMg,
                    0
                );

            result = {
                createdMatches: allocations.length,
                matchedGrams: Number(
                    (matchedTotalMg / 1000).toFixed(3)
                ),
                adjustment: Number(
                    (adjustmentTotalPaise / 100).toFixed(2)
                ),
                remainingUnmatchedGrams: Number(
                    (remainingUnmatchedMg / 1000).toFixed(3)
                ),
                skippedSalesWithoutRate: skippedSales,
                skippedReceiptsWithoutRate: skippedReceipts,
                allocations: allocations.map((item) => ({
                    saleId: String(item.saleId),
                    pieceId: String(item.pieceId),
                    saleLedgerEntryId: String(
                        item.saleLedgerEntryId
                    ),
                    replacementLedgerEntryId: String(
                        item.replacementLedgerEntryId
                    ),
                    matchedGrams: item.matchedGrams,
                    saleRate: item.saleSilverRatePerGram,
                    replacementRate:
                        item.replacementSilverRatePerGram,
                    adjustment: Number(
                        (item.adjustmentPaise / 100).toFixed(2)
                    ),
                    matchDate: item.matchDate,
                })),
            };
        });

        return NextResponse.json({
            success: true,
            message: "FIFO silver matching completed.",
            result,
        });
    } catch (e) {
        console.error("Silver matching POST error:", e);

        return error(
            e.message || "Unable to complete silver matching.",
            500
        );
    } finally {
        if (session) {
            await session.endSession();
        }

        if (lockAcquired && lockOwner) {
            try {
                await mongoose.connection
                    .collection("silverMatchingLocks")
                    .updateOne(
                        {
                            _id: "global",
                            owner: lockOwner,
                        },
                        {
                            $unset: {
                                owner: "",
                                lockedUntil: "",
                            },
                        }
                    );
            } catch (releaseError) {
                console.error(
                    "Silver matching lock release error:",
                    releaseError
                );
            }
        }
    }
}
