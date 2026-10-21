const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// Route root URL ('/') to serve login.html first
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Serve static files (login.html, signup.html, index.html, driver.html)
app.use(express.static(path.join(__dirname), { index: false }));

const accounts = [
    { fullName: "Site Administrator", email: "admin@chargetrack.co.za", password: "admin123", role: "Operator Level 3", rfidTag: "RFID_TAG_9921" }
];

app.post('/api/register', (req, res) => {
    const { fullName, email, role, rfidTag, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const cleanEmail = email.trim().toLowerCase();
    if (accounts.some(acc => acc.email === cleanEmail)) {
        return res.status(409).json({ error: "Account already exists" });
    }
    const newAccount = { fullName, email: cleanEmail, role, rfidTag, password };
    accounts.push(newAccount);
    res.status(201).json({ message: "Account created", user: { fullName, email: cleanEmail, role, rfidTag } });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const cleanEmail = (email || "").trim().toLowerCase();
    const user = accounts.find(acc => acc.email === cleanEmail && acc.password === password);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    res.json({ user: { fullName: user.fullName, email: user.email, role: user.role, rfidTag: user.rfidTag } });
});

const registeredUsers = {
    "RFID_TAG_9921": { name: "EV Driver 1", balance: 500.00 },
    "RFID_TAG_4402": { name: "EV Driver 2", balance: 0.00 }
};

let chargers = [
    { id: "GC-JHB-01", name: "Sandton City Hub - Bay 1", status: "Charging", currentKw: 45.2, type: "DC", firmware: "v1.4.2", ip: "192.168.1.10" },
    { id: "GC-JHB-02", name: "Sandton City Hub - Bay 2", status: "Available", currentKw: 0, type: "DC", firmware: "v1.4.2", ip: "192.168.1.11" },
    { id: "GC-PTA-01", name: "Menlyn Mall Pretoria", status: "Available", currentKw: 0, type: "DC", firmware: "v2.0.1", ip: "10.0.0.55" },
    { id: "GC-MID-01", name: "Mall of Africa Waterfall", status: "Available", currentKw: 0, type: "DC", firmware: "v1.9.8", ip: "172.16.0.4" },
    { id: "GC-JHB-03", name: "Melrose Arch - Bay 1", status: "Charging", currentKw: 11.0, type: "AC", firmware: "v3.1.0", ip: "192.168.2.22" },
    { id: "GC-JHB-04", name: "Melrose Arch - Bay 2", status: "Available", currentKw: 0, type: "AC", firmware: "v3.1.0", ip: "192.168.2.23" },
    { id: "GC-EKU-01", name: "OR Tambo Int. Airport", status: "Charging", currentKw: 52.4, type: "DC", firmware: "v2.1.5", ip: "10.1.1.100" },
    { id: "GC-EKU-02", name: "East Rand Mall Boksburg", status: "Available", currentKw: 0, type: "AC", firmware: "v1.0.0", ip: "192.168.5.15" },
    { id: "GC-EKU-03", name: "Springs Mall AC", status: "Available", currentKw: 0, type: "AC", firmware: "v1.0.0", ip: "192.168.5.16" },
    { id: "GC-JHB-05", name: "Fourways Mall", status: "Charging", currentKw: 7.2, type: "AC", firmware: "v2.0.0", ip: "172.16.1.50" },
    { id: "GC-PTA-02", name: "Irene Link Centurion", status: "Available", currentKw: 0, type: "DC", firmware: "v2.0.1", ip: "10.0.0.88" }
    { id: "GC-RBK-01", name: "Rosebank Mall BMW", status: "Available", currentKw: 0, type: "AC", firmware: "v3.1.2", ip: "10.0.2.14" },
      { id: "GC-GRN-01", name: "Village Greenside AC", status: "Available", currentKw: 0, type: "AC", firmware: "v3.1.2", ip: "10.0.2.15" }
];

function broadcastFleetState() {
    const payload = JSON.stringify({ type: "TELEMETRY_UPDATE", data: chargers });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

wss.on('connection', function connection(ws, req) {
    console.log(`[CONNECTED] Client connected.`);
    ws.send(JSON.stringify({ type: "INITIAL_STATE", data: chargers }));

    ws.on('message', function incoming(message) {
        try {
            const data = JSON.parse(message);

            // 1. Handle OCPP RFID Authorization
            if (data.action === "Authorize") {
                const tag = data.idTag;
                const user = registeredUsers[tag];
                const isAccepted = user && user.balance > 0;
                ws.send(JSON.stringify({
                    action: "AuthorizeResponse",
                    status: isAccepted ? "Accepted" : "Blocked",
                    user: isAccepted ? user.name : null,
                    balance: isAccepted ? `R${user.balance.toFixed(2)}` : "R0.00"
                }));
            }

            // 2. Handle Live Charging Start from EV Driver Mobile App (driver.html)
            if (data.action === "RemoteStartTransaction") {
                chargers = chargers.map(ch => {
                    if (ch.id === data.chargerId) {
                        ch.status = "Charging";
                        ch.currentKw = data.kwDraw || (ch.type === "DC" ? 38.5 : 7.2);
                    }
                    return ch;
                });
                console.log(`[OCPP START] Charger ${data.chargerId} initiated by ${data.idTag}`);
                broadcastFleetState();
            }

            // 3. Handle Live Charging Stop from EV Driver Mobile App (driver.html)
            if (data.action === "RemoteStopTransaction") {
                chargers = chargers.map(ch => {
                    if (ch.id === data.chargerId) {
                        ch.status = "Available";
                        ch.currentKw = 0;
                    }
                    return ch;
                });
                console.log(`[OCPP STOP] Charger ${data.chargerId} stopped. CDR: ${data.cdrId}`);
                broadcastFleetState();
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
    broadcastFleetState();
}, 3000);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`[SERVER] CSMS Web and WebSocket server running on port ${PORT}`);
});