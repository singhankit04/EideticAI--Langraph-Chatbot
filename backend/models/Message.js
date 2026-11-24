import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["human", "assistant", "system"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    sources: [
      {
        source: { type: String },
        page: { type: Number, default: null },
      },
    ],
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ chatId: 1, createdAt: 1 });

export const Message = mongoose.model("Message", messageSchema);
export default Message;
