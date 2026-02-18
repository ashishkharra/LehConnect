const db = require("../models/index");
const { getIO } = require("./index");
const { v4: uuidv4 } = require("uuid");

const Chat = db.chat;

module.exports = (socket) => {
    socket.on("joinBooking", async ({ booking_token }) => {
        if (!booking_token) return;

        socket.join(`booking:${booking_token}`);

        const lastMessages = await Chat.findAll({
            where: { booking_token },
            order: [["created_at", "DESC"]],
            limit: 50
        });

        socket.emit("bookingMessages", lastMessages.reverse());
    });

    socket.on("sendMessage", async (data) => {
        const { booking_token, message, message_type = "TEXT", attachment_url, receiver_token } = data;
        const sender_token = socket.user.token;

        if (!booking_token || !receiver_token || (!message && !attachment_url)) return;

        const chatMessage = await Chat.create({
            token: uuidv4(),
            booking_token,
            sender_token,
            receiver_token,
            message,
            message_type,
            attachment_url,
            status: "SENT"
        });

        const payload = {
            id: chatMessage.id,
            token: chatMessage.token,
            booking_token,
            sender_token,
            receiver_token,
            message,
            message_type,
            attachment_url,
            status: chatMessage.status,
            created_at: chatMessage.created_at
        };

        socket.to(`booking:${booking_token}`).emit("newMessage", payload);
        socket.emit("messageSent", payload);
    });

    socket.on("markAsSeen", async ({ message_token }) => {
        const message = await Chat.findOne({ where: { token: message_token } });
        if (!message) return;

        message.status = "SEEN";
        await message.save();

        const io = getIO();
        io.to(`user:${message.sender_token}`).emit("messageSeen", { token: message.token });
    });
};