const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// Initialize Express to serve your HTML files
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve all static files (index.html, login.html) in the current folder
app.use(express.static(path.join(__dirname)));

const registeredUsers = {
    "RFID_TAG_9921": { name: "EV Driver 1", balance: 250.00 },
    "RFID_TAG_4402": { name: "EV Driver 2", balance: 0.00 }
};

let chargers = [
    { id: "GC-JHB-01", name: "Sandton City Hub - Bay 1", status: "Charging", currentKw: 45.2, type: "DC", firmware: "v1.4.2", ip: "192.168.1.10" },
    { id: "GC-JHB-02", name: "Sandton City Hub - Bay 2", status: "Available", currentKw: 0, type: "DC", firmware: "v1.4.2", ip: "192.168.1.11" },
    { id: "GC-PTA-01", name: "Menlyn Mall Pretoria", status: "Available", currentKw: 0, type: "DC", firmware: "v2.0.1", ip: "10.0.0.55" },
    { id: "GC-MID-01", name: "Mall of Africa Waterfall", status: "Charging", currentKw: 38.5, type: "DC", firmware: "v1.9.8", ip: "172.16.0.4" },
    { id: "GC-JHB-03", name: "Melrose Arch - Bay 1", status: "Charging", currentKw: 11.0, type: "AC", firmware: "v3.1.0", ip: "192.168.2.22" },
    { id: "GC-JHB-04", name: "Melrose Arch - Bay 2", status: "Available", currentKw: 0, type: "AC", firmware: "v3.1.0", ip: "192.168.2.23" },
    { id: "GC-EKU-01", name: "OR Tambo Int. Airport", status: "Charging", currentKw: 52.4, type: "DC", firmware: "v2.1.5", ip: "10.1.1.100" },
    { id: "GC-EKU-02", name: "East Rand Mall Boksburg", status: "Available", currentKw: 0, type: "AC", firmware: "v1.0.0", ip: "192.168.5.15" },
    { id: "GC-EKU-03", name: "Springs Mall AC", status: "Available", currentKw: 0, type: "AC", firmware: "v1.0.0", ip: "192.168.5.16" },
    { id: "GC-JHB-05", name: "Fourways Mall", status: "Charging", currentKw: 7.2, type: "AC", firmware: "v2.0.0", ip: "172.16.1.50" },
    { id: "GC-PTA-02", name: "Irene Link Centurion", status: "Available", currentKw: 0, type: "DC", firmware: "v2.0.1", ip: "10.0.0.88" }
];

wss.on('connection', function connection(ws, req) {
    console.log(`[CONNECTED] Dashboard Client connected.`);
    ws.send(JSON.stringify({ type: "INITIAL_STATE", data: chargers }));

    ws.on('message', function incoming(message) {
        try {
            const data = JSON.parse(message);
            if (data.action === "Authorize") {
                const tag = data.idTag;
                const user = registeredUsers[tag];
                const isAccepted = user && user.balance > 0;
                ws.send(JSON.stringify({
                    action: "AuthorizeResponse", status: isAccepted ? "Accepted" : "Blocked",
                    user: isAccepted ? user.name : null, balance: isAccepted ? `R${user.balance.toFixed(2)}` : "R0.00"
                }));
            }
        } catch (err) {}
    });
});

setInterval(() => {
    chargers = chargers.map(ch => {
        if (ch.status === "Charging") {
            if (ch.type === "DC") {
                ch.currentKw = +(40 + Math.random() * 15).toFixed(1); 
            } else {
                ch.currentKw = +(6 + Math.random() * 5).toFixed(1); 
            }
        }
        return ch;
    });

    const broadcastPayload = JSON.stringify({ type: "TELEMETRY_UPDATE", data: chargers });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(broadcastPayload);
        }
    });
}, 3000);

// Use dynamic cloud port or local 8080
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`[SERVER] CSMS Web and WebSocket server running on port ${PORT}`);
});