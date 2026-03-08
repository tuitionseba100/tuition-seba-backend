const dns = require('node:dns');
const { promisify } = require('node:util');

const resolveSrv = promisify(dns.resolveSrv);

const hostname = '_mongodb._tcp.tuitionsebaforum.vnja1.mongodb.net';

async function test() {
    try {
        console.log(`Resolving SRV for ${hostname}...`);
        const addresses = await resolveSrv(hostname);
        console.log('SRV Addresses found:', JSON.stringify(addresses, null, 2));
    } catch (err) {
        console.error('DNS Resolution Error:', err);
    }
}

test();
