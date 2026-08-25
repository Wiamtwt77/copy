const MODEL = process.env.OPENROUTER_MODEL || 'z-ai/glm-4.6';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

const BASE_CARDS = [
  // بطاقات شائعة واقتصادية (تكلفة 1 سمعة)
  { baseId: 'c1', name: 'بطاقة سرقة خفيفة', description: 'تسلب 1 نقطة سمعة من الهدف وتحولها إليك.', effectType: 'STEAL', power: 1, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c2', name: 'بطاقة خصم بسيط', description: 'تخصم 1 نقطة سمعة من الهدف مباشرة.', effectType: 'ATTACK', power: 1, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c3', name: 'بطاقة تشويه سمعة', description: 'توجه الشكوك وتتسبب في اتهام الهدف داخل تقرير الدليل.', effectType: 'DEFAME', power: 0, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c7', name: 'بطاقة تحالف سري', description: 'تقاسم الأرباح والخسائر مناصفة (50%) لمدة 3 جولات.', effectType: 'ALLIANCE_OFFER', power: 0, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c8', name: 'بطاقة رسالة خاصة', description: 'تصل الرسالة إلى اللاعب المطلوب حصرياً ودون كشفك.', effectType: 'MESSAGE', power: 0, cost: 1, targetRequired: true, rarity: 'شائعة' },
  
  // بطاقات نادرة واستثنائية
  { baseId: 'c4', name: 'بطاقة كشف الأوراق', description: 'تكشف بطاقات لاعب آخر فوراً في أوانها.', effectType: 'REVEAL_CARDS', power: 0, cost: 3, targetRequired: true, rarity: 'نادرة' },
  { baseId: 'c5', name: 'بطاقة تبديل بطاقة', description: 'تستبدل هذه البطاقة ببطاقة عشوائية جديدة فوراً.', effectType: 'SWAP_CARD', power: 0, cost: 2, targetRequired: false, rarity: 'نادرة' },
  { baseId: 'c6', name: 'بطاقة كشف المهاجم', description: 'تكشف هوية اللاعب في الدليل فوراً إذا هاجمك.', effectType: 'REVEAL_ATTACKER', power: 0, cost: 3, targetRequired: false, rarity: 'نادرة' },
  { baseId: 'c9', name: 'بطاقة نفوذ مظلم (خطرة)', description: 'تمنحك 3 نقاط سمعة فوراً، لكنها قد تنقلب عليك.', effectType: 'RISKY_BOOST', power: 3, cost: 3, targetRequired: false, rarity: 'استثنائية' },
  { baseId: 'c10', name: 'بطاقة هجوم مدمر (عالي الخطورة)', description: 'تخصم 3 نقاط من الهدف، لكنها قد تنقلب بضعف الضرر عليك.', effectType: 'HEAVY_ATTACK', power: 3, cost: 4, targetRequired: true, rarity: 'استثنائية' }
];

const json = (res, code, value) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(code).json(value);
};

const active = p => p && Number(p.reputation) > 0;
const copy = value => JSON.parse(JSON.stringify(value ?? null));
const idOf = value => String(value ?? '');
const uniqueId = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function normalizePlayers(input) {
  return (Array.isArray(input) ? input : []).map((raw, index) => ({
    id: idOf(raw?.id || `player-${index + 1}`),
    name: String(raw?.name || `لاعب ${index + 1}`).slice(0, 40),
    reputation: Math.max(0, Math.min(100, Number(raw?.reputation) || 0)),
    allyId: raw?.allyId ? idOf(raw.allyId) : null,
    allyRoundsLeft: Math.max(0, Number(raw?.allyRoundsLeft) || 0)
  }));
}

function playerMap(players) { return new Map(players.map(p => [p.id, p])); }

function getRandomCards(pool, count) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(c => ({ ...c, id: uniqueId('card') }));
}

async function openRouter(prompt, maxTokens = 250) {
  const key = process.env.OPENROUTER_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(OPENROUTER, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Secret Court' },
      body: JSON.stringify({
        model: MODEL, temperature: 0.7, max_tokens: maxTokens,
        messages: [
          { 
            role: 'system', 
            content: 'أنت محقق ذكي وواقعي. اكتب تقريراً عادياً وواضحاً وبدون مبالغة أو تهويل، يصف الأحداث والاتصالات والأدلة في الجولة بشكل طبيعي. أعد JSON صالحاً فقط بلا Markdown.' 
          },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

function processAllianceShare(players, before) {
  const byId = playerMap(players);
  const processed = new Set();

  for (const p of players) {
    if (!p.allyId || processed.has(p.id)) continue;
    const ally = byId.get(p.allyId);
    if (!ally || ally.allyId !== p.id || !active(p) || !active(ally)) continue;

    processed.add(p.id); processed.add(ally.id);

    const pChange = p.reputation - before[p.id];
    const aChange = ally.reputation - before[ally.id];
    const totalChange = pChange + aChange;

    if (totalChange !== 0) {
      const share = Math.floor(totalChange / 2);
      p.reputation = Math.max(0, before[p.id] + share);
      ally.reputation = Math.max(0, before[ally.id] + (totalChange - share));
    }
  }
}

function triggerRandomEndRoundEvent(players, hands) {
  const activePlayers = players.filter(active);
  if (activePlayers.length === 0) return null;

  const eventTypes = ['REP_SWAP', 'DEDUCT_PLAYER', 'ADD_PLAYER', 'COMPENSATION', 'PENALTY'];
  const chosenType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const p1 = activePlayers[Math.floor(Math.random() * activePlayers.length)];
  const p2 = activePlayers[Math.floor(Math.random() * activePlayers.length)];

  let title = '', desc = '';
  switch (chosenType) {
    case 'REP_SWAP':
      title = 'تعديل السمعة';
      desc = `تم تعديل وموازنة السمعة بين ${p1.name} و${p2.name}.`;
      if (p1.id !== p2.id) { const temp = p1.reputation; p1.reputation = p2.reputation; p2.reputation = temp; }
      break;
    case 'DEDUCT_PLAYER':
      title = 'غرامة القصر';
      desc = `فرضت الإدارة غرامة خصم نقطة سمعة على ${p1.name}.`;
      p1.reputation = Math.max(0, p1.reputation - 1);
      break;
    case 'ADD_PLAYER':
      title = 'علاوة إدارية';
      desc = `منحت الإدارة مكافأة نقطة سمعة لـ ${p1.name}.`;
      p1.reputation += 1;
      break;
    case 'COMPENSATION':
      title = 'تعويض مالي';
      desc = `صُرف تعويض سمعة قدره (+1 نقطة) لصالح ${p1.name}.`;
      p1.reputation += 1;
      break;
    case 'PENALTY':
      title = 'مخالفة';
      desc = `تم تسجيل مخالفة بسيطة ضد ${p1.name}.`;
      p1.reputation = Math.max(0, p1.reputation - 1);
      break;
  }
  return { title, description: desc };
}

async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  const body = req.body || {};
  const action = body.action;

  if (action === 'generate_initial_cards') {
    return json(res, 200, { cards: getRandomCards(BASE_CARDS, 2) });
  }

  if (action === 'buy_card') {
    const players = normalizePlayers(body.players);
    const buyer = players.find(p => p.id === idOf(body.playerId));
    const cardCost = Number(body.cost) || 1;
    
    if (!buyer || buyer.reputation < cardCost) {
      return json(res, 400, { error: 'INSUFFICIENT_REPUTATION', message: `رصيد السمعة لا يكفي لشراء هذه البطاقة (تتطلب ${cardCost} نقطة).` });
    }
    buyer.reputation -= cardCost;
    let pool = BASE_CARDS.filter(c => (c.cost || 1) === cardCost);
    if (!pool.length) pool = BASE_CARDS;
    const boughtCard = getRandomCards(pool, 1)[0];
    return json(res, 200, { players, boughtCard });
  }

  if (action === 'instant_reveal_cards') {
    const hands = copy(body.hands) || {};
    const targetId = idOf(body.targetId);
    const targetCards = hands[targetId] || [];
    return json(res, 200, { targetCards });
  }

  if (action === 'instant_swap_card') {
    const hands = copy(body.hands) || {};
    const playerId = idOf(body.playerId);
    const cardId = idOf(body.cardId);
    let pHand = hands[playerId] || [];
    pHand = pHand.filter(c => c.id !== cardId);
    const newCard = getRandomCards(BASE_CARDS, 1)[0];
    pHand.push(newCard);
    hands[playerId] = pHand;
    return json(res, 200, { hands, newCard });
  }

  if (action === 'resolve_round') {
    const players = normalizePlayers(body.players);
    const byId = playerMap(players);
    const messages = copy(body.pendingMessages) || {};
    const hands = copy(body.hands) || {};
    const actions = Array.isArray(body.actions) ? body.actions : [];
    const before = Object.fromEntries(players.map(p => [p.id, p.reputation]));

    const defamedTargets = [];
    const crimes = [];
    const roundEventLogs = [];

    for (const act of actions) {
      const actor = byId.get(idOf(act.playerId));
      const card = act.generatedCard;
      const target = act.targetId ? byId.get(idOf(act.targetId)) : null;

      if (!active(actor) || !card) continue;
      if (card.targetRequired && (!target || target.id === actor.id || !active(target))) continue;

      switch (card.effectType) {
        case 'ATTACK':
        case 'HEAVY_ATTACK': {
          const power = card.power || 1;
          if (card.baseId === 'c10' && Math.random() < 0.3) {
            actor.reputation = Math.max(0, actor.reputation - power);
            roundEventLogs.push(`ارتداد هجوم ${actor.name} على نفسه.`);
            break;
          }
          target.reputation = Math.max(0, target.reputation - power);
          roundEventLogs.push(`هاجم ${actor.name} اللاعب ${target.name}.`);
          crimes.push({ culpritId: actor.id, targetId: target.id });
          break;
        }
        case 'STEAL': {
          const power = card.power || 1;
          const amount = Math.min(power, target.reputation);
          target.reputation -= amount;
          actor.reputation += amount;
          roundEventLogs.push(`سلب ${actor.name} نقاط سمعة من ${target.name}.`);
          crimes.push({ culpritId: actor.id, targetId: target.id });
          break;
        }
        case 'DEFAME': {
          defamedTargets.push(target.name);
          roundEventLogs.push(`تم توجيه تهمة مشبوهة ضد ${target.name}.`);
          crimes.push({ culpritId: actor.id, targetId: target.id });
          break;
        }
        case 'ALLIANCE_OFFER': {
          if (!target.allyId && !actor.allyId) {
            if (!messages[target.id]) messages[target.id] = [];
            messages[target.id].push({
              id: uniqueId('msg'), kind: 'alliance_offer',
              fromId: actor.id, fromName: actor.name,
              text: `عرض تحالف سري بنسبة تقاسم 50% من ${actor.name}.`
            });
            roundEventLogs.push(`أرسل ${actor.name} عرض تحالف إلى ${target.name}.`);
          }
          break;
        }
        case 'MESSAGE': {
          if (!messages[target.id]) messages[target.id] = [];
          messages[target.id].push({
            id: uniqueId('msg'), kind: 'private_msg',
            fromName: actor.name,
            text: String(act.text || 'رسالة').slice(0, 300)
          });
          roundEventLogs.push(`أرسل ${actor.name} رسالة خاصة إلى ${target.name}.`);
          break;
        }
        case 'RISKY_BOOST': {
          if (Math.random() < 0.35) {
            actor.reputation = Math.max(0, actor.reputation - 2);
            roundEventLogs.push(`فشلت محاولة النفوذ المظلم لـ ${actor.name}.`);
          } else {
            actor.reputation += (card.power || 2);
            roundEventLogs.push(`نجح ${actor.name} في زيادة نفوذه.`);
          }
          break;
        }
      }
    }

    processAllianceShare(players, before);
    const globalEvent = triggerRandomEndRoundEvent(players, hands);

    const trueCulprit = crimes.length ? crimes[Math.floor(Math.random() * crimes.length)].culpritId : null;
    let courtCase = {
      title: 'تقرير الدليل',
      trueCulpritId: trueCulprit,
      clue: '',
      confidence: Math.floor(Math.random() * 30) + 60,
      globalEvent
    };

    const prompt = `أحداث الجولة الحالية:
${roundEventLogs.length ? roundEventLogs.map(e => `- ${e}`).join('\n') : '- جولة هادئة بلا أحداث خاصة.'}
المستهدفون بالشبهات: [${defamedTargets.join('، ') || 'لا أحد'}]

اكتب تقريراً عادياً وواضحاً بدون مبالغة أو تهويل، يصف باختصار ما حدث في الجولة والأدلة المتاحة.
أعد JSON صالحاً بالشكل التالي فقط:
{"clue": "نص التقرير العادي والواضح", "confidence": 75}`;

    const raw = await openRouter(prompt, 250);
    let parsedAi = null;
    try { parsedAi = raw ? JSON.parse(raw.replace(/```json|```/g, '').trim()) : null; } catch {}

    if (parsedAi?.clue) {
      courtCase.clue = String(parsedAi.clue).slice(0, 500);
      courtCase.confidence = Math.max(30, Math.min(98, Number(parsedAi.confidence) || 70));
    } else {
      let defameNote = defamedTargets.length ? ` وتشير البيانات إلى احتمالية تورط: [${defamedTargets.join(' أو ')}].` : '';
      courtCase.clue = `سُجلت أحداث الجولة وتم رصد تحركات الأطراف.${defameNote} الأدلة تظل خاضعة للتقييم.`;
    }

    return json(res, 200, { players, pendingMessages: messages, hands, courtCase });
  }

  if (action === 'resolve_vote') {
    const players = normalizePlayers(body.players);
    const byId = playerMap(players);
    const culpritId = body.trueCulpritId == null ? null : idOf(body.trueCulpritId);
    const votes = Array.isArray(body.votes) ? body.votes : [];
    const tally = {};

    for (const vote of votes) {
      const accusedId = vote.accusedId == null ? 'NONE' : idOf(vote.accusedId);
      tally[accusedId] = (tally[accusedId] || 0) + 1;
    }

    const winner = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE';
    let verdictMsg;

    if (winner === culpritId && culpritId !== null) {
      const culprit = byId.get(culpritId);
      if (culprit) culprit.reputation = Math.max(0, culprit.reputation - 3);
      for (const p of players) { if (active(p) && p.id !== culpritId) p.reputation += 1; }
      verdictMsg = 'نجح التصويت الجماعي في تحديد الجاني الحقيقي! خُصم 3 نقاط من الجاني وحصل بقية المشاركين على نقطة مكافأة.';
    } else {
      const wrongTarget = byId.get(winner);
      if (winner !== 'NONE' && wrongTarget) {
        wrongTarget.reputation += 2;
        for (const p of players) { if (active(p)) p.reputation = Math.max(0, p.reputation - 1); }
        verdictMsg = `أخطأ التصويت الجماعي ولم يكن (${wrongTarget.name}) هو الجاني؛ فحصل على تعويض (+2 نقطة)، وعوقب المصوتون بخصم نقطة.`;
      } else {
        verdictMsg = 'انتهى التصويت الجماعي دون إدانة واضحة.';
      }
    }

    return json(res, 200, { players, verdictMsg });
  }

  return json(res, 400, { error: 'UNKNOWN_ACTION' });
}

export default async function api(req, res) {
  try { return await handler(req, res); }
  catch (error) {
    console.error(error);
    return json(res, 500, { error: 'SERVER_ERROR', message: 'حدث خطأ في معالجة طلب الخادم.' });
  }
}
