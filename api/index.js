import { handleGameRequest } from './logic.js';

export default async function handler(req, res) {
  try {
    await handleGameRequest(req, res);
  } catch (error) {
    console.error('API error:', error);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: true, message: 'حدث خطأ داخلي في خادم اللعبة.' }));
    }
  }
}
