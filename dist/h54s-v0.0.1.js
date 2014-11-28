/*! h54s v0.0.1 - 2014-11-28 
 *  License: GPL 
 * Author: Boemska 
*/
var config = {

};

h54s = function(config) {
  if(!config) {
    throw new Error('You must provide config object.');
  }
  if(!config.url) {
    throw new Error('You must provide "url" parameter.');
  }
};

h54s.prototype.call = function() {

};
