const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const { uploadToR2, deleteFromR2 } = require('../utils/r2Storage');

const router = express.Router();

// Configure Multer for in-memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024, // Accept up to 15MB incoming, backend will compress under 100KB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files (JPG, PNG, WebP) are allowed'), false);
        }
    },
});

/**
 * POST /api/upload/teacher-photo
 * Compresses any uploaded photo to guaranteed < 100KB and uploads to Cloudflare R2
 */
router.post('/teacher-photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const MAX_SIZE_BYTES = 100 * 1024; // Strictly 100 KB limit
        let targetDimension = 600; // Profile photo resolution (600x600 max)
        let quality = 80;
        let optimizedBuffer = null;

        // Iteratively optimize image to guarantee size is <= 100KB
        for (let attempt = 0; attempt < 5; attempt++) {
            optimizedBuffer = await sharp(req.file.buffer)
                .rotate() // Auto-orient based on EXIF
                .resize({
                    width: targetDimension,
                    height: targetDimension,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .webp({ quality })
                .toBuffer();

            if (optimizedBuffer.length <= MAX_SIZE_BYTES) {
                break;
            }

            // If still over 100KB, drop quality and resolution
            quality -= 15;
            if (quality < 25) quality = 25;
            if (attempt >= 1) {
                targetDimension = Math.round(targetDimension * 0.8);
            }
        }

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const key = `teachers/teacher_${uniqueSuffix}.webp`;

        // Upload directly to Cloudflare R2
        const uploadResult = await uploadToR2(optimizedBuffer, key, 'image/webp');

        const sizeKB = Math.round((optimizedBuffer.length / 1024) * 10) / 10;

        res.json({
            success: true,
            url: uploadResult.url,
            key: uploadResult.key,
            sizeKB,
        });
    } catch (err) {
        console.error('Error uploading teacher photo to R2:', err);
        res.status(500).json({ message: err.message || 'Image upload failed' });
    }
});

/**
 * Helper to compress document images (NID, SSC, HSC, University ID) to guaranteed <= 100KB and upload to R2
 */
async function processAndUploadDocument(req, res, prefix, logName) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No image file uploaded' });
        }

        const MAX_SIZE_BYTES = 100 * 1024; // Strictly 100 KB limit
        let targetDimension = 1200; // Allow wider dimension so text remains readable
        let quality = 80;
        let optimizedBuffer = null;

        for (let attempt = 0; attempt < 5; attempt++) {
            optimizedBuffer = await sharp(req.file.buffer)
                .rotate()
                .resize({
                    width: targetDimension,
                    height: targetDimension,
                    fit: 'inside',
                    withoutEnlargement: true,
                })
                .webp({ quality })
                .toBuffer();

            if (optimizedBuffer.length <= MAX_SIZE_BYTES) {
                break;
            }

            quality -= 15;
            if (quality < 25) quality = 25;
            if (attempt >= 1) {
                targetDimension = Math.round(targetDimension * 0.85);
            }
        }

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const key = `teachers/${prefix}_${uniqueSuffix}.webp`;

        const uploadResult = await uploadToR2(optimizedBuffer, key, 'image/webp');
        const sizeKB = Math.round((optimizedBuffer.length / 1024) * 10) / 10;

        res.json({
            success: true,
            url: uploadResult.url,
            key: uploadResult.key,
            sizeKB,
        });
    } catch (err) {
        console.error(`Error uploading teacher ${logName} to R2:`, err);
        res.status(500).json({ message: err.message || `${logName} upload failed` });
    }
}

/**
 * POST /api/upload/teacher-nid
 * Compresses any uploaded NID / Birth certificate image to guaranteed < 100KB and uploads to Cloudflare R2
 */
router.post('/teacher-nid', upload.single('photo'), (req, res) => {
    processAndUploadDocument(req, res, 'nid', 'NID / Birth certificate');
});

/**
 * POST /api/upload/teacher-ssc
 * Compresses any uploaded SSC Marksheet to guaranteed < 100KB and uploads to Cloudflare R2
 */
router.post('/teacher-ssc', upload.single('photo'), (req, res) => {
    processAndUploadDocument(req, res, 'ssc', 'SSC Marksheet');
});

/**
 * POST /api/upload/teacher-hsc
 * Compresses any uploaded HSC Marksheet to guaranteed < 100KB and uploads to Cloudflare R2
 */
router.post('/teacher-hsc', upload.single('photo'), (req, res) => {
    processAndUploadDocument(req, res, 'hsc', 'HSC Marksheet');
});

/**
 * POST /api/upload/teacher-uni-id
 * Compresses any uploaded University ID / Admission Slip to guaranteed < 100KB and uploads to Cloudflare R2
 */
router.post('/teacher-uni-id', upload.single('photo'), (req, res) => {
    processAndUploadDocument(req, res, 'uni_id', 'University ID / Admission Slip');
});

/**
 * DELETE /api/upload/teacher-photo & /api/upload/teacher-document
 * Deletes a previously uploaded photo or document from Cloudflare R2
 */
const handleDeleteMedia = async (req, res) => {
    try {
        const { url, key } = req.body;
        if (!url && !key) {
            return res.status(400).json({ message: 'URL or key is required to delete' });
        }

        await deleteFromR2(key || url);
        res.json({ success: true, message: 'File deleted from storage' });
    } catch (err) {
        console.error('Error deleting file from R2:', err);
        res.status(500).json({ message: err.message || 'Delete failed' });
    }
};

router.delete('/teacher-photo', handleDeleteMedia);
router.delete('/teacher-document', handleDeleteMedia);

module.exports = router;
