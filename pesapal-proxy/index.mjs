import express from "express";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import moment from "moment/moment.js";

dotenv.config();

const app = express();

//yor api keys as sent to your  email by pesapal upon registration
const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
const callbackUrl = process.env.PESAPAL_CALLBACK_URL;

const allowedOrigins = [
  "http://localhost:5173",
  "https://pesapal-api-pi.vercel.app/",
  callbackUrl,
];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

let BEARER_TOKEN = "";

//get the access token
async function getAccessToken() {
  const authUrl = "https://pay.pesapal.com/v3/api/Auth/RequestToken";
  const payload = JSON.stringify({
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
  });

  console.log("Consumer Key:", consumerKey);
  console.log("Consumer Secret:", consumerSecret);

  const headers = {
    "content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    const response = await axios.post(authUrl, payload, { headers });
    BEARER_TOKEN = response.data.token;
    console.log("Access Token fetched successfully:", BEARER_TOKEN);
    return BEARER_TOKEN;
  } catch (error) {
    console.error(
      "Error fetching access token:",
      error.response ? error.response.data : error.message
    );
    throw error;
  }
}

// register the ipn and get the IPN_id
async function getIPN_id() {
  const accessToken = await getAccessToken();

  const ipnPayload = JSON.stringify({
    url: callbackUrl,
    ipn_notification_type: "GET",
  });

  const notificationUrl = "https://pay.pesapal.com/v3/api/URLSetup/RegisterIPN";

  const ipnResponse = await axios.post(notificationUrl, ipnPayload, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  if (ipnResponse.data.error) {
    throw new Error(
      `IPN Registration failed: ${ipnResponse.data.error.message}`
    );
  }

  const IPN_id = ipnResponse.data.ipn_id;
  console.log("IPN registered successfully with ID:", IPN_id);

  return IPN_id;
}

//submit order request function
app.post("/api/payment", async (req, res) => {
  try {
    const IPN_id = await getIPN_id();

    const { firstName, secondName, email, amount, phoneNumber } = req.body;

    const order = {
      id: moment().format("YYYYMMDDHHmmssSSS"),
      currency: "KES",
      amount: amount,
      description: "Payment description goes here",
      callback_url: callbackUrl,
      redirect_mode: "",
      notification_id: IPN_id,
      branch: "Developers swag",
      billing_address: {
        email_address: email,
        phone_number: phoneNumber,
        country_code: "KE",
        first_name: firstName,
        middle_name: "",
        last_name: secondName,
        line_1: "Pesapal Limited",
        line_2: "",
        city: "",
        state: "",
        postal_code: "",
        zip_code: "",
      },
    };

    const paymentUrl =
      "https://pay.pesapal.com/v3/api/Transactions/SubmitOrderRequest";

    const paymentResponse = await axios.post(paymentUrl, order, {
      headers: {
        Authorization: "Bearer " + BEARER_TOKEN,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (paymentResponse.data.error) {
      throw new Error(
        `Payment request failed: ${paymentResponse.data.error.message}`
      );
    }

    console.log("Redirect URL:", paymentResponse.data);
    res.json({
      redirect_url: paymentResponse.data.redirect_url,
    });
  } catch (error) {
    console.error(
      "Payment request failed:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Payment request failed" });
  }
});

//check transaction status and update the db and frontend accordingly
app.get("/api/pesapal/callback", async (req, res) => {
  try {
    const { OrderTrackingId, status } = req.query;

    console.log("GET Callback Data:", req.query);

    if (!OrderTrackingId) {
      return res.status(400).send("OrderTrackingId is required");
    }

    // Optionally, you could check the status and redirect immediately
    if (status === "Failed") {
      return res.redirect(`http://localhost:5173/failed/${OrderTrackingId}`);
    }

    const paymentStatusUrl = `https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus`;
    const headers = {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const response = await axios.get(paymentStatusUrl, {
      params: { orderTrackingId: OrderTrackingId },
      headers: headers,
    });

    const paymentStatus = response.data.payment_status_description;

    console.log("GET Payment Status:", paymentStatus);

    // Redirect user based on payment status
    switch (paymentStatus) {
      case "Completed":
        return res.redirect(`http://localhost:5173/success/${OrderTrackingId}`);
      case "Failed":
        return res.redirect(`http://localhost:5173/failed/${OrderTrackingId}`);
      case "Reversed":
        return res.redirect(
          `http://localhost:5173/reversed/${OrderTrackingId}`
        );
      case "Invalid":
        return res.redirect(`http://localhost:5173/invalid/${OrderTrackingId}`);
      default:
        return res.redirect(`http://localhost:5173`);
    }
  } catch (error) {
    console.error("Error in GET callback:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

app.post("/api/pesapal/callback", async (req, res) => {
  try {
    const { OrderTrackingId, status } = req.body;

    console.log("POST Callback Data:", req.body);

    if (!OrderTrackingId) {
      return res.status(400).send("OrderTrackingId is required");
    }

    if (status === "Failed") {
      return res.redirect(`http://localhost:5173/failed/${OrderTrackingId}`);
    }

    const paymentStatusUrl = `https://pay.pesapal.com/v3/api/Transactions/GetTransactionStatus`;
    const headers = {
      Authorization: `Bearer ${BEARER_TOKEN}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    const response = await axios.get(paymentStatusUrl, {
      params: { orderTrackingId: OrderTrackingId },
      headers: headers,
    });

    const paymentStatus = response.data.payment_status_description;

    console.log("POST Payment Status:", paymentStatus);

    // Redirect user based on payment status
    switch (paymentStatus) {
      case "Completed":
        return res.redirect(`http://localhost:5173/success/${OrderTrackingId}`);
      case "Failed":
        return res.redirect(`http://localhost:5173/failed/${OrderTrackingId}`);
      case "Reversed":
        return res.redirect(
          `http://localhost:5173/reversed/${OrderTrackingId}`
        );
      case "Invalid":
        return res.redirect(`http://localhost:5173/invalid/${OrderTrackingId}`);
      default:
        return res.redirect(`http://localhost:5173`);
    }
  } catch (error) {
    console.error("Error in POST callback:", error.message);
    return res.status(500).send("Internal Server Error");
  }
});

//default route testing purposes
app.use("/", (req, res) => {
  res.send("Server is running");
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
