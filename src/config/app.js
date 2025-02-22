const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1000mb" })); // ✅ Parse JSON body with increased limit
app.use(express.urlencoded({ extended: true, limit: "1000mb" })); // ✅ Parse URL-encoded body with increased limit

module.exports = app;
