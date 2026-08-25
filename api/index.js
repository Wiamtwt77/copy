async function buyCard(cost) {
  const p = gameState.players[gameState.activePlayerIndex];
  try {
    const res = await fetch(window.location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'buy_card', players: gameState.players, playerId: p.id, cost })
    });
    const data = await res.json();
    
    // معالجة الخطأ المرسل من الخادم بوضوح
    if (!res.ok || data.error) {
      alert(data.message || 'حدث خطأ أثناء محاولة شراء البطاقة. تأكد من رصيدك.');
      return;
    }
    
    gameState.players = data.players;
    
    if (!Array.isArray(gameState.hands[p.id])) {
      gameState.hands[p.id] = [];
    }
    gameState.hands[p.id].push(data.boughtCard);

    closeShop();
    renderGame();
    alert(`تم شراء "${data.boughtCard.name}" وإضافتها ليدك بنجاح!`);
  } catch (err) {
    console.error(err);
    alert('حدث خطأ في الاتصال بالخادم أثناء شراء البطاقة.');
  }
}
