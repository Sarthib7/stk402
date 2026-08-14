import { generateServerEnvelopeKey } from "./private-envelope.js";

const server = generateServerEnvelopeKey();
const client = generateServerEnvelopeKey();

process.stdout.write(`Server environment:\n\
STK402_ENVELOPE_PRIVATE_KEY=${server.privateKeyValue}\n\
STK402_ENVELOPE_PUBLIC_KEY=${server.publicKeyValue}\n\
STK402_AUTHORIZED_CLIENT_ENVELOPE_PUBLIC_KEY=${client.publicKeyValue}\n\n\
Payer environment:\n\
STK402_ENVELOPE_PUBLIC_KEY=${server.publicKeyValue}\n\
STK402_CLIENT_ENVELOPE_PRIVATE_KEY=${client.privateKeyValue}\n\
STK402_CLIENT_ENVELOPE_PUBLIC_KEY=${client.publicKeyValue}\n`);
