const { io } = require("socket.io-client");

const TOKEN = {
    "iv": "54135d18e00ef5e6954250e9",
    "content": "639f7afbb9ef78451e81cb1a92cdd61598ebdc16cc15f1d731ef6545088c1c08094d2fe730eca94290ce0bd78d17c148f37db10f2a2c399145cda463f59fb33c",
    "tag": "ecd08193b29caf3cfed382641574c3b2"
};

const socket = io("http://localhost:3000", {
    auth: {
        token: TOKEN
    }
});

socket.on("connect", () => {
    socket.emit("booking:create", {
        trip_type: "one_way",
        vehicle_type: "Sedan",
        pickup_datetime: new Date().toISOString(),
        pickup_location: "Airport",
        drop_location: "City Center",
        city: "Jaipur",
        state: "Rajasthan",
        booking_amount: 1500,
        total_amount: 1700,
        is_negotiable: true,
        commission: 100,
        visibility: "public",
        secure_booking: false,
        extra_requirements: {
            luggage: "2 bags"
        }
    }, (response) => {
        console.log("📩 Server response:", response);
        socket.disconnect();
    });
});

socket.on("connect_error", (err) => {
    console.error("❌ Connection error:", err.message);
});
