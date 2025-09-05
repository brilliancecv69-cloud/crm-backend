// استعمله لاحقًا عندما نقرأ ميزات العميل من DB
module.exports = (featureKey) => (req, res, next) => {
  // في الإصدار الحالي نمرّر الكل، لكن هنا مكان فحص features من جدول Client
  return next();
};
