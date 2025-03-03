const express = require("express");
const router = express.Router();

const { getQr, getStatus, disconnect } = require("./controllers/connection");
const { sendMessage, downloadFile } = require("./controllers/messages");
const {
  checkNumber,
  markRead,
  updatePresence,
} = require("./controllers/chats");

// Middleware to forward requests to the connection
const forwardToConnection = (req, res, next) => {
  try {
    if (!req.headers.authorization) {
      return res
        .status(400)
        .json({ success: false, message: "Secret is required" });
    }

    if (req.headers.authorization !== process.env.LARAVEL_API_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    next();
  } catch (error) {
    console.log("Error at router: " + error.message);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error At Router" });
  }
};

// Connection Routes
router.post("/connection/check", forwardToConnection, getStatus);
router.post("/connection/connect", forwardToConnection, getQr);
router.post("/connection/disconnect", forwardToConnection, disconnect);

// Message Routes
router.post("/messages/send", forwardToConnection, sendMessage);
router.post("/messages/download-file", forwardToConnection, downloadFile);

// Chat Routes
router.post("/chats/check-number", forwardToConnection, checkNumber);
router.post("/chats/read-message", forwardToConnection, markRead);
router.post("/chats/update-presence", forwardToConnection, updatePresence);

module.exports = router;
