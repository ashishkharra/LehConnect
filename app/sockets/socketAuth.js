const db = require("../models/index");
const { redisClient } = require("../config/redis.config")
const { responseData } = require("../shared/utils/helper.js");

const Vendor = db.vendor;
const Customer = db.customer;

module.exports = async (socket, next) => {
    try {
        const token = socket.handshake.auth?.token;

        if (!token) {
            const errMsg = responseData("Authentication token missing", {}, null, false);
            return next(new Error(JSON.stringify(errMsg)));
        }

        let user = await Vendor.findOne({ where: { token, flag: 0 } });
        let role = "VENDOR";


        if (!user) {
            user = await Customer.findOne({ where: { token, flag: 0 } });
            role = "CUSTOMER";
        }

        if (!user) {
            const errMsg = responseData("Unauthorized", {}, null, false);
            return next(new Error(JSON.stringify(errMsg)));
        }

        socket.user = {
            id: user.id,
            token: user.token,
            role
        };

        await redisClient.sAdd(`user_sockets:${user.token}`, socket.id);

        socket.on("disconnect", async () => {
            await redisClient.sRem(`user_sockets:${user.token}`, socket.id);
        });

        next();
    } catch (err) {
        console.error("Socket auth error:", err);
        const errMsg = responseData("Authentication failed", {}, null, false);
        next(new Error(JSON.stringify(errMsg)));
    }
};

