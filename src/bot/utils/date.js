/**
 * SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS" in UTC without a
 * timezone marker. Normalize to ISO-8601 so `new Date(...)` parses it as UTC
 * instead of local time.
 */
function toDate(sqliteTimestamp) {
  if (!sqliteTimestamp) return new Date();
  return new Date(sqliteTimestamp.replace(' ', 'T') + 'Z');
}

module.exports = { toDate };
