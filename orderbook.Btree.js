const { WebsocketClient } = require('bybit-api');
const { RBTree } = require('bintrees'); 

class OrderBookManager {
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
      getOrderBookCount: 0,
      bookSize: 0
    };
  }

  initialize(pairs) {
    pairs.forEach(pair => {
      this.orderBooks.set(pair, {
        bids: new RBTree((a, b) => b[0] - a[0]), 
        asks: new RBTree((a, b) => a[0] - b[0]), 
      });
    });
  }

  processSnapshot(pair, snapshot) {
    const start = process.hrtime.bigint();
    const orderBook = this.orderBooks.get(pair);
    
    orderBook.bids.clear();
    orderBook.asks.clear();

    (snapshot.b || []).forEach(([p, q]) => {
      orderBook.bids.insert([Number(p), Number(q)]);
    });

    (snapshot.a || []).forEach(([p, q]) => {
      orderBook.asks.insert([Number(p), Number(q)]);
    });

    this.stats.bookSize = orderBook.bids.size;
    const end = process.hrtime.bigint();
    this.stats.snapshotCount++;
    this.stats.lastSnapshotTime = Number(end - start) / 1e6;
    this.stats.totalSnapshotTime += this.stats.lastSnapshotTime;
  }

  processDelta(pair, delta) {
    const start = process.hrtime.bigint();
    const orderBook = this.orderBooks.get(pair);

    if (delta.b?.length > 0) {
      delta.b.forEach(([p, q]) => {
        const price = Number(p);
        const size = Number(q);
        if (size === 0) {
          orderBook.bids.remove([price, orderBook.bids.find([price])?.[1]]);
        } else {
          const existing = orderBook.bids.find([price]);
          if (existing) orderBook.bids.remove(existing);
          orderBook.bids.insert([price, size]);
        }
      });
    }

    if (delta.a?.length > 0) {
      delta.a.forEach(([p, q]) => {
        const price = Number(p);
        const size = Number(q);
        if (size === 0) {
          orderBook.asks.remove([price, orderBook.asks.find([price])?.[1]]);
        } else {
          const existing = orderBook.asks.find([price]);
          if (existing) orderBook.asks.remove(existing);
          orderBook.asks.insert([price, size]);
        }
      });
    }

    this.stats.bookSize = orderBook.bids.size;
    const end = process.hrtime.bigint();
    this.stats.deltaCount++;
    this.stats.lastDeltaTime = Number(end - start) / 1e6;
    this.stats.totalDeltaTime += this.stats.lastDeltaTime;
  }

  getOrderBook(pair, depth = 200) {
    const start = process.hrtime.bigint();
    const book = this.orderBooks.get(pair);
    
    const bids = [];
    const asks = [];
    
    const bidIter = book.bids.iterator();
    let bid = bidIter.next();
    for (let i = 0; i < depth && bid; i++) {
      bids.push({ price: bid[0], size: bid[1] });
      bid = bidIter.next();
    }
    
    const askIter = book.asks.iterator();
    let ask = askIter.next();
    for (let i = 0; i < depth && ask; i++) {
      asks.push({ price: ask[0], size: ask[1] });
      ask = askIter.next();
    }
    
    const result = { bids, asks, ts: Date.now() };
    
    const end = process.hrtime.bigint();
    this.stats.getOrderBookCount++;
    this.stats.getOrderBookTime += Number(end - start) / 1e6;
    
    return result;
  }

  getStats() {
    return {
      ...this.stats,
      avgSnapshotTime: this.stats.snapshotCount > 0 
        ? (this.stats.totalSnapshotTime / this.stats.snapshotCount).toFixed(3)
        : 0,
      avgDeltaTime: this.stats.deltaCount > 0 
        ? (this.stats.totalDeltaTime / this.stats.deltaCount).toFixed(3)
        : 0,
      avgGetOrderBookTime: this.stats.getOrderBookCount > 0 
        ? (this.stats.getOrderBookTime / this.stats.getOrderBookCount).toFixed(3)
        : 0,
        memoryUsage: process.memoryUsage()
    };
  }
}

async function connectWebSocket(orderBookManager) {
  const ws = new WebsocketClient({
    market: 'v5',
    testnet: false
  });

  ws.subscribeV5(['orderbook.200.ETHUSDT'], 'spot');
  
  ws.on('update', (data) => {
    if (!data?.data?.s) return;
    
    const pair = data.data.s;
    if (data.type === 'snapshot') {
      orderBookManager.processSnapshot(pair, data.data);
    } else if (data.type === 'delta') {
      orderBookManager.processDelta(pair, data.data);
      orderBookManager.getOrderBook(pair);
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err));
  ws.on('open', () => console.log('WebSocket connected'));

  return ws;
}

(async () => {
  try {
    const orderBookManager = new OrderBookManager();
    orderBookManager.initialize(['ETHUSDT']);
    const ws = await connectWebSocket(orderBookManager);

    setInterval(() => {
      const stats = orderBookManager.getStats();
      console.log('\n--- Performance Statistics ---');
      console.log(`Book Size: ${stats.bookSize} levels`);
      console.log(`Snapshots: ${stats.snapshotCount} (Avg: ${stats.avgSnapshotTime}ms)`);
      console.log(`Deltas: ${stats.deltaCount} (Avg: ${stats.avgDeltaTime}ms)`);
      console.log(`Queries: 200 (Avg: ${stats.avgGetOrderBookTime}ms)`);
      console.log('Memory Usage:');
      console.log(`- RSS: ${(stats.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`);
      console.log(`- Heap Total: ${(stats.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`);
      console.log(`- Heap Used: ${(stats.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log('----------------------------\n');
    }, 5000);


  } catch (err) {
    console.error('Failed to initialize:', err);
    process.exit(1);
  }
})();