const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const socketAuth = require("./socketAuth.js");

let io;

module.exports = {

    initSocket: async (httpServer, redisClient) => {
        if (io) {
            return io;
        }
        io = new Server(httpServer, {
            cors: {
                origin: "*",
                credentials: true
            }
        });

        const pubClient = redisClient;
        const subClient = pubClient.duplicate();

        io.adapter(createAdapter(pubClient, subClient));

        io.use(socketAuth);

        io.on("connection", (socket) => {
            if (socket.user.role === "VENDOR" || socket.user.role === "vendor") {
                socket.join(`vendor:${socket.user.token}`);
                socket.join(`vendor-network:${socket.user.token}`);
            }

            socket.on("disconnect", () => {
                console.log("Disconnected:", socket.id);
            });
        });

        return io;
    },

    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized");
        }
        return io;
    }
};

