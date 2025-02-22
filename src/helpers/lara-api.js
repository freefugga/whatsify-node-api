const axios = require("axios");

// Function to notify Laravel backend about connection status (connected/disconnected)
const sendDataToApp = async (uuid, data) => {
  try {
    console.log(data);
    const response = await axios.patch(
      process.env.LARAVEL_HOST + "/api/update/wa.data",
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
    console.error(
      `Error sending data to Laravel for UUID: ${uuid}: ${error.response.data.message}`
    );
  }
};

module.exports = { sendDataToApp };
