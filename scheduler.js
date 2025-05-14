

const cron  = require('node-cron');
const axios = require('axios');
// const API_ENDPOINTS='https://cpl.in.net'
const API_ENDPOINTS="http://localhost:3000"

const API_BASE = `${API_ENDPOINTS}/api/bids`;
const EXIT_PATH   = id => `${API_BASE}/${id}/exit-second-highest`;
const SELL_PATH   = id => `${API_BASE}/players/${id}/soldcrone`;

// Fetch all unsold players from your API
async function fetchUnsoldPlayers() {
  const res = await axios.get(`${API_BASE}/players?filter=unsold`);
  return res.data.players;           // assume [{ _id, ... }, …]
}

// Fetch count of active bidders for a player
async function fetchActiveBidderCount(playerId) {
  const res = await axios.get(`${API_BASE}/players/${playerId}/bidders`);
  console.log(res.data)
  const count = res?.data?.count ?? 0;
  return count;
}




// Process one player through the “15-min window” logic
async function processPlayer(playerId) {
  await finalizeSingleBidSinceStarting(playerId)
  console.log(`[${new Date().toISOString()}] Start window for player ${playerId}`);
  
  let cycle = 0;
  const maxCycles = 3; // 3 × 5min = 15min

  const doCycle = async () => {
    cycle++;
    console.log(` → [Cycle ${cycle}] Removing second-highest for ${playerId}`);
    
    const count = await fetchActiveBidderCount(playerId);
    console.log(`   bidders remaining: ${count}`);

    if (count >= 2 && cycle < maxCycles) {
     await axios.post(EXIT_PATH(playerId));
      // schedule next 5-min check
      console.log(`   resetting window for ${playerId} (cycle ${cycle})`);
      setTimeout(doCycle, 5 * 60 * 1000);
    } else if (count >= 2 && cycle >= maxCycles) {
      // after 15min still ≥2 bidders → reset everything and start a new window
      console.log(`   15 min up and still 2+ bidders → restarting window`);
      cycle = 0;
      setTimeout(doCycle, 5 * 60 * 1000);
    } else {
      // fewer than 2 bidders → FINALIZE SALE
      console.log(`   FINAL: selling ${playerId}`);
    //   await finalizeSale(playerId);
    }
  };

  // kick off the first removal immediately
  doCycle().catch(err => console.error(`Error in cycle for ${playerId}:`, err));
}

// Every minute, scan and launch any new windows
cron.schedule('*/1 * * * *', async () => {
  try {
    const players = await fetchUnsoldPlayers();
    console.log(players)
    for (const p of players) {
      // You might want to track in‐memory which players are already in‐flight
      // to avoid double‐scheduling. E.g. keep a Set of “pending” IDs.
      processPlayer(p._id);
    }
  } catch (err) {
    console.error('[Scheduler] fetch error:', err);
  }
});


async function finalizeSale(playerId) {
  try {
    const res = await axios.post(SELL_PATH(playerId));
    console.log(`Sold player ${playerId}:`, res.data);
  } catch (err) {
    console.error(`Error selling player ${playerId}:`, err);
  }
}



async function finalizeSingleBidSinceStarting(playerId) {
    try {
      const res = await axios.get(`${API_BASE}/players/${playerId}/singlebid`);
      console.log(`Sold player:`, res);
    } catch (err) {
      console.error(`Error selling player ${playerId}:`, err);
    }
  }
console.log('🕒 Auction scheduler running…');
