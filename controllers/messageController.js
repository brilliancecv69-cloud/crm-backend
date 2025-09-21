const Message = require("../models/Message");
const logger = require("../utils/logger");
const asyncHandler = require("../middlewares/asyncHandler");
const { publishToOutgoingQueue } = require("../services/rabbitmqService"); // <-- الاعتماد على RabbitMQ فقط

// --- دوال مساعدة للردود ---
function ok(res, data, code = 200) {
  return res.status(code).json({ ok: true, data });
}
function fail(res, error, code = 400) {
  return res.status(code).json({ ok: false, error });
}

/**
 * جلب الرسائل لجهة اتصال معينة.
 * (هذه الدالة تبقى كما هي)
 */
exports.getMessages = asyncHandler(async (req, res) => {
  const { contactId } = req.query;
  if (!contactId) return fail(res, "contactId is required");

  const messages = await Message.find({
    contactId,
    tenantId: req.user.tenantId,
  }).sort({ createdAt: 1 });

  return ok(res, messages);
});


/**
 * إرسال رسالة جديدة عن طريق وضعها في طابور الإرسال.
 * هذا هو التعديل الأساسي لضمان الموثوقية.
 */
exports.addMessage = asyncHandler(async (req, res) => {
  const { contactId, body, meta = {} } = req.body;
  const { tenantId } = req.user;

  // ✅ --- بداية التعديل --- ✅
  // الشرط الجديد: يجب وجود جهة اتصال، بالإضافة إلى نص أو ملف ميديا
  if (!contactId || (!body && (!meta || !meta.path))) {
    return fail(res, "A message must have a body or a media file.");
  }
  // ✅ --- نهاية التعديل --- ✅

  try {
    // 1. تجهيز حمولة الرسالة للطابور
    const messagePayload = {
        tenantId: tenantId.toString(),
        contactId: contactId.toString(),
        body: body || '', // إرسال نص فارغ إذا لم يكن موجوداً لضمان عدم حدوث خطأ
        mediaInfo: meta.path ? { // إرسال معلومات الميديا فقط إذا كانت موجودة
            url: meta.mediaUrl,
            path: meta.path,
            fileName: meta.fileName,
            mediaType: meta.mediaType
        } : null
    };

    // 2. نشر الرسالة إلى طابور الإرسال في RabbitMQ
    await publishToOutgoingQueue(messagePayload);

    // 3. إرجاع استجابة فورية للمستخدم بأن الرسالة تم جدولتها للإرسال
    return ok(res, { message: "Message queued for sending successfully" }, 202); // 202 Accepted

  } catch (err) {
    logger.error("[API] Error queuing message for sending", { err: err.message });
    return fail(res, "Failed to queue message: " + err.message, 500);
  }
});
