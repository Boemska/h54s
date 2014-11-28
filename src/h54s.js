h54s = function(config) {
  if(!config) {
    throw new Error('You must provide config object.');
  }
  if(!config.url) {
    throw new Error('You must provide "url" parameter.');
  }
};
