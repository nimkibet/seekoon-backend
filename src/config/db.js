import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // 👇 THIS IS THE FIX
      // It forces the connection to use IPv4, solving the "querySrv" error
      family: 4,
      serverSelectionTimeoutMS: 5000, // Fail after 5 seconds
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
};