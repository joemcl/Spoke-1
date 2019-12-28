import humps from "humps";
import moment from "moment-timezone";

/**
 * Returns resolvers mapping GraphQL-style properties to their Postgres-style columns
 * @param {string[]} gqlKeys The lower camel case GraphQL keys to map
 */
export const sqlResolvers = gqlKeys =>
  gqlKeys.reduce((accumulator, gqlKey) => {
    const sqlKey = humps.decamelize(gqlKey, { separator: "_" });
    const resolver = instance => instance[sqlKey];
    return Object.assign(accumulator, { [gqlKey]: resolver });
  }, {});

export const capitalizeWord = word => {
  if (word) {
    return word[0].toUpperCase() + word.slice(1);
  }
  return "";
};

/**
 * Return the UTC offset in hours for a time zone.
 * @param {string} timezoneName The timezone name
 * @returns {number} UTC offset in hours
 */
export const getTzOffset = timezoneName => {
  // POSIX compatibility requires that the offsets are inverted
  // See: https://momentjs.com/timezone/docs/#/zone-object/offset/
  return moment.tz.zone(timezoneName).utcOffset(Date.now()) / -60;
};
