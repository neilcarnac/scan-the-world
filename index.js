// bluetooth-scanner.js
import express from "express";
import noble from "@abandonware/noble";
import axios from "axios";

import { exec } from "child_process";
import multer from "multer";

const upload = multer({ dest: "uploads/" });
const app = express();
const port = 3000;

let nearbyDevices = [];
app.use(express.json()); // for POST body

app.post("/send-image-bluetooth", upload.single("image"), (req, res) => {
  const { address } = req.body;
  const imagePath = req.file?.path;

  if (!address || !imagePath) {
    return res.status(400).json({ error: "Missing address or image file" });
  }

  const command = `bluetooth-sendto --device=${address} ${imagePath}`;
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error("Send failed:", stderr);
      return res
        .status(500)
        .json({ error: "Failed to send image via Bluetooth" });
    }

    res.json({ status: "Image sent", stdout });
  });
});

noble.on("discover", (peripheral) => {
  const { id, advertisement, rssi } = peripheral;
  console.log("advertise: ", advertisement);

  // Extract raw manufacturerData
  const manufacturerData = advertisement.manufacturerData || null;

  // Try to derive a MAC-like string from the last 6 bytes of manufacturerData
  let maybeMac = null;
  if (manufacturerData && manufacturerData.length >= 6) {
    const hex = manufacturerData.toString("hex");
    maybeMac = hex
      .slice(-12)
      .match(/.{1,2}/g)
      .join(":");
  }

  const device = {
    id,

    name: advertisement.localName || "Unknown",
    rssi,
    connectable: peripheral.connectable,
    serviceUuids: advertisement.serviceUuids,
    manufacturerData: manufacturerData?.toString("hex") || null,
    MostlyTheMacAddress: maybeMac, // <-- added field
  };

  if (!nearbyDevices.some((d) => d.id === id)) {
    nearbyDevices.push(device);
    console.log("Found Bluetooth device:", device);
  }
});

app.get("/scan-bluetooth", async (req, res) => {
  nearbyDevices = []; // Clear old devices

  try {
    if (noble.state === "poweredOn") {
      noble.startScanning([], true); // [] = all services, true = allow duplicates
      setTimeout(() => {
        noble.stopScanning();
        res.json({ devices: nearbyDevices });
      }, 5000); // Scan for 5 seconds
    } else {
      res.status(500).json({ error: "Bluetooth not powered on" });
    }
  } catch (error) {
    console.error("Scan error:", error);
    res.status(500).json({ error: "Bluetooth scan failed" });
  }
});

app.get("/lookup-mac", async (req, res) => {
  const mac = req.query.v;

  // Validate MAC address
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  if (!mac || !macRegex.test(mac)) {
    return res.status(400).json({ error: "Invalid or missing MAC address" });
  }

  try {
    const vendorRes = await axios.get(`https://api.macvendors.com/${mac}`);

    // Print full response object
    console.log("Full vendorRes object:", vendorRes);

    // Return full Axios response (selected parts only to avoid circular JSON issues)
    res.json({
      mac,
      status: vendorRes.status,
      statusText: vendorRes.statusText,
      headers: vendorRes.headers,
      data: vendorRes.data,
    });
  } catch (error) {
    console.error("Vendor lookup failed:", error.message);
    res.status(500).json({ error: "MAC vendor lookup failed" });
  }
});

app.post("/connect-bluetooth", async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ error: "Missing device ID" });

  try {
    const peripheral = noble._peripherals[id];
    if (!peripheral) return res.status(404).json({ error: "Device not found" });

    await peripheral.connectAsync();
    console.log(`Connected to ${id}`);
    res.json({ status: "connected", id });
  } catch (err) {
    console.error("Connection failed:", err.message);
    res.status(500).json({ error: "Bluetooth connection failed" });
  }
});

noble.on("stateChange", (state) => {
  console.log("Bluetooth state:", state);
});

app.listen(port, () => {
  console.log(`Bluetooth scanner API running at http://localhost:${port}`);
});
