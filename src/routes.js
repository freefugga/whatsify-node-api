const express = require("express");
const router = express.Router();

const { getQRorStatus, disconnect } = require("./controllers/connection");
const { sendMessage } = require("./controllers/messages");
const { checkNumber } = require("./controllers/chats");

// Middleware to forward requests to the connection
const forwardToConnection = (req, res, next) => {
  if (!req.headers.authorization) {
    return res
      .status(400)
      .json({ success: false, message: "Secret is required" });
  }

  if (req.headers.authorization !== process.env.LARAVEL_API_SECRET) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
};

// Connection Routes
router.post("/connection/connect", forwardToConnection, getQRorStatus);
router.post("/connection/disconnect", forwardToConnection, disconnect);

// Message Routes
router.post("/messages/send", forwardToConnection, sendMessage);

// Chat Routes
router.post("/chats/check-number", forwardToConnection, checkNumber);

module.exports = router;
