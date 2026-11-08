const axios = require('axios');

// Token cache in memory to prevent exceeding bKash's strict 2 calls/hour limit on grant-token
let tokenCache = {
    id_token: null,
    refresh_token: null,
    expires_at: 0,
    grantCallsInWindow: 0,
    windowStartTime: 0
};

const getBaseUrl = () => {
    return process.env.BKASH_BASE_URL || 'https://tokenized.sandbox.bka.sh/v2';
};

const getAuthHeaders = () => {
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'username': process.env.BKASH_USERNAME,
        'password': process.env.BKASH_PASSWORD
    };
};

/**
 * Calls bKash Grant Token API
 * Note: bKash enforces a strict maximum of 2 calls per hour.
 */
const grantToken = async () => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;

    // Reset window if more than 1 hour passed
    if (now - tokenCache.windowStartTime > oneHour) {
        tokenCache.windowStartTime = now;
        tokenCache.grantCallsInWindow = 0;
    }

    if (tokenCache.grantCallsInWindow >= 2) {
        const waitMinutes = Math.ceil((tokenCache.windowStartTime + oneHour - now) / 60000);
        throw new Error(`bKash hourly token grant limit reached (max 2/hr). Please wait ${waitMinutes} minute(s).`);
    }

    try {
        console.log('[bKash] Requesting new Grant Token...');
        tokenCache.grantCallsInWindow += 1;

        const response = await axios.post(
            `${getBaseUrl()}/tokenized-checkout/auth/grant-token`,
            {
                app_key: process.env.BKASH_APP_KEY,
                app_secret: process.env.BKASH_APP_SECRET
            },
            {
                headers: getAuthHeaders(),
                timeout: 30000
            }
        );

        const data = response.data;
        if (data && data.id_token) {
            tokenCache.id_token = data.id_token;
            tokenCache.refresh_token = data.refresh_token;
            // expires_in is in seconds (usually 3600)
            const expiresInMs = (parseInt(data.expires_in, 10) || 3600) * 1000;
            tokenCache.expires_at = now + expiresInMs;
            console.log('[bKash] Grant Token acquired successfully. Valid for', data.expires_in, 'seconds');
            return tokenCache.id_token;
        } else {
            console.error('[bKash] Grant Token failed response:', data);
            throw new Error(data.statusMessage || data.errorMessage || 'Failed to acquire bKash token');
        }
    } catch (err) {
        console.error('[bKash] Grant Token Error:', err.response?.data || err.message);
        throw err;
    }
};

/**
 * Calls bKash Refresh Token API using cached refresh_token
 */
const refreshToken = async () => {
    if (!tokenCache.refresh_token) {
        return grantToken();
    }

    try {
        console.log('[bKash] Refreshing Token with refresh_token...');
        const response = await axios.post(
            `${getBaseUrl()}/tokenized-checkout/auth/refresh-token`,
            {
                app_key: process.env.BKASH_APP_KEY,
                app_secret: process.env.BKASH_APP_SECRET,
                refresh_token: tokenCache.refresh_token
            },
            {
                headers: getAuthHeaders(),
                timeout: 30000
            }
        );

        const data = response.data;
        if (data && data.id_token) {
            const now = Date.now();
            tokenCache.id_token = data.id_token;
            tokenCache.refresh_token = data.refresh_token || tokenCache.refresh_token;
            const expiresInMs = (parseInt(data.expires_in, 10) || 3600) * 1000;
            tokenCache.expires_at = now + expiresInMs;
            console.log('[bKash] Token refreshed successfully.');
            return tokenCache.id_token;
        } else {
            console.warn('[bKash] Refresh token response unsuccessful, falling back to Grant Token:', data);
            return grantToken();
        }
    } catch (err) {
        console.warn('[bKash] Refresh token failed, falling back to Grant Token:', err.response?.data || err.message);
        return grantToken();
    }
};

/**
 * Returns a valid id_token (from memory cache or refreshed)
 */
const getToken = async () => {
    const now = Date.now();
    // Refresh 5 minutes before actual expiration (safety buffer)
    const fiveMinutes = 5 * 60 * 1000;

    if (tokenCache.id_token && (now < tokenCache.expires_at - fiveMinutes)) {
        return tokenCache.id_token;
    }

    if (tokenCache.refresh_token) {
        return refreshToken();
    }

    return grantToken();
};

/**
 * Headers required for all transactional APIs (create, execute, query, search)
 */
const getPaymentHeaders = async () => {
    const id_token = await getToken();
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': id_token,
        'X-App-Key': process.env.BKASH_APP_KEY
    };
};

/**
 * Create Payment (Without Agreement)
 * POST /tokenized-checkout/payment/create
 */
const createPayment = async ({ amount, merchantInvoiceNumber, payerReference, callbackURL }) => {
    const headers = await getPaymentHeaders();
    const payload = {
        payerReference: payerReference || '01000000000',
        callbackURL: callbackURL || process.env.BKASH_CALLBACK_URL,
        amount: Number(amount).toFixed(2),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: merchantInvoiceNumber
    };

    console.log(`[bKash] Creating payment: Invoice ${merchantInvoiceNumber}, Amount ${payload.amount}`);

    const response = await axios.post(
        `${getBaseUrl()}/tokenized-checkout/payment/create`,
        payload,
        {
            headers,
            timeout: 30000
        }
    );

    return response.data;
};

/**
 * Execute Payment
 * POST /tokenized-checkout/payment/execute
 */
const executePayment = async (paymentId) => {
    const headers = await getPaymentHeaders();
    console.log(`[bKash] Executing payment: ${paymentId}`);

    const response = await axios.post(
        `${getBaseUrl()}/tokenized-checkout/payment/execute`,
        { 
            paymentId: paymentId,
            paymentID: paymentId
        },
        {
            headers,
            timeout: 30000
        }
    );

    return response.data;
};

/**
 * Query Payment
 * POST /tokenized-checkout/query/payment
 */
const queryPayment = async (paymentId) => {
    const headers = await getPaymentHeaders();
    console.log(`[bKash] Querying payment status: ${paymentId}`);

    const response = await axios.post(
        `${getBaseUrl()}/tokenized-checkout/query/payment`,
        { 
            paymentId: paymentId,
            paymentID: paymentId
        },
        {
            headers,
            timeout: 30000
        }
    );

    return response.data;
};

/**
 * Search Transaction by trxID / trxId
 * POST /tokenized-checkout/general/search-transaction
 */
const searchTransaction = async (trxId) => {
    const headers = await getPaymentHeaders();
    console.log(`[bKash] Searching transaction: ${trxId}`);

    const response = await axios.post(
        `${getBaseUrl()}/tokenized-checkout/general/search-transaction`,
        { 
            trxId: trxId,
            trxID: trxId 
        },
        {
            headers,
            timeout: 30000
        }
    );

    return response.data;
};

module.exports = {
    getToken,
    grantToken,
    refreshToken,
    createPayment,
    executePayment,
    queryPayment,
    searchTransaction
};
