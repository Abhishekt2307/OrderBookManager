# OrderBookManager

#  Crypto Order Book Performance: RB Tree vs Merge-Interval

This project compares two approaches for managing a real-time local order book:
1. **RB Tree-based implementation** (`orderbook.Btree.js`)
2. **Merge-Interval-based implementation** (`orderbook.merge.js`)

The goal is to evaluate which data structure performs better for handling snapshot + delta updates (e.g., from Bybit) and retrieving the top order book levels efficiently.


## Project Structure
.
├── orderbook.Btree.js       # Order book using Red-Black Tree logic
├── orderbook.merge.js       # Order book using merge interval strategy
├── package.json             # Project metadata and dependencies
├── package-lock.json        # Exact dependency versions (auto-generated)
└── .gitignore               # Files and folders to exclude from git

#How to Run

# Install dependencies (if any are defined)
npm install
# Add your bybit key and secret in both orderbook.Btree.js and orderbook.merge.js

# Run either of the implementations
node orderbook.Btree.js
# OR
node orderbook.merge.js


⚙️ What This Project Demonstrates
🔁 Real-time snapshot and delta handling

🧠 Data structure performance trade-offs

📈 Merge vs Tree in terms of update and retrieval speed

🔒 Optimized for Bybit-like sorted data streams

🧪 Benchmark Summary
Dataset: 50,000 deltas × 120 entries/update on a 200-depth book

Result:

Merge strategy is ~14× faster for get operations

Merge strategy is ~2.65× faster for updates

Combined: ~3.7× performance boost
