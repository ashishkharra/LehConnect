const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadPath = path.join(__dirname, "../../public/uploads");
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only image files allowed"), false);
    }
};

const multerConfig = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
});


// Profile image (single)
const uploadProfileImage = multerConfig.single("profile_image");

// Identity images (front & back)
const uploadIdentityImages = multerConfig.fields([
    { name: "identity_front_image", maxCount: 1 },
    { name: "identity_back_image", maxCount: 1 },
    { name: "profile_image", maxCount: 1 }
]);

const uploadImages = multerConfig.fields([
    { name: "aadhaar_front_image", maxCount: 1 },
    { name: "aadhaar_back_image", maxCount: 1 },
    { name: "profile_image", maxCount: 1 },
    { name: "vehicle_image", maxCount: 1 },
    { name: "dl_front_image", maxCount: 1 },
    { name: "dl_back_image", maxCount: 1 },
]);


const siteSlider = multerConfig.array('slider[]', 10);
const updateSliderMulter = multerConfig.single('slider');
const aboutImage = multerConfig.single('image')

const vehicleImage = multerConfig.fields([
    { name: "image1", maxCount: 1 },
    { name: "image2", maxCount: 1 },
]);

module.exports = {
    vehicleImage,
    uploadProfileImage,
    uploadIdentityImages,
    siteSlider,
    uploadImages,
    updateSliderMulter,
    aboutImage
};
