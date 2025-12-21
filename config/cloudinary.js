const cloudinary = require("cloudinary").v2;

const isConfigured = () =>
    Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

const initCloudinary = () => {
    if (!isConfigured()) return;

    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
    });
};

const ensureCloudinaryConfigured = () => {
    if (!isConfigured()) {
        const err = new Error(
            "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
        );
        err.status = 501;
        err.code = "CLOUDINARY_NOT_CONFIGURED";
        throw err;
    }
};

const uploadBufferToCloudinary = ({ buffer, mimetype, folder, publicId }) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: publicId,
                resource_type: "image",
                overwrite: true,
            },
            (error, result) => {
                if (error) return reject(error);
                resolve(result);
            }
        );

        stream.end(buffer);
    });

module.exports = {
    cloudinary,
    initCloudinary,
    ensureCloudinaryConfigured,
    uploadBufferToCloudinary,
};
