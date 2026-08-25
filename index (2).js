const MODEL = process.env.OPENROUTER_MODEL || 'z-ai/glm-4.6';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

const BASE_CARDS = [
  // بطاقات شائعة واقتصادية (تكلفة 1 سمعة)
  { baseId: 'c1', name: 'بطاقة سرقة خفيفة', description: 'تسلب 1 نقطة سمعة من الهدف وتحولها إليك.', effectType: 'STEAL', power: 1, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c2', name: 'بطاقة خصم بسيط', description: 'تخصم 1 نقطة سمعة من الهدف مباشرة.', effectType: 'ATTACK', power: 1, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c3', name: 'بطاقة تشويه سمعة', description: 'توجه الشكوك وتتسبب في اتهام الهدف داخل تقرير الدليل.', effectType: 'DEFAME', power: 0, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c7', name: 'بطاقة تحالف سري', description: 'تقاسم الأرباح والخسائر مناصفة (50%) لمدة 3 جولات.', effectType: 'ALLIANCE_OFFER', power: 0, cost: 1, targetRequired: true, rarity: 'شائعة' },
  { baseId: 'c8', name: 'بطاقة رسالة خاصة', description: 'تصل الرسالة إلى اللاعب المطلوب حصرياً ودون كشفك.', effectType: 'MESSAGE', power: 0, cost: 1, targetRequired: true, rarity: 'شائعة' },
  
  // بطاقات نادرة واستثنائية عالية السعر والمخاطر
  { baseId: 'c4', name: 'بطاقة كشف الأوراق', description: 'تكشف بطاقات لاعب آخر في أوانها فوراً.', effectType: 'REVEAL_CARDS', power: 0, cost: 3, targetRequired: true, rarity: 'نادرة' },
  { baseId: 'c5', name: 'بطاقة تبديل بطاقة', description: 'تستبدل إحدى بطاقاتك ببطاقة عشوائية جديدة في أوانها.', effectType: 'SWAP_CARD', power: 0, cost: 2, targetRequired: false, rarity: 'نادرة' },
  { baseId: 'c6', name: 'بطاقة كشف المهاجم', description: 'تكشف هوية اللاعب في الدليل فوراً إذا تجرأ وهاجمك.', effectType: 'REVEAL_ATTACKER', power: 0, cost: 3, targetRequired: false, rarity: 'نادرة' },
  { baseId: 'c9', name: 'بطاقة نفوذ مظلم (خطرة)', description: 'تمنحك 3 نقاط سمعة فوراً، لكنها قد تنقلب عليك بخفض سمعتك.', effectType: 'RISKY_BOOST', power: 3, cost: 3, targetRequired: false, rarity: 'استثنائية' },
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

async function openRouter(prompt, maxTokens = 300) {
  const key = process.env.OPENROUTER_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(OPENROUTER, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Secret Court' },
      body: JSON.stringify({
        model: MODEL, temperature: 0.85, max_tokens: maxTokens,
        messages: [
          { 
            role: 'system', 
            content: 'أنت راوي ورئيس محكمة جنائية غامضة. مهمتك صياغة تقرير استخباري درامي غامض يتكيف مع أحداث الجلسة ويتأثر ببطاقات تشويه السمعة. أعد JSON صالحاً فقط بلا Markdown.' 
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

function ageAlliances(players) {
  const byId = playerMap(players);
  for (const p of players) {
    if (!p.allyId) continue;
    p.allyRoundsLeft -= 1;
    const ally = byId.get(p.allyId);
    if (!ally || p.allyRoundsLeft <= 0 || !active(p) || !active(ally)) {
      if (ally) { ally.allyId = null; ally.allyRoundsLeft = 0; }
      p.allyId = null; p.allyRoundsLeft = 0;
    }
  }
}

function triggerRandomEndRoundEvent(players, hands) {
  const activePlayers = players.filter(active);
  if (activePlayers.length === 0) return null;

  const eventTypes = ['CARD_SWAP_RANDOM', 'REP_SWAP', 'DEDUCT_PLAYER', 'ADD_PLAYER', 'COMPENSATION', 'PENALTY', 'REVEAL_ALLIANCE'];
  const chosenType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
  const p1 = activePlayers[Math.floor(Math.random() * activePlayers.length)];
  const p2 = activePlayers[Math.floor(Math.random() * activePlayers.length)];

  let title = '', desc = '';

  switch (chosenType) {
    case 'CARD_SWAP_RANDOM':
      title = 'تقلبات في الحقائب';
      desc = 'حدث مفاجئ أدى إلى قلب وتبديل بطاقة عشوائية بين بعض اللاعبين!';
      if (activePlayers.length >= 2 && p1.id !== p2.id) {
        const h1 = hands[p1.id] || [], h2 = hands[p2.id] || [];
        if (h1.length && h2.length) { h1.push(h2.pop()); h2.push(h1.pop()); }
      }
      break;
    case 'REP_SWAP':
      title = 'انعكاس السمعة';
      desc = `تم تبديل وموازنة نقاط السمعة بين ${p1.name} و${p2.name} بشكل غامض!`;
      if (p1.id !== p2.id) { const temp = p1.reputation; p1.reputation = p2.reputation; p2.reputation = temp; }
      break;
    case 'DEDUCT_PLAYER':
      title = 'ضريبة القصر';
      desc = `فرضت سلطات القصر غرامة طارئة بخصم نقطتي سمعة من ${p1.name}.`;
      p1.reputation = Math.max(0, p1.reputation - 2);
      break;
    case 'ADD_PLAYER':
      title = 'منحة ملكية';
      desc = `مكافأة ملكية غير متوقعة تمنح ${p1.name} نقطتي سمعة إضافيتين.`;
      p1.reputation += 2;
      break;
    case 'COMPENSATION':
      title = 'مرسوم تعويض';
      desc = `صُرف تعويض سمعة قدره (+2 نقطة) لصالح ${p1.name}.`;
      p1.reputation += 2;
      break;
    case 'PENALTY':
      title = 'عقوبة انضباطية';
      desc = `توقيع عقوبة حازمة بخصم 2 نقطة سمعة من ${p1.name}.`;
      p1.reputation = Math.max(0, p1.reputation - 2);
      break;
    case 'REVEAL_ALLIANCE':
      title = 'تسريب الأسرار';
      desc = 'تم كشف وتحليل جميع التحالفات السرية القائمة حالياً أمام الجميع!';
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
      return json(res, 400, { error: 'INSUFFICIENT_REPUTATION', message: `رصيد السمعة لا يكفي لشراء هذه البطاقة (تتطلب ${cardCost} نقاط).` });
    }
    buyer.reputation -= cardCost;
    let pool = BASE_CARDS.filter(c => (c.cost || 1) === cardCost);
    if (!pool.length) pool = BASE_CARDS;
    const boughtCard = getRandomCards(pool, 1)[0];
    return json(res, 200, { players, boughtCard });
  }

  if (action === 'resolve_round') {
    const players = normalizePlayers(body.players);
    const byId = playerMap(players);
    const messages = copy(body.pendingMessages) || {};
    const hands = copy(body.hands) || {};
    const actions = Array.isArray(body.actions) ? body.actions : [];
    const before = Object.fromEntries(players.map(p => [p.id, p.reputation]));

    const defamedTargets = [];
    const revealedAttackers = [];
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
            roundEventLogs.push(`انقلبت بطاقة الهجوم الخاصة بـ ${actor.name} على صاحبها.`);
            break;
          }
          target.reputation = Math.max(0, target.reputation - power);
          roundEventLogs.push(`قام ${actor.name} بمهاجمة ${target.name}.`);
          crimes.push({ culpritId: actor.id, targetId: target.id });
          break;
        }
        case 'STEAL': {
          const power = card.power || 1;
          const amount = Math.min(power, target.reputation);
          target.reputation -= amount;
          actor.reputation += amount;
          roundEventLogs.push(`قام ${actor.name} بسلب نقاط سمعة من ${target.name}.`);
          crimes.push({ culpritId: actor.id, targetId: target.id });
          break;
        }
        case 'DEFAME': {
          defamedTargets.push(target.name);
          roundEventLogs.push(`تم استخدام بطاقة تشويه السمعة ضد ${target.name}.`);
          crimes.push({ culpritId: actor.id, targetId: target.id });
          break;
        }
        case 'REVEAL_ATTACKER': {
          revealedAttackers.push(actor.name);
          roundEventLogs.push(`فعّل ${actor.name} بطاقة كشف المهاجم.`);
          break;
        }
        case 'SWAP_CARD': {
          const pHand = hands[actor.id] || [];
          pHand.push(getRandomCards(BASE_CARDS, 1)[0]);
          roundEventLogs.push(`استبدل ${actor.name} بطاقته ببطاقة جديدة.`);
          break;
        }
        case 'ALLIANCE_OFFER': {
          if (!target.allyId && !actor.allyId) {
            if (!messages[target.id]) messages[target.id] = [];
            messages[target.id].push({
              id: uniqueId('msg'), kind: 'alliance_offer',
              fromId: actor.id, fromName: actor.name,
              text: `عرض تحالف سري بنسبة تقاسم 50% لمدة 3 جولات من ${actor.name}.`
            });
            roundEventLogs.push(`قدم ${actor.name} عرض تحالف سري إلى ${target.name}.`);
          }
          break;
        }
        case 'MESSAGE': {
          if (!messages[target.id]) messages[target.id] = [];
          messages[target.id].push({
            id: uniqueId('msg'), kind: 'private_msg',
            fromName: actor.name,
            text: String(act.text || 'رسالة خاصة').slice(0, 300)
          });
          roundEventLogs.push(`أرسل ${actor.name} رسالة خاصة إلى ${target.name}.`);
          break;
        }
        case 'RISKY_BOOST': {
          if (Math.random() < 0.35) {
            actor.reputation = Math.max(0, actor.reputation - 2);
            roundEventLogs.push(`انقلبت بطاقة النفوذ المظلم على ${actor.name}.`);
          } else {
            actor.reputation += (card.power || 2);
            roundEventLogs.push(`نجح ${actor.name} في جني نفوذ إضافي.`);
          }
          break;
        }
      }
    }

    processAllianceShare(players, before);
    ageAlliances(players);
    const globalEvent = triggerRandomEndRoundEvent(players, hands);

    const trueCulprit = crimes.length ? crimes[Math.floor(Math.random() * crimes.length)].culpritId : null;
    let courtCase = {
      title: 'تقرير المحكمة الاستخباري',
      trueCulpritId: trueCulprit,
      clue: '',
      confidence: Math.floor(Math.random() * 40) + 50,
      globalEvent
    };

    const prompt = `أحداث الجلسة الحالية:
${roundEventLogs.length ? roundEventLogs.map(e => `- ${e}`).join('\n') : '- جولة هادئة.'}
الأسماء المستهدفة بتشويه السمعة: [${defamedTargets.join('، ') || 'لا أحد'}]
اكتب تقريراً جنائياً درامياً غامضاً ومزدوِج المعاني يتكيف مع الأحداث.
أعد JSON صالحاً بالشكل التالي فقط:
{"clue": "نص التقرير الغامض المشوق", "confidence": 75}`;

    const raw = await openRouter(prompt, 300);
    let parsedAi = null;
    try { parsedAi = raw ? JSON.parse(raw.replace(/```json|```/g, '').trim()) : null; } catch {}

    if (parsedAi?.clue) {
      courtCase.clue = String(parsedAi.clue).slice(0, 500);
      courtCase.confidence = Math.max(30, Math.min(98, Number(parsedAi.confidence) || 70));
    } else {
      let defameNote = defamedTargets.length ? ` وتشير أصابع الاتهام نحو: [${defamedTargets.join(' أو ')}].` : '';
      courtCase.clue = `تقرير المحكمة يتكيف مع جلبة الكواليس.${defameNote} الحقيقة تبدو كسراب بين ثنايا الكلمات.`;
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
      if (culprit) culprit.reputation = Math.max(0, culprit.reputation - 4);
      for (const p of players) { if (active(p) && p.id !== culpritId) p.reputation += 1; }
      verdictMsg = 'نجح التصويت الجماعي في اصطياد الجاني الحقيقي! خُصم 4 نقاط من الجاني وحصل البقية على مكافأة نفوذ (+1 نقطة).';
    } else {
      const wrongTarget = byId.get(winner);
      if (winner !== 'NONE' && wrongTarget) {
        wrongTarget.reputation += 2;
        for (const p of players) { if (active(p)) p.reputation = Math.max(0, p.reputation - 1); }
        verdictMsg = `أخطأ التصويت الجماعي! لم يكن (${wrongTarget.name}) الجاني؛ فحصل على تعويض (+2 نقطة)، وعوقب المصوتون بخصم نقطة.`;
      } else {
        verdictMsg = 'انتهى التصويت الجماعي بالامتناع ولم يتم إدانة أحد.';
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