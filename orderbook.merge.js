const { WebsocketClient } = require('bybit-api');

class BybitOrderBookManager {
  constructor() {
    this.orderBooks = new Map();
    this.stats = {
      snapshotCount: 0,
      deltaCount: 0,
      lastSnapshotTime: 0,
      lastDeltaTime: 0,
      totalSnapshotTime: 0,
      totalDeltaTime: 0,
      getOrderBookTime: 0,
      getOrderBookCount: 0
    };
  }

  initialize(pairs) {
    pairs.forEach(pair => {
      this.orderBooks.set(pair, {
        bids: [],
        asks: []
      });
    });
  }

  mergeSortedUpdates(current, updates, ascending) {
    const merged = [];
    let i = 0, j = 0;

    while (i < current.length && j < updates.length) {
      const cmp = ascending 
        ? current[i][0] - updates[j][0]
        : updates[j][0] - current[i][0];

      if (cmp < 0) {
        merged.push(current[i++]);
      } else if (cmp > 0) {
        if (updates[j][1] !== 0) merged.push(updates[j]);
        j++;
      } else {
        if (updates[j][1] !== 0) merged.push(updates[j]);
        i++; j++;
      }
    }

    while (i < current.length) {
      merged.push(current[i++]);
    }

    while (j < updates.length) {
      if (updates[j][1] !== 0) merged.push(updates[j]);
      j++;
    }

    return merged;
  }

  processSnapshot(pair, snapshot) {
    const start = process.hrtime.bigint();
    const orderBook = this.orderBooks.get(pair);
    
    orderBook.bids = (snapshot.b || []).map(([p, q]) => [Number(p), Number(q)]);
    orderBook.asks = (snapshot.a || []).map(([p, q]) => [Number(p), Number(q)]);
    
    const end = process.hrtime.bigint();
    const timeTaken = Number(end - start) / 1e6; // Convert to milliseconds
    
    this.stats.snapshotCount++;
    this.stats.lastSnapshotTime = timeTaken;
    this.stats.totalSnapshotTime += timeTaken;
  }

  processDelta(pair, delta) {
    const start = process.hrtime.bigint();
    const orderBook = this.orderBooks.get(pair);

    if (delta.b?.length > 0) {
      const bidUpdates = delta.b.map(([p, q]) => [Number(p), Number(q)]);
      orderBook.bids = this.mergeSortedUpdates(orderBook.bids, bidUpdates, false);
    }

    if (delta.a?.length > 0) {
      const askUpdates = delta.a.map(([p, q]) => [Number(p), Number(q)]);
      orderBook.asks = this.mergeSortedUpdates(orderBook.asks, askUpdates, true);
    }
    
    const end = process.hrtime.bigint();
    const timeTaken = Number(end - start) / 1e6;
    
    this.stats.deltaCount++;
    this.stats.lastDeltaTime = timeTaken;
    this.stats.totalDeltaTime += timeTaken;
  }

  getOrderBook(pair, depth = 200) {
    const start = process.hrtime.bigint();
    const book = this.orderBooks.get(pair);
    const result = {
      buyOrderBook: book.bids.slice(0, depth),
      sellOrderBook: book.asks.slice(0, depth)
    };
    
    const end = process.hrtime.bigint();
    const timeTaken = Number(end - start) / 1e6;
    
    this.stats.getOrderBookCount++;
    this.stats.getOrderBookTime += timeTaken;
    
    return result;
  }

  getStats() {
    return {
      ...this.stats,
      avgSnapshotTime: this.stats.snapshotCount > 0 
        ? this.stats.totalSnapshotTime / this.stats.snapshotCount 
        : 0,
      avgDeltaTime: this.stats.deltaCount > 0 
        ? this.stats.totalDeltaTime / this.stats.deltaCount 
        : 0,
      avgGetOrderBookTime: this.stats.getOrderBookCount > 0 
        ? this.stats.getOrderBookTime / this.stats.getOrderBookCount 
        : 0,
      memoryUsage: process.memoryUsage()
    };
  }
}

async function newSocketConnection() {
  try {
    const wsConfig = {
      key: "OWR62JtM71biQggCON",
      secret: "J3XH8fdZ2A2sCKc4TNZFP0MRT0ONx1gWv8Tn",
      testnet: false,
      market: 'v5'
    };
    return new WebsocketClient(wsConfig);
  } catch (error) {
    console.error('Socket connection error:', error);
    throw error;
  }
}

async function initSpotWebSocket(ws, orderBookManager) {
  try {
    orderBookManager.initialize(['ETHUSDT']);
    ws.subscribeV5(['orderbook.200.ETHUSDT'], 'spot');
    
    ws.on('update', async (data) => {
      if (!data) return;
      const pair = data?.data?.s;
      if (!pair) return;
      
      if (data.type === 'snapshot') {
        orderBookManager.processSnapshot(pair, data.data);
      } else if (data.type === 'delta') {
        orderBookManager.processDelta(pair, data.data);
        orderBookManager.getOrderBook(pair);
      }
    });

    ws.on('open', () => console.log('WebSocket connected'));
    ws.on('error', (err) => console.error('WebSocket error:', err));
  } catch (error) {
    console.error('WebSocket initialization error:', error);
    throw error;
  }
}

(async () => {
  try {
    const orderBookManager = new BybitOrderBookManager();
    const ws = await newSocketConnection();
    await initSpotWebSocket(ws, orderBookManager);
    setInterval(() => {
      const stats = orderBookManager.getStats();
      console.log(orderBookManager.orderBooks.get('ETHUSDT').bids.length)
      console.log('\n--- Performance Statistics ---');
      console.log(`Book Size: 200 levels`);
      console.log(`Snapshots: ${stats.snapshotCount} (Avg: ${stats.avgSnapshotTime.toFixed(3)}ms)`);
      console.log(`Deltas: ${stats.deltaCount} (Avg: ${stats.avgDeltaTime.toFixed(3)}ms)`);
      console.log(`Queries: 200 (Avg: ${stats.avgGetOrderBookTime.toFixed(3)}ms)`);
      console.log('Memory Usage:');
      console.log(`- RSS: ${(stats.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`);
      console.log(`- Heap Total: ${(stats.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
      console.log(`- Heap Used: ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log('----------------------------\n');
    }, 5000);

  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
})();