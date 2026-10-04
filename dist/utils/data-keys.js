/**
 * @fileoverview Objects keyed by values from the API
 *
 * A count by rule action or alarm type, or a list by group value, is keyed
 * by text the API or the network sets. In a plain `{}`, a key such as
 * `toString` or `constructor` reads the inherited method, so
 * `(acc[key] || 0) + 1` counted "function toString() ... 1", and assigning
 * `__proto__` changed the object's prototype instead of adding a key.
 */
/**
 * An empty object with no prototype, for counts or lists keyed by values
 * from the API: every key, `__proto__` included, is only a key. It
 * serializes as a plain object does.
 */
export function keyedByData() {
    return Object.create(null);
}
//# sourceMappingURL=data-keys.js.map