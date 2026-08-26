const CARD_TEMPLATES = [
  { name: 'بطاقة خصم', description: 'اخفض سمعة لاعب مستهدف بمقدار 2.', rarity: 'عادية', cost: 1, effectType: 'DAMAGE', targetRequired: true, value: 2 },
  { name: 'بطاقة تشويه سمعة', description: 'تسبب خسارة 3 نقاط سمعة للاعب مستهدف.', rarity: 'نادرة', cost: 2, effectType: 'DAMAGE', targetRequired: true, value: 3 },
  { name: 'بطاقة رسالة سرية', description: 'أرسل رسالة لا يراها إلا اللاعب المستهدف.', rarity: 'عادية', cost: 1, effectType: 'MESSAGE', targetRequired: true },
  { name: 'بطاقة تبديل', description: 'تستبدل البطاقة نفسها ببطاقة عشوائية جديدة.', rarity: 'عادية', cost: 2, effectType: 'SWAP_CARD', targetRequired: false },
  { name: 'بطاقة قلب الضرر', description: 'تحميك من هجوم واحد وتعيد الضرر إلى المهاجم.', rarity: 'نادرة', cost: 3, effectType: 'REFLECT', targetRequired: false, value: 2 },
  { name: 'بطاقة تعزيز نفوذ', description: 'احصل على 2 نقطة سمعة.', rarity: 'عادية', cost: 1, effectType: 'GAIN', targetRequired: false, value: 2 },
  { name: 'بطاقة كشف الأوراق', description: 'تكشف لك بطاقات لاعب مستهدف.', rarity: 'نادرة', cost: 3, effectType: 'REVEAL_CARDS', targetRequired: true },
  { name: 'بطاقة تحالف', description: 'أنشئ تحالفًا مؤقتًا مع لاعب مستهدف.', rarity: 'نادرة', cost: 3, effectType: 'ALLY', targetRequired: true },
  { name: 'بطاقة تسريب وكشف جرم', description: 'تزيد احتمال اتهام اللاعب المستهدف في تقرير الجولة.', rarity: 'نادرة', cost: 3, effectType: 'ACCUSATION', targetRequired: true, value: 2 },
  { name: 'بطاقة تدمير تحالف', description: 'تنهي تحالف اللاعب المستهدف.', rarity: 'نادرة', cost: 4, effectType: 'BREAK_ALLIANCE', targetRequired: true },
  { name: 'بطاقة درع', description: 'تحميك من أول تأثير سلبي في الجولة.', rarity: 'نادرة', cost: 3, effectType: 'SHIELD', targetRequired: false }
];

function randomId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cloneCard(template) {
  return { ...template, id: randomId('card') };
}

function drawCard() {
  return cloneCard(CARD_TEMPLATES[Math.floor(Math.random() * CARD_TEMPLATES.length)]);
}

function initialHand(size = 3) {
  return Array.from({ length: size }, drawCard);
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function normalizePlayers(players) {
  return Array.isArray(players) ? players.map(p => ({
    id: String(p.id),
    name: String(p.name || 'لاعب'),
    reputation: Math.max(0, Number(p.reputation) || 0),
    allyId: p.allyId || null,
    allyRoundsLeft: Math.max(0, Number(p.allyRoundsLeft) || 0),
    shield: Boolean(p.shield),
    accusationBonus: Number(p.accusationBonus) || 0
  })) : [];
}

function findPlayer(players, id) {
  return players.find(p => p.id === id);
}

function safeTarget(players, id, actorId) {
  const target = findPlayer(players, id);
  if (!target || target.id === actorId) return null;
  return target;
}

function createCourtCase(players, actions) {
  const active = players.filter(p => p.reputation > 0);
  const culprit = active[Math.floor(Math.random() * Math.max(1, active.length))] || players[0];
  const suspicious = actions.filter(a => a.targetId).length;
  const targeted = actions.reduce((map, a) => {
    if (a.targetId) map[a.targetId] = (map[a.targetId] || 0) + 1;
    return map;
  }, {});
  const topTarget = Object.entries(targeted).sort((a, b) => b[1] - a[1])[0];
  let clue = 'تحركت الشبهات في هذه الجولة، لكن التقرير لا يكشف الأفعال السرية مباشرة.';
  if (topTarget) clue = 'توجد تناقضات في أقوال أحد المشاركين، ويبدو أن لاعبًا واحدًا جذب قدرًا أكبر من الشبهات.';
  if (suspicious === 0) clue = 'لم تُسجل أفعال هجومية ظاهرة، لكن القضية لم تُغلق بعد.';
  return {
    id: randomId('case'),
    trueCulpritId: culprit?.id || null,
    clue,
    globalEvent: Math.random() < 0.25 ? {
      title: 'تدقيق مفاجئ',
      description: 'يحصل كل لاعب ما زالت سمعته فوق الصفر على نقطة سمعة إضافية.'
    } : null
  };
}

function applyRoundActions(players, hands, pendingMessages, actions) {
  const working = normalizePlayers(players);
  const handMap = { ...(hands || {}) };
  const messages = { ...(pendingMessages || {}) };

  for (const player of working) {
    if (player.allyRoundsLeft > 0) player.allyRoundsLeft -= 1;
    if (player.allyRoundsLeft === 0) player.allyId = null;
    player.accusationBonus = 0;
  }

  for (const action of Array.isArray(actions) ? actions : []) {
    const actor = findPlayer(working, action.playerId);
    if (!actor || actor.reputation <= 0) continue;
    const target = action.targetId ? safeTarget(working, action.targetId, actor.id) : null;
    const card = action.generatedCard || {};

    if (card.effectType === 'DAMAGE') {
      if (!target) continue;
      if (target.shield) { target.shield = false; continue; }
      target.reputation = Math.max(0, target.reputation - (Number(card.value) || 1));
    } else if (card.effectType === 'MESSAGE') {
      if (!target) continue;
      if (!messages[target.id]) messages[target.id] = [];
      messages[target.id].push({ fromName: actor.name, text: String(action.text || 'رسالة سرية بلا نص') });
    } else if (card.effectType === 'GAIN') {
      actor.reputation += Number(card.value) || 1;
    } else if (card.effectType === 'REFLECT') {
      actor.shield = true;
    } else if (card.effectType === 'SHIELD') {
      actor.shield = true;
    } else if (card.effectType === 'ALLY') {
      if (!target) continue;
      actor.allyId = target.id;
      actor.allyRoundsLeft = 2;
      target.allyId = actor.id;
      target.allyRoundsLeft = 2;
    } else if (card.effectType === 'BREAK_ALLIANCE') {
      if (!target) continue;
      const partner = target.allyId ? findPlayer(working, target.allyId) : null;
      target.allyId = null;
      target.allyRoundsLeft = 0;
      if (partner) { partner.allyId = null; partner.allyRoundsLeft = 0; }
    } else if (card.effectType === 'ACCUSATION') {
      if (!target) continue;
      target.accusationBonus += Number(card.value) || 1;
    }
  }

  return { players: working, hands: handMap, pendingMessages: messages };
}

export async function handleGameRequest(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: true, message: 'الطلب يجب أن يكون POST.' });

  let body = req.body;
  if (body == null) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { error: true, message: 'JSON غير صالح.' }); }
  }

  const action = body?.action;

  if (action === 'generate_initial_cards') {
    return json(res, 200, { cards: initialHand(3) });
  }

  if (action === 'buy_card') {
    const players = normalizePlayers(body.players);
    const player = findPlayer(players, body.playerId);
    const cost = Number(body.cost);
    if (!player) return json(res, 404, { error: true, message: 'اللاعب غير موجود.' });
    if (!Number.isFinite(cost) || cost < 1) return json(res, 400, { error: true, message: 'تكلفة البطاقة غير صالحة.' });
    if (player.reputation < cost) return json(res, 400, { error: true, message: 'رصيد السمعة غير كافٍ.' });
    player.reputation -= cost;
    const pool = CARD_TEMPLATES.filter(c => c.cost <= cost + 1);
    const boughtCard = cloneCard(pool[Math.floor(Math.random() * pool.length)]);
    return json(res, 200, { players, boughtCard });
  }

  if (action === 'instant_reveal_cards') {
    const hands = body.hands || {};
    return json(res, 200, { targetCards: Array.isArray(hands[body.targetId]) ? hands[body.targetId] : [] });
  }

  if (action === 'instant_swap_card') {
    const hands = { ...(body.hands || {}) };
    const hand = Array.isArray(hands[body.playerId]) ? [...hands[body.playerId]] : [];
    const index = hand.findIndex(c => c.id === body.cardId);
    if (index < 0) return json(res, 400, { error: true, message: 'البطاقة غير موجودة في اليد.' });
    hand[index] = drawCard();
    hands[body.playerId] = hand;
    return json(res, 200, { hands });
  }

  if (action === 'resolve_round') {
    const result = applyRoundActions(body.players, body.hands, body.pendingMessages, body.actions);
    const courtCase = createCourtCase(result.players, body.actions || []);
    if (courtCase.globalEvent) {
      for (const p of result.players) if (p.reputation > 0) p.reputation += 1;
    }
    return json(res, 200, { ...result, courtCase });
  }

  if (action === 'resolve_vote') {
    const players = normalizePlayers(body.players);
    const accusedId = Array.isArray(body.votes) && body.votes[0] ? body.votes[0].accusedId : 'NONE';
    const culprit = body.trueCulpritId;
    let verdictMsg;
    if (accusedId === culprit && accusedId !== 'NONE' && culprit) {
      const winner = findPlayer(players, accusedId);
      for (const p of players) p.reputation += (p.id === accusedId ? 3 : 0);
      verdictMsg = `أصاب التصويت الهدف الصحيح. تم كشف المتسبب: ${winner?.name || 'اللاعب'}. وحصل على مكافأة تحقيقية.`;
    } else if (accusedId === 'NONE') {
      for (const p of players) p.reputation += 1;
      verdictMsg = 'اختار الجميع البراءة. لا يكشف التقرير الحقيقة كاملة، وحصل الجميع على نقطة صمود.';
    } else {
      const target = findPlayer(players, accusedId);
      if (target) target.reputation += 1;
      verdictMsg = `كان الاتهام خاطئًا. ${target?.name || 'اللاعب المستهدف'} حصل على نقطة تعويض.`;
    }
    return json(res, 200, { players, verdictMsg });
  }

  return json(res, 400, { error: true, message: `إجراء غير معروف: ${action || 'بدون action'}` });
}
