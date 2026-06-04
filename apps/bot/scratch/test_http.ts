import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';

// Helper function equivalent to readJsonBody in shared.ts
const readJsonBody = async <T>(req: IncomingMessage): Promise<T | null> => {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      console.log('Received chunk:', chunk.toString());
      chunks.push(chunk);
    });
    req.on('end', () => {
      console.log('Stream ended');
      const buffer = Buffer.concat(chunks);
      const text = buffer.toString('utf-8').trim();
      if (!text) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text) as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', (err) => reject(err));
  });
};

async function testCurrentImplementation() {
  console.log('--- Testing current implementation ---');
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  
  // Simulate request.body.getReader() async stream pushing
  void (async () => {
    await new Promise(r => setTimeout(r, 10));
    console.log('Pushing value');
    req.push(Buffer.from('{"hello": "world"}'));
    await new Promise(r => setTimeout(r, 10));
    console.log('Pushing null (end)');
    req.push(null);
  })();

  // Simulate route matching delay
  await new Promise(r => setTimeout(r, 100));
  
  try {
    const body = await readJsonBody(req);
    console.log('Result body:', body);
  } catch (err) {
    console.error('Error reading body:', err);
  }
}

async function testProposedImplementation() {
  console.log('--- Testing proposed implementation ---');
  const socket = new Socket();
  const req = new IncomingMessage(socket);

  const bodyText = '{"hello": "proposed"}';

  // push deferred
  process.nextTick(() => {
    console.log('Pushing value');
    req.push(Buffer.from(bodyText, 'utf8'));
    console.log('Pushing null (end)');
    req.push(null);
  });

  // Simulate route matching delay
  await new Promise(r => setTimeout(r, 100));

  try {
    const body = await readJsonBody(req);
    console.log('Result body:', body);
  } catch (err) {
    console.error('Error reading body:', err);
  }
}

async function main() {
  await testCurrentImplementation();
  await testProposedImplementation();
}

main().catch(console.error);
