const axios = require('axios');

async function test() {
    const payload = {
        apikey: "d63053e5066920d85c08ce2bae2e3b2c",
        api_key: "d63053e5066920d85c08ce2bae2e3b2c",
        sender: "8809617621855",
        senderid: "8809617621855",
        messages: [
            {
                id: 1,
                msisdn: "8801825334505",
                contacts: "8801825334505",
                smstext: "Test SMS message content from Antigravity",
                msg: "Test SMS message content from Antigravity"
            }
        ]
    };

    console.log("Sending multi-compatible payload to Automas...");

    try {
        const res = await axios.post('https://api.automas.com.bd/smsapimany', payload);
        console.log("Response Success Status:", res.status);
        console.log("Response Data:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Response Error Message:", err.message);
        if (err.response) {
            console.error("Response Error Status:", err.response.status);
            console.error("Response Error Data:", JSON.stringify(err.response.data, null, 2));
        }
    }
}

test();
