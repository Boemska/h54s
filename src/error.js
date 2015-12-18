/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*
*/
module.exports = function TypeError(type, message) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message  = message;
  this.type     = type;
};

TypeError.prototype = Object.create(Error.prototype);
