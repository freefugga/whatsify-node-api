// src/controllers/connection.js
const { unixTimestampSeconds } = require("baileys");
const { getConnection, qrCodes, sessions } = require("../config/baileys");
const qrcode = require("qrcode");

const getQr = async (req, res) => {
  try {
    const { account } = req.body;
    if (!account) {
      return res
        .status(400)
        .json({ success: false, message: "Account ID required" });
    }

    // Ensure a single response is sent
    let responded = false;

    // Use callback to handle the response only after the QR is generated or connection is established
    getConnection(account, async (error, qrCode) => {
      if (responded) return; // Avoid sending multiple responses

      if (error) {
        responded = true; // Mark as responded
        return res.status(500).json({ success: false, message: error.message });
      }

      // If connection is established, return the connected status
      if (qrCode === null && sessions[account]) {
        responded = true; // Mark as responded
        return res.json({ success: true, message: "connected" });
      }

      // If QR code is generated, return it as a Data URL
      if (qrCode) {
        const qrString = await qrcode.toDataURL(qrCode); // Convert QR code to a Data URL (image)
        responded = true; // Mark as responded
        return res.json({
          success: true,
          status: "scan_required",
          qr: qrString,
          message: "Scan the QR code to connect",
        });
      }

      // If no QR code and not connected, something went wrong
      if (!responded) {
        responded = true; // Mark as responded
        return res.status(500).json({
          success: false,
          message: "QR code not available, try again.",
        });
      }
    });
  } catch (error) {
    if (!responded) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
};

const getStatus = (req, res) => {
  if (sessions[req.body.account]) {
    return res.json({
      success: true,
      message: "connected",
      status: true,
      phone: sessions[req.body.account].sock.user.id
        .split(":")[0]
        .replace("@s.whatsapp.net", ""),
      timestamp: unixTimestampSeconds(),
    });
  } else {
    return res.json({
      success: true,
      message: "disconnected",
      status: false,
      timestamp: unixTimestampSeconds(),
    });
  }
};

const disconnect = async (req, res) => {
  try {
    const { account } = req.body;
    if (!account)
      return res
        .status(400)
        .json({ success: false, message: "Account UUID required" });

    const session = await getConnection(account, null);
    if (session.sock) {
      session.sock.logout();
      delete sessions[account];
      return res.json({ success: true, message: "Disconnected" });
    }

    return res
      .status(400)
      .json({ success: false, message: "Session not found" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getQr, disconnect, getStatus };
