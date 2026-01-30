import fs from 'fs';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';

/**
 * @route   POST /api/upload
 * @desc    Upload file to Cloudinary
 * @access  Private
 */
export const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Upload to Cloudinary
    const result = await uploadToCloudinary(req.file.path);

    // Delete temporary file
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: result.url,
        publicId: result.public_id
      }
    });
  } catch (error) {
    // Delete temporary file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temporary file:', unlinkError);
      }
    }

    console.error('Upload error details:', error);
    console.error('Cloudinary config:', {
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? 'Set' : 'Not set',
      api_key: process.env.CLOUDINARY_API_KEY ? 'Set' : 'Not set',
      api_secret: process.env.CLOUDINARY_API_SECRET ? 'Set' : 'Not set'
    });

    res.status(500).json({
      success: false,
      message: error.message || 'Upload failed'
    });
  }
};

/**
 * @route   DELETE /api/upload/:publicId
 * @desc    Delete file from Cloudinary
 * @access  Private
 */
export const deleteFile = async (req, res) => {
  try {
    const { publicId } = req.params;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        message: 'Public ID is required'
      });
    }

    await deleteFromCloudinary(publicId);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};




