// crm-frontend/backend/routes/messageRoutes.js
const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const ctrl = require("../controllers/messageController");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffmpegPath = process.env.FFMPEG_PATH || ffmpegInstaller.path;

ffmpeg.setFfmpegPath(ffmpegPath);
console.log("✅ Using ffmpeg binary at:", ffmpegPath);

router.use(auth);

router.get("/", ctrl.getMessages);
router.post("/", ctrl.addMessage);

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

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: "No file uploaded" });
  }

  // ✅ --- بداية التعديل --- ✅
  // استخدام متغير بيئة الإنتاج أو بناء الرابط الآمن يدوياً
  const host = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
  const secureHost = host.replace(/^http:/, 'https');
  // ✅ --- نهاية التعديل --- ✅

  let finalPath = req.file.path;
  let finalUrl = `${secureHost}/uploads/${req.file.filename}`; // ✅ استخدام الرابط الآمن
  let finalFileName = req.file.originalname;
  let finalType = req.file.mimetype;

  try {
    if (req.file.mimetype === "audio/webm") {
      const oggName = req.file.filename.replace(/\.webm$/, "") + ".ogg";
      const oggPath = path.join(uploadDir, oggName);

      await new Promise((resolve, reject) => {
        ffmpeg({ source: req.file.path, logger: console })
          .setFfmpegPath(ffmpegPath)
          .audioCodec("libopus")
          .format("ogg")
          .save(oggPath)
          .on("end", resolve)
          .on("error", reject);
      });

      finalPath = oggPath;
      finalUrl = `${secureHost}/uploads/${oggName}`; // ✅ استخدام الرابط الآمن هنا أيضاً
      finalFileName = oggName;
      finalType = "audio/ogg; codecs=opus";

      fs.unlinkSync(req.file.path);
    }

    res.json({
      ok: true,
      data: {
        url: finalUrl,
        path: finalPath,
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
