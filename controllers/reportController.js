// backend/controllers/reportController.js
const mongoose = require("mongoose");
const User = require("../models/User");
const Contact = require("../models/Contact");
const Expense = require("../models/Expense");
const asyncHandler = require("../middlewares/asyncHandler");
const xlsx = require("xlsx");
const logger = require("../utils/logger");
// --- ✅ START: NEW MODEL IMPORTED ---
const Message = require("../models/Message");
// --- ✅ END: NEW MODEL IMPORTED ---


const isValidObjectId = (id) => {
  try {
    return mongoose.Types.ObjectId.isValid(id);
  } catch {
    return false;
  }
};

const getReportData = async (tenantId, query) => {
  let tenantObjectId;

  try {
    if (tenantId instanceof mongoose.Types.ObjectId) {
      tenantObjectId = tenantId;
    } else if (typeof tenantId === "string" && isValidObjectId(tenantId)) {
      tenantObjectId = new mongoose.Types.ObjectId(tenantId);
    } else {
      throw new Error("Invalid tenantId");
    }
  } catch (err) {
    logger.error("TenantId parsing failed", { tenantId, err: err.message });
    throw new Error("Invalid tenantId");
  }

  const { from, to, assignedTo } = query;

  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) {
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
    dateFilter.$lte = endDate;
  }

  const salesFilter = { tenantId: tenantObjectId };
  if (Object.keys(dateFilter).length > 0) salesFilter.createdAt = dateFilter;
  if (assignedTo && isValidObjectId(assignedTo)) {
    salesFilter.assignedTo = new mongoose.Types.ObjectId(assignedTo);
  }

  const aggregationResult = await Contact.aggregate([
    { $match: salesFilter },
    {
      $facet: {
        leads: [{ $match: { stage: "lead" } }, { $count: "total" }],
        sales: [
          { $match: { "salesData.pipeline_status": "won" } },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: "$salesData.amount" },
              count: { $sum: 1 },
            },
          },
        ],
        pipeline: [
          {
            $group: {
              _id: "$salesData.pipeline_status",
              count: { $sum: 1 },
            },
          },
          { $project: { status: "$_id", count: 1, _id: 0 } },
        ],
        monthlyRevenue: [
          { $match: { "salesData.pipeline_status": "won" } },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
              },
              revenue: { $sum: "$salesData.amount" },
              deals: { $sum: 1 },
            },
          },
          { $sort: { "_id.year": 1, "_id.month": 1 } },
        ],
        rawDeals: [
          {
            $project: {
              _id: 0,
              name: 1,
              phone: 1,
              stage: 1,
              "salesData.amount": 1,
              "salesData.pipeline_status": 1,
              createdAt: 1,
              assignedTo: 1,
            },
          },
        ],
      },
    },
  ]);

  const expenseFilter = { tenantId: tenantObjectId };
  if (Object.keys(dateFilter).length > 0) expenseFilter.date = dateFilter;

  const [expenseAggregation, salesTeam] = await Promise.all([
    Expense.aggregate([
      { $match: expenseFilter },
      { $group: { _id: "$category", totalAmount: { $sum: "$amount" } } },
      {
        $project: {
          _id: 0,
          category: { $ifNull: ["$_id", "Uncategorized"] },
          totalAmount: 1,
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),
    User.find({ tenantId: tenantObjectId, role: "sales" }, "name email _id").lean(),
  ]);

  const expensesTotal = expenseAggregation.reduce(
    (sum, item) => sum + item.totalAmount,
    0
  );

  const data = aggregationResult[0];
  const leads = data.leads[0]?.total || 0;
  const wonDeals = data.sales[0]?.count || 0;
  const salesAmount = data.sales[0]?.totalAmount || 0;

  const conversionRate = leads > 0 ? (wonDeals / leads) * 100 : 0;
  const avgDealSize = wonDeals > 0 ? salesAmount / wonDeals : 0;

  return {
    kpis: {
      leads,
      sales: wonDeals,
      salesAmount,
      expenses: expensesTotal,
      conversionRate,
      avgDealSize,
    },
    pipeline: data.pipeline || [],
    monthlyRevenue: data.monthlyRevenue || [],
    rawDeals: data.rawDeals || [],
    expensePerformance: expenseAggregation || [],
    salesTeam: salesTeam || [],
  };
};

exports.getDetailedReport = asyncHandler(async (req, res) => {
  try {
    const reportData = await getReportData(req.user.tenantId, req.query);
    res.json({ ok: true, data: reportData });
  } catch (err) {
    logger.error("DETAILED REPORT ERROR:", err);
    res.status(500).json({ ok: false, error: "An error occurred while generating the report." });
  }
});

exports.exportReport = asyncHandler(async (req, res) => {
  try {
    const data = await getReportData(req.user.tenantId, req.query);
    const wb = xlsx.utils.book_new();

    const kpiData = [
      { Metric: "New Leads", Value: data.kpis.leads },
      { Metric: "Won Deals", Value: data.kpis.sales },
      { Metric: "Sales Revenue (EGP)", Value: data.kpis.salesAmount },
      { Metric: "Total Expenses (EGP)", Value: data.kpis.expenses },
      { Metric: "Conversion Rate (%)", Value: data.kpis.conversionRate.toFixed(2) },
      { Metric: "Average Deal Size (EGP)", Value: data.kpis.avgDealSize.toFixed(2) },
    ];
    const ws_kpi = xlsx.utils.json_to_sheet(kpiData);
    xlsx.utils.book_append_sheet(wb, ws_kpi, "Summary KPIs");

    if (data.pipeline.length > 0) {
      const wsPipeline = xlsx.utils.json_to_sheet(data.pipeline);
      xlsx.utils.book_append_sheet(wb, wsPipeline, "Pipeline");
    }
    if (data.monthlyRevenue.length > 0) {
      const wsMonthly = xlsx.utils.json_to_sheet(data.monthlyRevenue);
      xlsx.utils.book_append_sheet(wb, wsMonthly, "Monthly Revenue");
    }
    if (data.rawDeals.length > 0) {
      const wsRaw = xlsx.utils.json_to_sheet(data.rawDeals);
      xlsx.utils.book_append_sheet(wb, wsRaw, "Raw Deals");
    }
    if (data.expensePerformance.length > 0) {
      const wsExpense = xlsx.utils.json_to_sheet(data.expensePerformance);
      xlsx.utils.book_append_sheet(wb, wsExpense, "Expenses");
    }

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="Detailed_Report.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    logger.error("Export error:", err);
    res.status(500).json({ ok: false, error: "Failed to export report." });
  }
});


// --- ✅ START: NEW FUNCTION ADDED FOR SALES PERFORMANCE ---

/**
 * @desc    Get performance KPIs for a specific sales user
 * @route   GET /api/reports/sales-performance/:userId
 * @access  Admin
 */
exports.getSalesPerformanceKpis = asyncHandler(async (req, res) => {
  const { tenantId } = req.user;
  const { userId } = req.params;
  const { from, to } = req.query;

  if (!isValidObjectId(userId)) {
    res.status(400);
    throw new Error("Invalid user ID");
  }

  const filter = {
    tenantId: new mongoose.Types.ObjectId(tenantId),
    assignedTo: new mongoose.Types.ObjectId(userId),
  };

  // Add date range filtering if provided
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) {
    const endDate = new Date(to);
    endDate.setHours(23, 59, 59, 999);
    dateFilter.$lte = endDate;
    filter.createdAt = dateFilter;
  }
  
  const [
    totalAssigned,
    convertedToCustomer,
    salesDeals,
  ] = await Promise.all([
    // Total leads/contacts ever assigned to this user within the date range
    Contact.countDocuments(filter),
    
    // How many of those assigned contacts became 'customer' or 'sales'
    Contact.countDocuments({ ...filter, stage: { $in: ['customer', 'sales'] } }),

    // Detailed aggregation for sales deals
    Contact.aggregate([
      { $match: { ...filter, "salesData.pipeline_status": "won" } },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$salesData.amount" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const salesDealData = salesDeals[0] || { totalAmount: 0, count: 0 };

  const kpis = {
    totalAssigned,
    convertedToCustomer,
    totalSalesDeals: salesDealData.count,
    totalSalesAmount: salesDealData.totalAmount,
  };

  res.json({ ok: true, data: kpis });
});
// --- ✅ END: NEW FUNCTION ADDED ---