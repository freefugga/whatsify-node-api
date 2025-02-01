const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json()); // ✅ Parse JSON body
app.use(express.urlencoded({ extended: true })); // ✅ Parse URL-encoded body

module.exports = app;
