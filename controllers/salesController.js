// backend/controllers/salesController.js
const mongoose = require("mongoose");
const Sale = require("../models/Sale");
const Customer = require("../models/Customer");

// 🟢 جلب كل الـ Sales — يرجّع { items, total } زي قبل
exports.listSales = async (req, res) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 }).lean();
    return res.json({ items: sales, total: sales.length });
  } catch (err) {
    return res.status(500).json({ message: "Error fetching sales" });
  }
};

// 🟢 إنشاء Sale جديد — يرجّع كائن الـsale مباشرة زي قبل
exports.createSale = async (req, res) => {
  try {
    const sale = await Sale.create(req.body);
    res.status(201).json(sale);
  } catch (err) {
    res.status(400).json({ message: "Error creating sale" });
  }
};

// 🟢 تحديث Sale — يرجّع كائن الـsale
exports.updateSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!sale) return res.status(404).json({ message: "Not found" });
    res.json(sale);
  } catch (err) {
    res.status(400).json({ message: "Error updating sale" });
  }
};

// 🟢 حذف Sale — نفس الشكل القديم
exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ message: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ message: "Error deleting sale" });
  }
};

// 🟢 إنشاء Sale من Customer موجود
// يحافظ على شكل الرد القديم (يرجّع sale فقط) + يحدّث حالة العميل إلى SALES ويعمل archive
exports.createFromCustomer = async (req, res) => {
  let session = null;
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    session = await mongoose.startSession().catch(() => null);
    if (session) await session.startTransaction();

    const sale = await Sale.create([{
      title: req.body.title || `Deal with ${customer.name || customer.phone}`,
      customerId: customer._id,
      clientId: customer.clientId || null,
      customer: customer.name || customer.phone || "Unknown",
      amount: req.body.amount || 0,
      status: req.body.status || "new",
      owner: req.body.owner || "",
      expectedClose: req.body.expectedClose || null,
      notes: req.body.notes || customer.notes || "",
    }], { session }).then(a => a[0]);

    // ترقية العميل ليكون Sales + archive عشان يختفي من customers
    await Customer.findByIdAndUpdate(
      customer._id,
      {
        $set: {
          status: "sales",
          archived: true,
          soldAt: req.body.soldAt ? new Date(req.body.soldAt) : new Date(),
          soldBy: req.body.soldBy || req.body.owner || null,
        },
        $push: {
          history: {
            by: req.user?.email || req.user?.id || "system",
            from: customer.status || "customer",
            to: "sales",
            date: new Date(),
            note: `Upgraded to sale (saleId:${sale._id})`,
          }
        }
      },
      { new: true, session }
    );

    if (session) { await session.commitTransaction(); session.endSession(); }

    // ⚠️ نحافظ على شكل الرد القديم: نرجّع الـsale مباشرة
    return res.status(201).json(sale);
  } catch (err) {
    if (session) { await session.abortTransaction(); session.endSession(); }
    return res.status(500).json({ message: "Error creating sale from customer" });
  }
};
