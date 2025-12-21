const mongoose = require("mongoose");

const CACHE_KEY = "__storeTrackMongoose";

/**
 * Serverless-friendly Mongo connector.
 * - Caches the connection/promise across warm invocations.
 * - Throws clear errors (do not process.exit in serverless).
 */
async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    const err = new Error("MONGO_URI is not set. Configure it in your Vercel environment variables.");
    err.code = "MONGO_URI_MISSING";
    throw err;
  }

  const cached = (globalThis[CACHE_KEY] ||= { conn: null, promise: null });

  if (cached.conn) return cached.conn;

  // Fail fast instead of buffering operations for 10s+
  mongoose.set("bufferCommands", false);

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(mongoUri, {
        // Keep the error feedback loop short on cold starts.
        serverSelectionTimeoutMS: 10_000,
      })
      .then(m => m);
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    // Allow retry on the next invocation/request.
    cached.promise = null;
    cached.conn = null;
    throw err;
  }
}

module.exports = connectDB;