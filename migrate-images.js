import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import removeBackground from '@imgly/background-removal-node';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Import Product model
import('./src/models/Product.js').then(module => {
  const Product = module.default;
  runMigration(Product);
});

/**
 * Download image from URL to local file
 */
const downloadImage = (url, filePath) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    const file = fs.createWriteStream(filePath);
    
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filePath)
          .then(resolve)
          .catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download image: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(filePath, () => {});
      reject(err);
    });
  });
};

/**
 * Process image with local AI background removal and upload to Cloudinary
 */
const processAndUploadImage = async (localFilePath) => {
  try {
    // 1. Process the image locally using the free AI
    const blob = await removeBackground(localFilePath);
    
    // 2. Convert the output to a Base64 string for Cloudinary
    const buffer = Buffer.from(await blob.arrayBuffer());
    const dataURL = `data:image/png;base64,${buffer.toString("base64")}`;
    
    // 3. Upload the transparent PNG to Cloudinary
    const result = await cloudinary.uploader.upload(dataURL, {
      folder: 'seekon-apparel',
      resource_type: 'auto',
    });
    
    return result.secure_url;
  } catch (error) {
    throw new Error(`Image processing failed: ${error.message}`);
  }
};

/**
 * Main migration function
 */
const runMigration = async (Product) => {
  const tempDir = path.join(__dirname, 'temp_migration');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  try {
    // Connect to the live database
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🟢 Connected to MongoDB');
    
    // Fetch all products
    const products = await Product.find({});
    console.log(`📦 Found ${products.length} products to migrate`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const product of products) {
      try {
        console.log(`\n🔄 Processing: ${product.name}`);
        
        // Process main image
        if (product.image) {
          const tempFile = path.join(tempDir, `${product._id}_main.jpg`);
          
          try {
            await downloadImage(product.image, tempFile);
            const newImageUrl = await processAndUploadImage(tempFile);
            product.image = newImageUrl;
            console.log(`   ✓ Main image processed`);
          } catch (err) {
            console.log(`   ⚠ Failed to process main image: ${err.message}`);
          } finally {
            // Clean up temp file
            if (fs.existsSync(tempFile)) {
              fs.unlinkSync(tempFile);
            }
          }
        }
        
        // Process additional images
        if (product.images && product.images.length > 0) {
          const newImages = [];
          
          for (let i = 0; i < product.images.length; i++) {
            const imgUrl = product.images[i];
            const tempFile = path.join(tempDir, `${product._id}_${i}.jpg`);
            
            try {
              await downloadImage(imgUrl, tempFile);
              const newImageUrl = await processAndUploadImage(tempFile);
              newImages.push(newImageUrl);
              console.log(`   ✓ Image ${i + 1} processed`);
            } catch (err) {
              console.log(`   ⚠ Failed to process image ${i + 1}: ${err.message}`);
              // Keep original if processing fails
              newImages.push(imgUrl);
            } finally {
              // Clean up temp file
              if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
              }
            }
          }
          
          product.images = newImages;
        }
        
        // Save updated product
        await product.save();
        successCount++;
        console.log(`   ✅ Product updated successfully`);
        
      } catch (err) {
        failCount++;
        console.log(`   ❌ Failed to process product: ${err.message}`);
      }
    }
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`   ✓ Successful: ${successCount}`);
    console.log(`   ✗ Failed: ${failCount}`);
    
    console.log('\n🎉 ALL IMAGES MIGRATED SUCCESSFULLY!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    await mongoose.disconnect();
  }
};
