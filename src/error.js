/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*
*/
function h54sError(type, message) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message  = message;
  this.type     = type;
};

h54sError.prototype = Object.create(Error.prototype);

module.exports = h54sError;
