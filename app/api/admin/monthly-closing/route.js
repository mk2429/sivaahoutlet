
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import mongoose from "mongoose";

import connectDB from "../../../../lib/db";
import { verifyAdminToken } from "../../../../lib/admin-auth";

import OutletMonthClose from "../../../models/OutletMonthClose";
import OutletOpeningBalance from "../../../models/OutletOpeningBalance";
import OutletTransaction from "../../../models/OutletTransaction";
import Sale from "../../../models/Sale";
import JewelleryLedger from "../../../models/JewelleryLedger";
import SilverMatch from "../../../models/SilverMatch";

// ============================================================
// CONFIGURATION
// ============================================================

// Keep true while testing October -> November carry-forward.
// Before actual go-live, change this to false.
//
// TESTING MODE:
// October 2026 starts from October 27 with zero opening balances.
//
// LIVE MODE:
// November 2026 starts from November 5 with zero opening balances.

const TESTING_MODE = true;

const CUTOVER_MONTH = TESTING_MODE ? "2026-10" : "2026-11";

const CUTOVER_DATE = new Date(
    TESTING_MODE
        ? "2026-10-27T00:00:00+05:30"
        : "2026-11-05T00:00:00+05:30"
);

// ============================================================
// MONEY AND WEIGHT HELPERS
// ============================================================

function moneyToPaise(value) {
    return Math.round((Number(value) || 0) * 100);
}

function nullableMoneyToPaise(value) {
    if (value === null || value === undefined) return null;

    const number = Number(value);
    if (!Number.isFinite(number)) return null;

    return Math.round(number * 100);
}

function paiseToRupees(value) {
    return Number((Number(value || 0) / 100).toFixed(2));
}

function roundGrams(value) {
    return Number((Number(value) || 0).toFixed(3));
}

function getAmountPaise(tx) {
    if (Number.isSafeInteger(tx.amountPaise) && tx.amountPaise > 0) {
        return tx.amountPaise;
    }

    return moneyToPaise(tx.amount);
}

// ============================================================
// DATE HELPERS
// ============================================================

function getMonthRange(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);

    const start = new Date(`${monthKey}-01T00:00:00+05:30`);

    const nextMonth = new Date(Date.UTC(year, month, 1));

    const nextMonthKey =
        `${nextMonth.getUTCFullYear()}-${String(
            nextMonth.getUTCMonth() + 1
        ).padStart(2, "0")}`;

    const end = new Date(`${nextMonthKey}-01T00:00:00+05:30`);

    return { start, end };
}

function getIndiaDateKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);

    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
}

function getPreviousMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);

    const previous = new Date(Date.UTC(year, month - 2, 1));

    return `${previous.getUTCFullYear()}-${String(
        previous.getUTCMonth() + 1
    ).padStart(2, "0")}`;
}

// ============================================================
// PAYMENT HELPERS
// ============================================================

function getSalesPayments(sale) {
    const paidPaise = moneyToPaise(sale.amountPaid);

    const summary = Array.isArray(sale.paymentSummary)
        ? sale.paymentSummary
        : [];

    const summaryTotalPaise = summary.reduce(
        (sum, line) => sum + moneyToPaise(line.amount),
        0
    );

    if (
        summary.length &&
        Math.abs(summaryTotalPaise - paidPaise) <= 1
    ) {
        return summary.map((line) => ({
            method: line.method,
            amountPaise: moneyToPaise(line.amount),
        }));
    }

    if (paidPaise <= 0) return [];

    if (sale.paymentMethod === "Split") {
        return [{
            method: "Unallocated",
            amountPaise: paidPaise,
        }];
    }

    return [{
        method: sale.paymentMethod || "Other",
        amountPaise: paidPaise,
    }];
}

function accountType(account) {
    if (account === "Cash") return "cash";

    if (["Bank", "UPI", "Card"].includes(account)) {
        return "bank";
    }

    return null;
}

function paymentAccount(method) {
    if (method === "Cash") return "cash";

    if (["UPI", "Card", "Bank Transfer"].includes(method)) {
        return "bank";
    }

    return null;
}

// ============================================================
// AUTHORIZATION
// ============================================================

async function isAuthorized() {
    try {
        const cookieStore = await cookies();

        const token = cookieStore.get("sivaah_admin_access")?.value;

        if (!token) return false;

        return Boolean(await verifyAdminToken(token));
    } catch {
        return false;
    }
}

// ============================================================
// COMMON MONTH VALIDATION
// ============================================================

function isValidMonth(monthKey) {
    return Boolean(
        monthKey &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) &&
        monthKey >= CUTOVER_MONTH
    );
}

// ============================================================
// GET: MONTHLY CLOSING PREVIEW
// ============================================================

export async function GET(request) {
    try {
        if (!(await isAuthorized())) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            );
        }

        const monthKey = new URL(request.url).searchParams.get("month");

        if (!isValidMonth(monthKey)) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Provide a valid month from ${CUTOVER_MONTH} onward.`,
                },
                { status: 400 }
            );
        }

        await connectDB();

        const { start, end } = getMonthRange(monthKey);

        const todayKey = getIndiaDateKey();
        const currentMonthKey = todayKey.slice(0, 7);

        const effectiveStart =
            monthKey === CUTOVER_MONTH ? CUTOVER_DATE : start;

        const todayEnd = new Date(
            new Date(`${todayKey}T00:00:00+05:30`).getTime() +
            24 * 60 * 60 * 1000
        );

        // Prevent invalid date ranges if the configured cutover
        // date is later than today's date.
        const effectiveEnd =
            monthKey === currentMonthKey
                ? (
                    todayEnd < effectiveStart
                        ? effectiveStart
                        : todayEnd
                )
                : end;

        // ====================================================
        // OPENING BALANCES
        // ====================================================

        let opening;
        let openingVerification;
        let openingSource;

        if (monthKey === CUTOVER_MONTH) {
            const snapshot = await OutletOpeningBalance.findOne({
                effectiveDate: CUTOVER_DATE,
            }).lean();

            if (!snapshot) {
                // System-generated zero baseline.
                // No opening transaction is created.

                opening = {
                    cashPaise: 0,
                    bankPaise: 0,
                    silverGrams: 0,
                };

                openingVerification = {
                    verified: true,
                    silverCountVerified: true,
                };

                openingSource = "system_zero_baseline";
            } else {
                opening = {
                    cashPaise: snapshot.cashPaise,
                    bankPaise: snapshot.bankPaise,
                    silverGrams: roundGrams(
                        snapshot.physicalSilverGrams
                    ),
                };

                openingVerification = {
                    verified: snapshot.verified,
                    silverCountVerified: snapshot.silverCountVerified,
                };

                openingSource = "verified_opening_balance";
            }
        } else {
            // All later months inherit the previous month's
            // FORMALLY CLOSED balances.

            const previousMonthKey = getPreviousMonth(monthKey);

            const previousMonthClose = await OutletMonthClose.findOne({
                monthKey: previousMonthKey,
                status: "closed",
            }).lean();

            if (!previousMonthClose) {
                return NextResponse.json(
                    {
                        success: false,
                        message: `Close ${previousMonthKey} before starting ${monthKey}.`,
                    },
                    { status: 409 }
                );
            }

            opening = {
                cashPaise: Number(
                    previousMonthClose.closing.cashPaise || 0
                ),

                bankPaise: Number(
                    previousMonthClose.closing.bankPaise || 0
                ),

                silverGrams: roundGrams(
                    previousMonthClose.closing.silverGrams
                ),
            };

            openingVerification = {
                verified: true,
                silverCountVerified: true,
            };

            openingSource = "previous_month_close";
        }

        // ====================================================
        // PERIOD FILTER
        // ====================================================

        const dateFilter = {
            $gte: effectiveStart,
            $lt: effectiveEnd,
        };

        // ====================================================
        // FETCH MONTH DATA
        // ====================================================

        const [
            sales,
            transactions,
            silverEntries,
            existingClose,
            confirmedMatchesThisMonth,
            confirmedMatchesBeforeMonthEnd,
            monthSaleLedgerEntries,
            silverRateDoc,
        ] = await Promise.all([
            Sale.find({
                status: "completed",
                createdAt: dateFilter,
            }).lean(),

            OutletTransaction.find({
                isVoided: { $ne: true },
                transactionDate: dateFilter,
            }).lean(),

            JewelleryLedger.find({
                isVoided: { $ne: true },
                entryDate: dateFilter,
                movementType: { $ne: "opening_stock" },
            }).lean(),

            OutletMonthClose.findOne({ monthKey }).lean(),

            SilverMatch.find({
                status: "confirmed",
                matchDate: dateFilter,
            }).lean(),

            SilverMatch.find({
                status: "confirmed",
                matchDate: { $lt: effectiveEnd },
            })
                .select("saleLedgerEntryId matchedGrams")
                .lean(),

            JewelleryLedger.find({
                movementType: "sale",
                direction: "out",
                isVoided: false,
                entryDate: dateFilter,
                saleId: { $ne: null },
            })
                .select("_id saleId weight")
                .lean(),

            mongoose.connection.db
                .collection("silverrates")
                .findOne({ metal: "silver" }),
        ]);

        // ====================================================
        // CASH AND BANK BALANCES
        // ====================================================

        let cashPaise = opening.cashPaise;
        let bankPaise = opening.bankPaise;
        let salesCollectedPaise = 0;

        const salesWithPaymentIssues = [];
        const validSales = [];

        for (const sale of sales) {
            const amountPaidPaise = moneyToPaise(sale.amountPaid);
            const netAmountPaise = moneyToPaise(sale.netAmount);

            if (Math.abs(amountPaidPaise - netAmountPaise) > 1) {
                salesWithPaymentIssues.push({
                    billNumber: sale.billNumber,
                    reason: "Sale is not fully paid.",
                    netAmount: Number(sale.netAmount) || 0,
                    amountPaid: Number(sale.amountPaid) || 0,
                    difference: paiseToRupees(
                        netAmountPaise - amountPaidPaise
                    ),
                });

                continue;
            }

            const payments = getSalesPayments(sale);

            const allocatedPaise = payments.reduce(
                (sum, payment) => sum + payment.amountPaise,
                0
            );

            if (Math.abs(allocatedPaise - amountPaidPaise) > 1) {
                salesWithPaymentIssues.push({
                    billNumber: sale.billNumber,
                    reason: "Payment breakdown does not match amount paid.",
                });

                continue;
            }

            if (payments.some((payment) => !paymentAccount(payment.method))) {
                salesWithPaymentIssues.push({
                    billNumber: sale.billNumber,
                    reason: "Payment method is not allocated to Cash or Bank.",
                });

                continue;
            }

            validSales.push(sale);

            for (const payment of payments) {
                const account = paymentAccount(payment.method);

                if (account === "cash") {
                    cashPaise += payment.amountPaise;
                    salesCollectedPaise += payment.amountPaise;
                } else if (account === "bank") {
                    bankPaise += payment.amountPaise;
                    salesCollectedPaise += payment.amountPaise;
                }
            }
        }

        // ====================================================
        // MANUAL MONEY MOVEMENTS
        // ====================================================

        let unallocatedTransactionPaise = 0;

        for (const tx of transactions) {
            if (
                tx.type === "opening_balance" ||
                tx.profitTreatment === "opening"
            ) {
                continue;
            }

            const amount = getAmountPaise(tx);

            if (tx.type === "transfer") {
                const source = accountType(tx.account);
                const destination = accountType(tx.transferToAccount);

                if (!source || !destination || source === destination) {
                    unallocatedTransactionPaise += amount;
                    continue;
                }

                if (source === "cash") cashPaise -= amount;
                if (source === "bank") bankPaise -= amount;

                if (destination === "cash") cashPaise += amount;
                if (destination === "bank") bankPaise += amount;

                continue;
            }

            const account = accountType(tx.account);

            if (!account) {
                unallocatedTransactionPaise += amount;
                continue;
            }

            const movement =
                tx.direction === "in" ? amount : -amount;

            if (account === "cash") cashPaise += movement;
            if (account === "bank") bankPaise += movement;
        }

        // ====================================================
        // PHYSICAL SILVER BALANCE
        // ====================================================

        let silverGrams = opening.silverGrams;

        let silverInGrams = 0;
        let silverOutGrams = 0;

        for (const entry of silverEntries) {
            const grams = roundGrams(entry.weight);

            if (entry.direction === "in") {
                silverGrams = roundGrams(silverGrams + grams);
                silverInGrams = roundGrams(silverInGrams + grams);
            } else if (entry.direction === "out") {
                silverGrams = roundGrams(silverGrams - grams);
                silverOutGrams = roundGrams(silverOutGrams + grams);
            }
        }

        const closing = {
            cashPaise,
            bankPaise,
            silverGrams: roundGrams(silverGrams),
        };

        // ====================================================
        // STAGE 1: MONTHLY OPERATING PROFIT
        // ====================================================

        const salesRevenuePaise = sales.reduce(
            (total, sale) =>
                total + moneyToPaise(sale.netAmount),
            0
        );

        let replacementCostPaise = 0;
        let itemsWithMissingReplacementCost = 0;
        let totalSaleItems = 0;

        const productProfitBreakdown = [];

        for (const sale of sales) {
            for (const item of sale.items || []) {
                totalSaleItems += 1;

                const cost = item.replacementCostAtSale;

                if (
                    cost === null ||
                    cost === undefined ||
                    !Number.isFinite(Number(cost)) ||
                    Number(cost) < 0
                ) {
                    itemsWithMissingReplacementCost += 1;
                    continue;
                }

                replacementCostPaise += moneyToPaise(cost);

                const weight = Number(item.weight || 0);
                const saleRate = Number(sale.silverRateAtSale || 0);
                const batchId = String(item.batchId || "");

                const labourPerGram =
                    /^\d{14}$/.test(batchId)
                        ? Number(batchId.slice(11, 14))
                        : null;

                const packagingCost = 50;

                productProfitBreakdown.push({
                    billNumber: sale.billNumber,
                    productName:
                        item.productName || item.name || "Unknown product",
                    weight,
                    silverRateAtSale: saleRate,
                    labourPerGram,
                    silverCost: Number((weight * saleRate).toFixed(2)),
                    labourCost:
                        labourPerGram === null
                            ? null
                            : Number(
                                (weight * labourPerGram).toFixed(2)
                            ),
                    packagingCost,
                    replacementCost: Number(cost),
                    sellingPrice: Number(item.finalPrice || 0),
                    operatingMargin: Number(
                        (
                            Number(item.finalPrice || 0) -
                            Number(cost)
                        ).toFixed(2)
                    ),
                });
            }
        }

        const operatingExpensesPaise = transactions
            .filter(
                (tx) =>
                    !tx.isVoided &&
                    tx.direction === "out" &&
                    tx.profitTreatment === "expense"
            )
            .reduce(
                (total, tx) => total + getAmountPaise(tx),
                0
            );

        const replacementCostComplete =
            itemsWithMissingReplacementCost === 0;

        const paymentDataComplete =
            salesWithPaymentIssues.length === 0;

        const profitDataComplete =
            replacementCostComplete && paymentDataComplete;

        const operatingMarginPaise = replacementCostComplete
            ? salesRevenuePaise - replacementCostPaise
            : null;

        const operatingProfitPaise =
            profitDataComplete
                ? operatingMarginPaise - operatingExpensesPaise
                : null;

        // ====================================================
        // STAGE 2: CONFIRMED SILVER ADJUSTMENT
        // ====================================================

        const confirmedSilverAdjustmentPaise =
            confirmedMatchesThisMonth.reduce(
                (total, match) =>
                    total + (Number(match.adjustmentPaise) || 0),
                0
            );

        const confirmedMatchedGramsThisMonth = roundGrams(
            confirmedMatchesThisMonth.reduce(
                (total, match) =>
                    total + Number(match.matchedGrams || 0),
                0
            )
        );

        const matchedSaleIds = [
            ...new Set(
                confirmedMatchesThisMonth.map((match) =>
                    String(match.saleId)
                )
            ),
        ];

        const matchedSales = matchedSaleIds.length
            ? await Sale.find({
                _id: {
                    $in: matchedSaleIds.map(
                        (id) => new mongoose.Types.ObjectId(id)
                    ),
                },
            })
                .select("_id createdAt")
                .lean()
            : [];

        const matchedSalesDateMap = new Map(
            matchedSales.map((sale) => [
                String(sale._id),
                new Date(sale.createdAt),
            ])
        );

        let matchedGramsFromEarlierMonths = 0;
        let earlierMonthMatchCount = 0;

        for (const match of confirmedMatchesThisMonth) {
            const saleDate = matchedSalesDateMap.get(
                String(match.saleId)
            );

            if (saleDate && saleDate < effectiveStart) {
                matchedGramsFromEarlierMonths +=
                    Number(match.matchedGrams || 0);

                earlierMonthMatchCount += 1;
            }
        }

        matchedGramsFromEarlierMonths = roundGrams(
            matchedGramsFromEarlierMonths
        );

        // ====================================================
        // STAGE 3: PROVISIONAL SILVER ADJUSTMENT
        // ====================================================

        const currentSilverRate = Number(
            silverRateDoc?.ratePerGram
        );

        const referenceRateAvailable =
            Number.isFinite(currentSilverRate) &&
            currentSilverRate > 0;

        const matchedGramsBySaleEntry = new Map();

        for (const match of confirmedMatchesBeforeMonthEnd) {
            const key = String(match.saleLedgerEntryId);

            matchedGramsBySaleEntry.set(
                key,
                (matchedGramsBySaleEntry.get(key) || 0) +
                Number(match.matchedGrams || 0)
            );
        }

        const monthSaleIds = [
            ...new Set(
                monthSaleLedgerEntries.map((entry) =>
                    String(entry.saleId)
                )
            ),
        ];

        const monthSales = monthSaleIds.length
            ? await Sale.find({
                _id: {
                    $in: monthSaleIds.map(
                        (id) => new mongoose.Types.ObjectId(id)
                    ),
                },
                status: "completed",
            })
                .select("_id silverRateAtSale")
                .lean()
            : [];

        const monthSalesMap = new Map(
            monthSales.map((sale) => [
                String(sale._id),
                sale,
            ])
        );

        let unmatchedSoldGrams = 0;
        let provisionalSilverAdjustmentPaise = 0;
        let unmatchedSalesWithoutRate = 0;
        let invalidMatchWeightEntries = 0;

        for (const entry of monthSaleLedgerEntries) {
            const totalMg = Math.round(
                Number(entry.weight || 0) * 1000
            );

            const matchedGrams =
                matchedGramsBySaleEntry.get(String(entry._id)) || 0;

            const matchedMg = Math.round(matchedGrams * 1000);
            const remainingMg = totalMg - matchedMg;

            if (remainingMg < 0) {
                invalidMatchWeightEntries += 1;
                continue;
            }

            if (remainingMg === 0) continue;

            const sale = monthSalesMap.get(String(entry.saleId));
            const saleRate = Number(sale?.silverRateAtSale);

            if (!Number.isFinite(saleRate) || saleRate <= 0) {
                unmatchedSalesWithoutRate += 1;
                continue;
            }

            unmatchedSoldGrams += remainingMg / 1000;

            if (referenceRateAvailable) {
                provisionalSilverAdjustmentPaise += Math.round(
                    (remainingMg * (saleRate - currentSilverRate)) / 10
                );
            }
        }

        unmatchedSoldGrams = roundGrams(unmatchedSoldGrams);

        const provisionalDataComplete =
            referenceRateAvailable &&
            unmatchedSalesWithoutRate === 0 &&
            invalidMatchWeightEntries === 0;

        const confirmedRealProfitPaise =
            operatingProfitPaise === null
                ? null
                : operatingProfitPaise +
                confirmedSilverAdjustmentPaise;

        const estimatedRealProfitPaise =
            confirmedRealProfitPaise === null ||
                !provisionalDataComplete
                ? null
                : confirmedRealProfitPaise +
                provisionalSilverAdjustmentPaise;

        const silverAdjustmentStatus =
            !referenceRateAvailable
                ? "missing_reference_rate"
                : invalidMatchWeightEntries > 0
                    ? "invalid_match_data"
                    : unmatchedSalesWithoutRate > 0
                        ? "incomplete_sale_rate_data"
                        : "calculated";

        // ====================================================
        // FINAL PROFIT RESPONSE
        // ====================================================

        const profit = {
            status: profitDataComplete
                ? "calculated"
                : "incomplete_data",

            salesRevenue: paiseToRupees(salesRevenuePaise),

            replacementCost: replacementCostComplete
                ? paiseToRupees(replacementCostPaise)
                : null,

            operatingMargin:
                operatingMarginPaise === null
                    ? null
                    : paiseToRupees(operatingMarginPaise),

            operatingExpenses: paiseToRupees(
                operatingExpensesPaise
            ),

            operatingProfit:
                operatingProfitPaise === null
                    ? null
                    : paiseToRupees(operatingProfitPaise),

            confirmedRealProfit:
                confirmedRealProfitPaise === null
                    ? null
                    : paiseToRupees(confirmedRealProfitPaise),

            estimatedRealProfit:
                estimatedRealProfitPaise === null
                    ? null
                    : paiseToRupees(estimatedRealProfitPaise),

            totalSaleItems,
            itemsWithMissingReplacementCost,
            salesWithPaymentIssues,
            productProfitBreakdown,

            silverAdjustment: {
                status: silverAdjustmentStatus,

                confirmed: paiseToRupees(
                    confirmedSilverAdjustmentPaise
                ),

                provisional: provisionalDataComplete
                    ? paiseToRupees(
                        provisionalSilverAdjustmentPaise
                    )
                    : null,

                referenceSilverRatePerGram:
                    referenceRateAvailable
                        ? currentSilverRate
                        : null,

                confirmedMatchedGrams:
                    confirmedMatchedGramsThisMonth,

                matchedGramsFromEarlierMonths,

                earlierMonthMatchCount,

                unmatchedSoldGrams,

                unmatchedSalesWithoutRate,
                invalidMatchWeightEntries,

                matchesCreatedInMonth:
                    confirmedMatchesThisMonth.length,
            },

            note:
                "Confirmed silver adjustments are counted in the month of matching. Provisional adjustment estimates this month's unmatched sold grams using the current silver rate. Provisional figures are estimates, not confirmed profit.",
        };

        // ====================================================
        // RESPONSE
        // ====================================================

        return NextResponse.json({
            success: true,
            monthKey,

            testingMode: TESTING_MODE,

            period: {
                from: getIndiaDateKey(effectiveStart),

                to: getIndiaDateKey(
                    new Date(
                        effectiveEnd.getTime() - 24 * 60 * 60 * 1000
                    )
                ),

                isPartialMonth:
                    monthKey === currentMonthKey ||
                    effectiveStart.getTime() !== start.getTime(),
            },

            openingSource,

            status: existingClose?.status || "preview",

            isAlreadyClosed: existingClose?.status === "closed",

            opening: {
                cash: paiseToRupees(opening.cashPaise),
                bank: paiseToRupees(opening.bankPaise),
                silverGrams: opening.silverGrams,
            },

            openingVerification,

            closing: {
                cash: paiseToRupees(closing.cashPaise),
                bank: paiseToRupees(closing.bankPaise),
                silverGrams: closing.silverGrams,
            },

            movement: {
                salesBills: validSales.length,
                salesWithPaymentIssues,

                manualTransactions: transactions.length,
                silverLedgerEntries: silverEntries.length,

                salesCollected: paiseToRupees(salesCollectedPaise),

                unallocatedTransactionAmount: paiseToRupees(
                    unallocatedTransactionPaise
                ),

                silverInGrams: roundGrams(silverInGrams),
                silverOutGrams: roundGrams(silverOutGrams),

                netSilverGrams: roundGrams(
                    silverInGrams - silverOutGrams
                ),
            },

            profit,

            warning:
                openingSource === "system_zero_baseline"
                    ? TESTING_MODE
                        ? "TESTING MODE: October uses a system-generated zero opening baseline from October 27. These test balances must not be used as actual live opening balances."
                        : "Cash and bank use a system-generated zero opening baseline. Physical opening silver must be verified before formal closing."
                    : "Preview only. No closing balance or ledger entry has been saved.",
        });
    } catch (error) {
        console.error("Monthly closing preview error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Unable to generate monthly closing preview.",
            },
            { status: 500 }
        );
    }
}

// ============================================================
// POST: SAVE DRAFT OR FORMALLY CLOSE MONTH
// ============================================================

export async function POST(request) {
    let session = null;

    try {
        if (!(await isAuthorized())) {
            return NextResponse.json(
                { success: false, message: "Unauthorized" },
                { status: 401 }
            );
        }

        const monthKey = new URL(request.url).searchParams.get("month");

        if (!isValidMonth(monthKey)) {
            return NextResponse.json(
                {
                    success: false,
                    message: `Provide a valid month from ${CUTOVER_MONTH} onward.`,
                },
                { status: 400 }
            );
        }

        const body = await request.json();

        const {
            action = "save_draft",
            physicalCashCount,
            physicalBankCount,
            physicalSilverCountGrams,
            notes = "",
        } = body;

        if (!["save_draft", "close"].includes(action)) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Invalid action. Use save_draft or close.",
                },
                { status: 400 }
            );
        }

        // A month can only be formally closed after its
        // calendar month has ended.
        if (
            action === "close" &&
            monthKey >= getIndiaDateKey().slice(0, 7)
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "You can preview or save a draft during the month. Formal closing is available only after the month has ended.",
                },
                { status: 409 }
            );
        }

        if (
            typeof physicalCashCount !== "number" ||
            !Number.isFinite(physicalCashCount) ||
            physicalCashCount < 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Enter a valid physical cash count.",
                },
                { status: 400 }
            );
        }
        if (
            typeof physicalBankCount !== "number" ||
            !Number.isFinite(physicalBankCount) ||
            physicalBankCount < 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Enter a valid actual bank balance.",
                },
                { status: 400 }
            );
        }
        if (
            typeof physicalSilverCountGrams !== "number" ||
            !Number.isFinite(physicalSilverCountGrams) ||
            physicalSilverCountGrams < 0
        ) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Enter a valid physical silver count in grams.",
                },
                { status: 400 }
            );
        }

        if (typeof notes !== "string" || notes.length > 2000) {
            return NextResponse.json(
                {
                    success: false,
                    message: "Notes must be 2000 characters or fewer.",
                },
                { status: 400 }
            );
        }

        await connectDB();

        // Recalculate preview on the server.
        const previewResponse = await GET(request);
        const preview = await previewResponse.json();

        if (!previewResponse.ok || !preview.success) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        preview.message ||
                        "Unable to calculate the latest monthly preview.",
                },
                { status: previewResponse.status || 400 }
            );
        }

        if (preview.isAlreadyClosed) {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "This month is already closed. Reopen it through the controlled reopen process before making changes.",
                },
                { status: 409 }
            );
        }

        const physicalCashPaise = moneyToPaise(physicalCashCount);

        const physicalBankPaise = moneyToPaise(physicalBankCount);

        const physicalSilverGrams = roundGrams(
            physicalSilverCountGrams
        );

        const systemCashPaise = moneyToPaise(preview.closing.cash);
        const systemBankPaise = moneyToPaise(preview.closing.bank);

        const systemSilverGrams = roundGrams(
            preview.closing.silverGrams
        );

        const cashDifferencePaise =
            physicalCashPaise - systemCashPaise;

        const bankDifferencePaise =
            physicalBankPaise - systemBankPaise;

        const silverDifferenceGrams = roundGrams(
            physicalSilverGrams - systemSilverGrams
        );

        const cashMatches =
            Math.abs(cashDifferencePaise) <= 1;

        const bankMatches =
            Math.abs(bankDifferencePaise) <= 1;

        const silverMatches =
            Math.abs(silverDifferenceGrams) <= 0.001;

        const negativeCashBalance = systemCashPaise < 0;
        const negativeBankBalance = systemBankPaise < 0;

        if (action === "close") {
            if (negativeCashBalance || negativeBankBalance) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Cash or bank balance is negative. Reconcile the transactions before closing.",

                        negativeBalances: {
                            cash: negativeCashBalance,
                            bank: negativeBankBalance,
                        },
                    },
                    { status: 409 }
                );
            }

            const unallocatedTransactionAmount =
                Number(
                    preview.movement?.unallocatedTransactionAmount || 0
                );

            const salesWithPaymentIssues =
                preview.movement?.salesWithPaymentIssues || [];

            if (
                unallocatedTransactionAmount !== 0 ||
                salesWithPaymentIssues.length > 0
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Some transactions or sales payments are not properly allocated to Cash or Bank. Resolve them before closing.",

                        unallocatedTransactionAmount,
                        salesWithPaymentIssues,
                    },
                    { status: 409 }
                );
            }

            if (
                !preview.openingVerification?.verified ||
                !preview.openingVerification?.silverCountVerified
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Opening cash and physical silver balances must both be verified before closing this month.",
                    },
                    { status: 409 }
                );
            }

            if (!cashMatches || !bankMatches || !silverMatches) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Physical cash, bank or silver counts do not match the system balances. Reconcile all differences before closing.",

                        differences: {
                            cash: paiseToRupees(cashDifferencePaise),
                            bank: paiseToRupees(bankDifferencePaise),
                            silverGrams: silverDifferenceGrams,
                        },
                    },
                    { status: 409 }
                );
            }

            if (
                preview.profit?.status !== "calculated" ||
                preview.profit?.silverAdjustment?.status !== "calculated" ||
                preview.profit?.confirmedRealProfit === null ||
                preview.profit?.estimatedRealProfit === null
            ) {
                return NextResponse.json(
                    {
                        success: false,
                        message:
                            "Profit or silver adjustment data is incomplete. Resolve the issues before closing.",
                    },
                    { status: 409 }
                );
            }
        }

        const profit = preview.profit;

        const silverAdjustment = profit.silverAdjustment;

        const previousMonthKey = getPreviousMonth(monthKey);

        session = await mongoose.startSession();

        let savedClose = null;

        await session.withTransaction(async () => {
            const existingClose = await OutletMonthClose.findOne({
                monthKey,
            }).session(session);

            if (existingClose?.status === "closed") {
                throw new Error("MONTH_ALREADY_CLOSED");
            }

            let previousMonthCloseId = null;

            if (monthKey !== CUTOVER_MONTH) {
                const previousClose = await OutletMonthClose.findOne({
                    monthKey: previousMonthKey,
                    status: "closed",
                })
                    .select("_id")
                    .session(session)
                    .lean();

                if (!previousClose) {
                    throw new Error("PREVIOUS_MONTH_NOT_CLOSED");
                }

                previousMonthCloseId = previousClose._id;
            }

            const snapshot = {
                opening: {
                    cashPaise: moneyToPaise(preview.opening.cash),

                    bankPaise: moneyToPaise(preview.opening.bank),

                    silverGrams: roundGrams(
                        preview.opening.silverGrams
                    ),
                },

                closing: {
                    cashPaise: systemCashPaise,

                    bankPaise: moneyToPaise(preview.closing.bank),

                    silverGrams: systemSilverGrams,
                },

                profit: {
                    netSalesPaise: nullableMoneyToPaise(
                        profit.salesRevenue
                    ),

                    operatingMarginPaise:
                        nullableMoneyToPaise(profit.operatingMargin),

                    confirmedSilverAdjustmentPaise:
                        nullableMoneyToPaise(silverAdjustment.confirmed),

                    provisionalSilverAdjustmentPaise:
                        nullableMoneyToPaise(silverAdjustment.provisional),

                    operatingExpensesPaise:
                        nullableMoneyToPaise(profit.operatingExpenses),

                    setupCostsPaise: 0,

                    confirmedRealProfitPaise:
                        nullableMoneyToPaise(profit.confirmedRealProfit),

                    estimatedRealProfitPaise:
                        nullableMoneyToPaise(profit.estimatedRealProfit),
                },

                physicalCashCountPaise: physicalCashPaise,

                physicalBankCountPaise: physicalBankPaise,

                physicalSilverCountGrams: physicalSilverGrams,

                cashDifferencePaise,

                bankDifferencePaise,

                silverDifferenceGrams,

                status: action === "close" ? "closed" : "draft",

                notes: notes.trim(),

                closedAt:
                    action === "close" ? new Date() : null,

                closedBy:
                    action === "close" ? "admin" : "",

                previousMonthCloseId,
            };

            if (existingClose) {
                existingClose.set(snapshot);

                await existingClose.save({ session });

                savedClose = existingClose;
            } else {
                const [created] = await OutletMonthClose.create(
                    [
                        {
                            monthKey,
                            ...snapshot,
                        },
                    ],
                    { session }
                );

                savedClose = created;
            }
        });

        return NextResponse.json({
            success: true,

            testingMode: TESTING_MODE,

            message:
                action === "close"
                    ? `${monthKey} successfully closed.`
                    : `${monthKey} draft saved successfully.`,

            monthKey,

            status: savedClose.status,

           physicalCounts: {
    cash: paiseToRupees(physicalCashPaise),
    bank: paiseToRupees(physicalBankPaise),
    silverGrams: physicalSilverGrams,
},

           systemClosing: {
    cash: paiseToRupees(systemCashPaise),
    bank: paiseToRupees(systemBankPaise),
    silverGrams: systemSilverGrams,
},

        differences: {
    cash: paiseToRupees(cashDifferencePaise),
    bank: paiseToRupees(bankDifferencePaise),
    silverGrams: silverDifferenceGrams,
},

            closedAt: savedClose.closedAt,
        });
    } catch (error) {
        console.error("Monthly closing save error:", error);

        if (error.message === "MONTH_ALREADY_CLOSED") {
            return NextResponse.json(
                {
                    success: false,
                    message: "This month is already closed.",
                },
                { status: 409 }
            );
        }

        if (error.message === "PREVIOUS_MONTH_NOT_CLOSED") {
            return NextResponse.json(
                {
                    success: false,
                    message:
                        "The previous month must be closed first.",
                },
                { status: 409 }
            );
        }

        return NextResponse.json(
            {
                success: false,
                message: "Unable to save monthly closing.",
                error: error.message,
            },
            { status: 500 }
        );
    } finally {
        if (session) {
            await session.endSession();
        }
    }
}
