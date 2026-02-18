const multer = require("multer");
const path = require("path");
const fs = require("fs");

const videoPath = path.join(__dirname, "../../public/uploads");
const thumbPath = path.join(__dirname, "../../public/uploads");

[videoPath, thumbPath].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (file.fieldname === "video_file") {
            cb(null, videoPath);
        } else if (file.fieldname === "thumbnail") {
            cb(null, thumbPath);
        }
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const uniqueName = `${file.fieldname}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === "video_file") {
        const allowedVideos = [
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-msvideo"
        ];
        return allowedVideos.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error("Only video files are allowed"), false);
    }

    if (file.fieldname === "thumbnail") {
        const allowedImages = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];
        return allowedImages.includes(file.mimetype)
            ? cb(null, true)
            : cb(new Error("Only image files are allowed"), false);
    }

    cb(new Error("Invalid upload field"), false);
};

const uploadVideo = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024
    }
}).fields([
    { name: "video_file", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 }
]);

module.exports = uploadVideo;
