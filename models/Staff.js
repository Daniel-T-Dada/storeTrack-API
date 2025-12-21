const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const staffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "manager", "staff"],
      default: "staff",
    },

    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Store owner
      required: true,
    },

    refreshToken: {
      type: String,
      select: false,
    },

    profileImage: {
      type: String,
      trim: true,
    },

    profileImagePublicId: {
      type: String,
      trim: true,
      select: false,
    },

    createdAt: { type: Date, default: Date.now },
  },
  {
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform: (doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  }
);

/**
 * Hash password before save
 */
staffSchema.pre("save", async function () {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

/**
 * Compare password
 */
staffSchema.methods.comparePassword = function (password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("Staff", staffSchema);
