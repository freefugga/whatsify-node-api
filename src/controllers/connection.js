// src/controllers/connection.js
const { getConnection, qrCodes, sessions } = require("../config/baileys");
const qrcode = require("qrcode");

const getQRorStatus = async (req, res) => {
  try {
    const { account } = req.body;
    if (!account) {
      return res.status(400).json({ error: "Account UUID required" });
    }

    // Ensure a single response is sent
    let responded = false;

    // Use callback to handle the response only after the QR is generated or connection is established
    getConnection(account, async (error, qrCode) => {
      if (responded) return; // Avoid sending multiple responses

      if (error) {
        responded = true; // Mark as responded
        return res.status(500).json({ error: error.message });
      }

      // If connection is established, return the connected status
      if (qrCode === null && sessions[account]) {
        responded = true; // Mark as responded
        return res.json({ status: "connected" });
      }

      // If QR code is generated, return it as a Data URL
      if (qrCode) {
        const qrString = await qrcode.toDataURL(qrCode); // Convert QR code to a Data URL (image)
        responded = true; // Mark as responded
        return res.json({ status: "scan_required", qr: qrString });
      }

      // If no QR code and not connected, something went wrong
      if (!responded) {
        responded = true; // Mark as responded
        return res.status(500).json({ error: "QR code not available, try again." });
      }
    });
  } catch (error) {
    if (!responded) {
      return res.status(500).json({ error: error.message });
    }
  }
};

const disconnect = async (req, res) => {
  try {
    const { account } = req.body;
    if (!account)
      return res.status(400).json({ error: "Account UUID required" });

    if (sessions[account]) {
      await sessions[account].logout(); // Properly log out
      delete sessions[account];
      delete qrCodes[account];
      return res.json({ message: "Disconnected successfully" });
    }

    res.status(400).json({ error: "Session not found" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getQRorStatus, disconnect };
