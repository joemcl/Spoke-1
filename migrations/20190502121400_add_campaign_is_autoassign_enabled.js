// Add is_autoassign_enabled column to campaign
exports.up = function(knex) {
  return knex.schema.alterTable("campaign", table => {
    table
      .boolean("is_autoassign_enabled")
      .notNullable()
      .defaultTo(false);
  });
};

// Drop is_autoassign_enabled column from campaign
exports.down = function(knex) {
  return knex.schema.alterTable("campaign", table => {
    table.dropColumn("is_autoassign_enabled");
  });
};
