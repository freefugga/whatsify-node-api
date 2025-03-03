const axios = require("axios");
const FormData = require("form-data");
const dotenv = require("dotenv");
const fs = require("fs");
dotenv.config();

const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID || "your-client-id";

async function uploadMediaToImgur(mediaPath) {
  try {
    if (!fs.existsSync(mediaPath)) {
      throw new Error("File does not exist at the specified path");
    }

    const fileContent = fs.readFileSync(mediaPath, { encoding: "base64" });

    const form = new FormData();
    form.append("image", fileContent);
    form.append("type", "base64");
    form.append("title", new Date().toTimeString());
    form.append("description", "desc-" + new Date().toTimeString());

    const response = await axios.post("https://api.imgur.com/3/image", form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Client-ID ${IMGUR_CLIENT_ID}`,
      },
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error("Error response from Imgur:", error.response.data);
    } else {
      console.error("Error uploading media to Imgur:", error.message);
    }
    // throw error;
  }
}

module.exports = { uploadMediaToImgur };
