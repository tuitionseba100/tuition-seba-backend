const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Initialize S3 client configured for Cloudflare R2
const r2Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'tsf-images';
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || 'https://pub-31f320a9765f4024b7a41ec47b8ce30e.r2.dev').replace(/\/$/, '');

/**
 * Upload a file buffer to Cloudflare R2
 * @param {Buffer} buffer - File buffer
 * @param {string} key - File path / key in R2 (e.g., 'teachers/photo_123.webp')
 * @param {string} contentType - MIME type (e.g., 'image/webp', 'image/jpeg')
 * @returns {Promise<{ success: boolean, key: string, url: string }>}
 */
async function uploadToR2(buffer, key, contentType = 'image/jpeg') {
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    });

    await r2Client.send(command);

    const publicFileUrl = `${PUBLIC_URL}/${key}`;
    return {
        success: true,
        key,
        url: publicFileUrl,
    };
}

/**
 * Delete an object from Cloudflare R2
 * @param {string} key - File path / key or full public URL
 */
async function deleteFromR2(keyOrUrl) {
    if (!keyOrUrl) return;

    let key = keyOrUrl;
    if (keyOrUrl.startsWith('http://') || keyOrUrl.startsWith('https://')) {
        const urlObj = new URL(keyOrUrl);
        key = urlObj.pathname.replace(/^\//, '');
    }

    try {
        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        await r2Client.send(command);
    } catch (err) {
        console.error('Error deleting from R2:', err);
    }
}

module.exports = {
    r2Client,
    uploadToR2,
    deleteFromR2,
};
