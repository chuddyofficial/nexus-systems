// Discord snowflake IDs are 64-bit integers, always numeric and 15-21 digits
// in practice. Used to validate any user/channel/role/guild ID coming from
// request bodies before it's passed to the Discord API or a SQL query.
function isSnowflake(value) {
  return typeof value === 'string' && /^\d{15,21}$/.test(value);
}

module.exports = { isSnowflake };
