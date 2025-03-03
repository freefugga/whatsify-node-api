const express = require("express");
const cors = require("cors");

const app = express();
try {
  app.use(cors());
  app.use(express.json({ limit: "1000mb" })); // ✅ Parse JSON body with increased limit
  app.use(express.urlencoded({ extended: true, limit: "1000mb" })); // ✅ Parse URL-encoded body with increased limit
} catch (error) {
  console.log("Error at app: " + error.message);
  return res
    .status(500)
    .json({ success: false, message: "Internal Server Error At App" });
}

module.exports = app;
