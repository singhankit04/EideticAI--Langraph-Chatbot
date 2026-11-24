import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Full name must be at least 2 characters"],
      maxlength: [80, "Full name cannot exceed 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        "Please provide a valid email address",
      ],
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
      // Password is only required for standard email/password registrations, not OAuth
      required: function () {
        return this.authProvider === "local" && !this.googleId;
      },
    },
    avatar: {
      type: String,
      default: "",
    },
    googleId: {
      type: String,
      default: null,
      sparse: true,
      index: true,
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "github"],
      default: "local",
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 });

export const User = mongoose.model("User", userSchema);
export default User;
