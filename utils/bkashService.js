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

const isV1 = () => {
    const url = getBaseUrl().toLowerCase();
    return url.includes('v1.2.0-beta') || url.includes('/v1');
};

const getEndpoints = () => {
    const base = getBaseUrl().replace(/\/+$/, '');
    if (isV1()) {
        return {
            grantToken: `${base}/tokenized/checkout/token/grant`,
            refreshToken: `${base}/tokenized/checkout/token/refresh`,
            createPayment: `${base}/tokenized/checkout/create`,
            executePayment: `${base}/tokenized/checkout/execute`,
            queryPayment: `${base}/tokenized/checkout/payment/query`,
            queryPaymentGet: (id) => `${base}/tokenized/checkout/payment/query/${id}`,
            searchTransaction: `${base}/tokenized/checkout/general/searchTran`
        };
    }
    return {
        grantToken: `${base}/tokenized-checkout/auth/grant-token`,
        refreshToken: `${base}/tokenized-checkout/auth/refresh-token`,
        createPayment: `${base}/tokenized-checkout/payment/create`,
        executePayment: `${base}/tokenized-checkout/payment/execute`,
        queryPayment: `${base}/tokenized-checkout/query/payment`,
        queryPaymentGet: (id) => `${base}/tokenized-checkout/query/payment/${id}`,
        searchTransaction: `${base}/tokenized-checkout/general/search-transaction`
    };
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

        const endpoints = getEndpoints();
        const response = await axios.post(
            endpoints.grantToken,
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
        const endpoints = getEndpoints();
        const response = await axios.post(
            endpoints.refreshToken,
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
 */
const createPayment = async ({ amount, merchantInvoiceNumber, payerReference, callbackURL }) => {
    const headers = await getPaymentHeaders();
    const payload = {
        mode: '0011',
        payerReference: payerReference || 'TSF',
        callbackURL: callbackURL || process.env.BKASH_CALLBACK_URL,
        amount: Number(amount).toFixed(2),
        currency: 'BDT',
        intent: 'sale',
        merchantInvoiceNumber: merchantInvoiceNumber
    };

    console.log(`[bKash] Creating payment: Invoice ${merchantInvoiceNumber}, Amount ${payload.amount}`);

    const endpoints = getEndpoints();
    const response = await axios.post(
        endpoints.createPayment,
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
 */
const executePayment = async (paymentId) => {
    const headers = await getPaymentHeaders();
    console.log(`[bKash] Executing payment: ${paymentId}`);

    const endpoints = getEndpoints();
    const response = await axios.post(
        endpoints.executePayment,
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
 */
const queryPayment = async (paymentId) => {
    const headers = await getPaymentHeaders();
    console.log(`[bKash] Querying payment status: ${paymentId}`);

    const endpoints = getEndpoints();
    try {
        // First try POST with body
        const response = await axios.post(
            endpoints.queryPayment,
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
    } catch (postErr) {
        // If POST fails with 404/405 or method not allowed, try GET /payment/query/:paymentId
        if (endpoints.queryPaymentGet && postErr.response && (postErr.response.status === 404 || postErr.response.status === 405)) {
            console.log(`[bKash] Querying payment via GET fallback: ${paymentId}`);
            const getResponse = await axios.get(
                endpoints.queryPaymentGet(paymentId),
                {
                    headers,
                    timeout: 30000
                }
            );
            return getResponse.data;
        }
        throw postErr;
    }
};

/**
 * Search Transaction by trxID / trxId
 */
const searchTransaction = async (trxId) => {
    const headers = await getPaymentHeaders();
    console.log(`[bKash] Searching transaction: ${trxId}`);

    const endpoints = getEndpoints();
    try {
        const response = await axios.post(
            endpoints.searchTransaction,
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
    } catch (searchErr) {
        // Fallback for v1 endpoints if searchTran vs searchTransaction differs
        if (searchErr.response && searchErr.response.status === 404) {
            const altEndpoint = endpoints.searchTransaction.includes('searchTran') 
                ? endpoints.searchTransaction.replace('searchTran', 'searchTransaction')
                : endpoints.searchTransaction.replace('search-transaction', 'searchTran');
            console.log(`[bKash] Searching transaction via alt endpoint: ${altEndpoint}`);
            const altResponse = await axios.post(
                altEndpoint,
                { trxId: trxId, trxID: trxId },
                { headers, timeout: 30000 }
            );
            return altResponse.data;
        }
        throw searchErr;
    }
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
