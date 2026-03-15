// ==========================================
// dashboard-bids/constants.js — Shared constants & mutable state
// ==========================================

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ITEMS_PER_PAGE = 25;

let bidTrackerInterval = null;
let bidTrackerLoaded = false;
