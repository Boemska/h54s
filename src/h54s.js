/* global h54s: true */

/*
* Represents html5 for sas adapter
* @constructor
*
*@param {object} config - adapter config object, with keys like url, debug, etc.
*
*/
var h54s = function(config) {

  //default config values
  this.maxXhrRetries    = 5;
  this.url              = "/SASStoredProcess/do";
  this.debug            = false;
  this.loginUrl         = '/SASLogon/Logon.do';
  this.retryAfterLogin  = true;
  this.sasApp           = 'Stored Process Web App 9.3';
  this.ajaxTimeout      = 30000;

  this._pendingCalls    = [];

  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // '/base/test/h54sConfig.json' is for the testing with karma
    //replaced with grunt concat in build
    this._utils.ajax.get('/base/test/h54sConfig.json').success(function(res) {
      var remoteConfig = JSON.parse(res.responseText);

      for(var key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && config[key] === undefined && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      //execute calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        var pendingCall = self._pendingCalls.shift();
        var sasProgram  = pendingCall.sasProgram;
        var callback    = pendingCall.callback;
        var params      = pendingCall.params;
        self.call(sasProgram, null, callback, params);
      }
    }).error(function (err) {
      throw new h54s.Error('ajaxError', 'Remote config file cannot be loaded. Http status code: ' + err.status);
    });
  } else {
    _setConfig.call(this, config);
  }
};

/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*
*/
h54s.Error = function(type, message) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message  = message;
  this.type     = type;
};

h54s.Error.prototype = Object.create(Error.prototype);

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} message - macro name
*
*/
h54s.Tables = function(table, macroName) {
  this._tables = {};

  this.add(table, macroName);
};

function _setConfig(config) {
  if(!config) {
    return;
  } else if(typeof config !== 'object') {
    throw new h54s.Error('argumentError', 'First parameter should be config object');
  }

  //merge config object from parameter with this
  for(var key in config) {
    if(config.hasOwnProperty(key)) {
      if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
        config[key] = '/' + config[key];
      }
      this[key] = config[key];
    }
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

  this._utils.ajax.setTimeout(this.ajaxTimeout);
}
