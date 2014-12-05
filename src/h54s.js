/*
* Represents html5 for sas adapter
* @constructor
*
*@param {object} config - adapter config object, with keys like url, debug, sasService, etc.
*
*/
h54s = function(config) {

  this.systemtype = "SAS";
  this.counters   =  {
    maxXhrRetries: 5, // this is the number of times that xhrs retry before failing
    finishedXhrCount: 0, // leave as 0
    totalXhrCount: 0 // leave as 0
  };
  this.sasService = 'default';
  this.url        = "/SASStoredProcess/do";
  this.debug      = false;
  this.loginUrl   = '/SASLogon/Logon.do';
  this.sasParams  = [];
  this.autoLogin  = false;


  if(!config) {
    return;
  }

  //merge config argument config
  for(var key in config) {
    if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
      config[key] = '/' + config[key];
    }
    this[key] = config[key];
  }

  //if server is remote use the full server url
  //NOTE: this is not permited by the same-origin policy
  if(config.hostUrl) {
    if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
      config.hostUrl = config.hostUrl.slice(0, -1);
    }
    this.hostUrl  = config.hostUrl;
    this.url      = config.hostUrl + this.url;
    this.loginUrl = config.hostUrl + this.loginUrl;
  }
};

h54s.Error = function(type, message) {
  Error.captureStackTrace(this);
  this.message = message;
  this.type = type;
};

h54s.Error.prototype = Object.create(Error.prototype);
