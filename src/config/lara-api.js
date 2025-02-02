const axios = require("axios");

// Function to notify Laravel backend about connection status (connected/disconnected)
const sendDataToApp = async (uuid, data) => {
  try {
    console.log(data);
    const response = await axios.post(
      process.env.LARAVEL_HOST + "/api/wa-server/data/update",
      {
        secret: process.env.LARAVEL_API_SECRET,
        uuid: uuid,
        data: data,
      }
    );

    if (response.status === 200) {
      console.log(`Successfully sent data to Laravel for UUID: ${uuid}`);
    } else {
      console.error(`Failed to send data to Laravel for UUID: ${uuid}`);
    }
  } catch (error) {
    console.error(`Error sending data to Laravel for UUID: ${uuid}: ${error}`);
  }
};

module.exports = { sendDataToApp };
