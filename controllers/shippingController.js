const asyncHandler = require("../middlewares/asyncHandler");
const ShippingCompany = require("../models/ShippingCompany");
const Contact = require("../models/Contact"); // ✅ تم التغيير إلى موديل العميل
const mongoose = require("mongoose");

// @desc    Create a new shipping company
// @route   POST /api/shipping
exports.create = asyncHandler(async (req, res) => {
  const { name, contactPerson, phone, trackingURL } = req.body;
  const tenantId = req.user.tenantId;

  const company = await ShippingCompany.create({
    tenantId,
    name,
    contactPerson,
    phone,
    trackingURL,
  });

  res.status(201).json({ ok: true, data: company });
});

// @desc    List all shipping companies for a tenant
// @route   GET /api/shipping
exports.list = asyncHandler(async (req, res) => {
  const companies = await ShippingCompany.find({ tenantId: req.user.tenantId });
  res.json({ ok: true, data: companies });
});

// @desc    Get a single shipping company
// @route   GET /api/shipping/:id
exports.getOne = asyncHandler(async (req, res) => {
  const company = await ShippingCompany.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });

  if (!company) {
    return res.status(404).json({ ok: false, error: "Company not found" });
  }

  res.json({ ok: true, data: company });
});

// @desc    Update a shipping company
// @route   PATCH /api/shipping/:id
exports.update = asyncHandler(async (req, res) => {
  const company = await ShippingCompany.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.user.tenantId },
    req.body,
    { new: true, runValidators: true }
  );

  if (!company) {
    return res.status(404).json({ ok: false, error: "Company not found" });
  }

  res.json({ ok: true, data: company });
});

// @desc    Delete a shipping company
// @route   DELETE /api/shipping/:id
exports.remove = asyncHandler(async (req, res) => {
  const company = await ShippingCompany.findOneAndDelete({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });

  if (!company) {
    return res.status(404).json({ ok: false, error: "Company not found" });
  }

  res.json({ ok: true, data: "Company deleted successfully" });
});

// @desc    Get advanced shipping statistics
// @route   GET /api/shipping/stats
exports.getStats = asyncHandler(async (req, res) => {
    const tenantId = new mongoose.Types.ObjectId(req.user.tenantId);

    // ✅ FIX: Switched from Sale.aggregate to Contact.aggregate and updated field paths
    const stats = await Contact.aggregate([
        // 1. Filter contacts that have a shipping company assigned
        {
            $match: {
                tenantId: tenantId,
                "salesData.shippingDetails.company": { $exists: true, $ne: null }
            }
        },
        // 2. Group by company and status to get counts
        {
            $group: {
                _id: {
                    companyId: "$salesData.shippingDetails.company",
                    status: "$salesData.shippingDetails.status"
                },
                count: { $sum: 1 }
            }
        },
        // 3. Group again by company to structure the data
        {
            $group: {
                _id: "$_id.companyId",
                statuses: {
                    $push: {
                        k: "$_id.status",
                        v: "$count"
                    }
                },
                totalShipments: { $sum: "$count" }
            }
        },
        // 4. Convert statuses array to object
        {
            $project: {
                _id: 0,
                companyId: "$_id",
                stats: { $arrayToObject: "$statuses" },
                totalShipments: 1
            }
        },
        // 5. Lookup company details
        {
            $lookup: {
                from: "shippingcompanies",
                localField: "companyId",
                foreignField: "_id",
                as: "companyDetails"
            }
        },
        // 6. Final cleanup and add company name
        {
            $project: {
                company: { $arrayElemAt: ["$companyDetails.name", 0] },
                stats: 1,
                totalShipments: 1
            }
        }
    ]);

    res.json({ ok: true, data: stats });
});