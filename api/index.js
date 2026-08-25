// api/game.js
import OpenAI from 'openai'; // أو OpenRouter API Client حسب إعداداتك

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
});

const BASE_CARDS = [
  { id: 'c1', name: 'شهادة شهود', cost: 1, desc: 'تتيح لك كشف تلميح إضافي.' },
  { id: 'c2', name: 'دفتر التحقيق', cost: 2, desc: 'تتيح لك إعادة توجيه السؤال.' },
  { id: 'c3', name: 'دليل قاطع', cost: 3, desc: 'تمنحك حصانة كاملة في هذه الجولة.' }
];

function normalizePlayers(players) {
  if (!Array.isArray(players)) return [];
  return players.map(p => ({
    ...p,
    reputation: Number(p.reputation) || 0
  }));
}

function idOf(id) {
  return String(id);
}

function getRandomCards(pool, count = 1) {
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { action } = body;

    if (action === 'buy_card') {
      const players = normalizePlayers(body.players);
      const buyer = players.find(p => idOf(p.id) === idOf(body.playerId));
      const cardCost = Number(body.cost) || 1;
      
      if (!buyer || buyer.reputation < cardCost) {
        return json(res, 400, { 
          error: 'INSUFFICIENT_REPUTATION', 
          message: `رصيد السمعة لا يكفي لشراء هذه البطاقة (تتطلب ${cardCost} نقطة).` 
        });
      }

      // خصم النقاط
      buyer.reputation -= cardCost;

      let pool = BASE_CARDS.filter(c => (c.cost || 1) === cardCost);
      if (!pool.length) pool = BASE_CARDS;
      const boughtCard = getRandomCards(pool, 1)[0];

      return json(res, 200, { players, boughtCard });
    }

    // يمكنك إضافة باقي أفعال اللعبة هنا (مثل أحداث المحكمة، الذكاء الاصطناعي، إلخ)
    return json(res, 400, { error: 'UNKNOWN_ACTION', message: 'الإجراء المطلوب غير معروف.' });

  } catch (error) {
    console.error('API Error:', error);
    return json(res, 500, { error: 'SERVER_ERROR', message: error.message });
  }
}
