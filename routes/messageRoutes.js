// crm-frontend/backend/routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ctrl = require("../controllers/messageController");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

// 🟢 نجيب المسار من ENV الأول، ولو مش موجود نستخدم الباكدج
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpegPath = process.env.FFMPEG_PATH || ffmpegInstaller.path;

ffmpeg.setFfmpegPath(ffmpegPath);
console.log("✅ Using ffmpeg binary at:", ffmpegPath);

router.use(auth);

// --- Endpoints الأساسية للرسائل ---
router.get("/", ctrl.getMessages);
router.post("/", ctrl.addMessage);

// --- إعداد مجلد الرفع ---
const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// --- Endpoint رفع الملفات مع دعم تحويل webm → ogg ---
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded" });
  }

  let finalPath = req.file.path;
  let finalUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`;
  let finalFileName = req.file.originalname;
  let finalType = req.file.mimetype;

  try {
    // 🟢 لو الملف صوت webm → نحوله ogg (opus)
    if (req.file.mimetype === "audio/webm") {
      const oggName = req.file.filename.replace(/\.webm$/, "") + ".ogg";
      const oggPath = path.join(uploadDir, oggName);

      await new Promise((resolve, reject) => {
  ffmpeg({ source: req.file.path, logger: console })   // 🟢 source صريح
    .setFfmpegPath(ffmpegPath)                        // 🟢 نتأكد بنمرره
    .audioCodec("libopus")
    .format("ogg")
    .save(oggPath)
    .on("end", resolve)
    .on("error", reject);
});


      /// استخدم ملف OGG الجديد
finalPath = oggPath;
finalUrl = `${req.protocol}://${req.get("host")}/uploads/${oggName}`;
finalFileName = oggName;
// ✅ نخلي الـ mediaType أوضح ومتوافق مع واتساب والـ <audio>
finalType = "audio/ogg; codecs=opus";


      // 🗑️ امسح النسخة القديمة webm
      fs.unlinkSync(req.file.path);
    }

    res.json({
      ok: true,
      data: {
        url: finalUrl,       // رابط الميديا للعرض في الواجهة
        path: finalPath,     // المسار الداخلي للباك اند (مهم للإرسال)
        fileName: finalFileName,
        mediaType: finalType,
      },
    });
  } catch (err) {
    console.error("FFmpeg conversion error:", err);
    res.status(500).json({ ok: false, error: "File conversion failed" });
  }
});

module.exports = router;
