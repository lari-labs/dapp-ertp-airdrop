/**
 * A Value consumed and produced by the Container `map's function.
 *
 * @typedef {any} Value
 */

/**
 * @typedef {object} ADT
 * @property {function(function(Value): Value): ADT} map map transforms
 * @property {function(): string} toString Our custom stringification
 *   of the object.
 */

/**
 * Creates a chainable container.
 *
 * This function allows us to chain map() invocations in a composable
 * way, and, if desired, unbox the value using fold().
 *
 * @sig Value -> ADT
 *
 * @param {Value} val
 * @returns {ADT}
 *
 * @example
 * Box('YODA')
 *   .map(s => s.toLowerCase())
 *   .map(s => s.split(''))
 *   .fold(s => s.join('-'))
 * // → 'y-o-d-a'
 */

/**
 * @typedef {object} NatInstance
 * Represents a natural number with semigroup concatenation capabilities.
 *
 * @property {import('@agoric/ertp/src/types.js').NatValue} value - The integer value of the natural number.
 * @property {function(NatInstance): NatInstance} concat - A binary function
 *           that takes another NatInstance and returns the sum NatInstance holding the
 * @property {function(): import('@agoric/ertp/src/types.js').NatValue} fold - A function that returns the integer
 *           value contained in the NatInstance.
 * @property {function(): string} inspect - A function that returns a string representation of the NatInstance.
 */

/**
 * @typedef {object} EpochDetails
 * @property {bigint} windowLength Length of epoch in seconds. This value is used by the contract's timerService to schedule a wake up that will fire once all of the seconds in an epoch have elapsed
 * @property {import('@agoric/ertp/src/types.js').NatValue} tokenQuantity The total number of tokens recieved by each user who claims during a particular epoch.
 * @property {bigint} index The index of a particular epoch.
 * @property {number} inDays Length of epoch formatted in total number of days
 */
