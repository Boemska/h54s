(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
  this.message = message;
  this.type    = type;
}

h54sError.prototype = Object.create(Error.prototype, {
  constructor: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: h54sError
  },
  name: {
    configurable: false,
    enumerable: false,
    writable: false,
    value: 'h54sError'
  }
});

module.exports = h54sError;

},{}],2:[function(require,module,exports){
var h54sError = require('./error.js');

/*
* Represents html5 for sas adapter
* @constructor
*
*@param {object} config - adapter config object, with keys like url, debug, etc.
*
*/
var h54s = module.exports = function(config) {

  //default config values
  this.maxXhrRetries    = 5;
  this.url              = "/SASStoredProcess/do";
  this.debug            = false;
  this.loginUrl         = '/SASLogon/Logon.do';
  this.retryAfterLogin  = true;
  this.sasApp           = 'Stored Process Web App 9.3';
  this.ajaxTimeout      = 30000;

  this.remoteConfigUpdateCallbacks = [];

  this._pendingCalls    = [];

  if(config && config.isRemoteConfig) {
    var self = this;

    this._disableCalls = true;

    // '/base/test/h54sConfig.json' is for the testing with karma
    //replaced with gulp in dev build
    this._utils.ajax.get('h54sConfig.json').success(function(res) {
      var remoteConfig = JSON.parse(res.responseText);

      for(var key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && config[key] === undefined && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      //execute callbacks when we have remote config
      //note that remote conifg is merged with instance config
      for(var i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        var fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      //execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        var pendingCall = self._pendingCalls.shift();
        var sasProgram  = pendingCall.sasProgram;
        var callback    = pendingCall.callback;
        var params      = pendingCall.params;

        //update program with metadataRoot if it's not set
        if(self.metadataRoot && pendingCall.params._program.indexOf(self.metadataRoot) === -1) {
          pendingCall.params._program = self.metadataRoot.replace(/\/?$/, '/') + pendingCall.params._program.replace(/^\//, '');
        }

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callback, params);
      }
    }).error(function (err) {
      throw new h54sError('ajaxError', 'Remote config file cannot be loaded. Http status code: ' + err.status);
    });
  } else {
    _setConfig.call(this, config);
  }

  // private function to set h54s instance properties
  function _setConfig(config) {
    this._utils.ajax = require('./methods/ajax.js')();

    if(!config) {
      this._utils.ajax.setTimeout(this.ajaxTimeout);
      return;
    } else if(typeof config !== 'object') {
      throw new h54sError('argumentError', 'First parameter should be config object');
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
};

//replaced with gulp
h54s.version = '0.8.0';


h54s.prototype = require('./methods/methods.js');

h54s.Tables = require('./tables/tables.js');

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./ie_polyfills.js":3,"./methods/ajax.js":5,"./methods/methods.js":6,"./tables/tables.js":8}],3:[function(require,module,exports){
module.exports = function() {
  if (!Object.create) {
    Object.create = function(proto, props) {
      if (typeof props !== "undefined") {
        throw "The multiple-argument version of Object.create is not provided by this browser and cannot be shimmed.";
      }
      function ctor() { }
      ctor.prototype = proto;
      return new ctor();
    };
  }


  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/keys
  if (!Object.keys) {
    Object.keys = (function () {
      'use strict';
      var hasOwnProperty = Object.prototype.hasOwnProperty,
          hasDontEnumBug = !({toString: null}).propertyIsEnumerable('toString'),
          dontEnums = [
            'toString',
            'toLocaleString',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'constructor'
          ],
          dontEnumsLength = dontEnums.length;

      return function (obj) {
        if (typeof obj !== 'object' && (typeof obj !== 'function' || obj === null)) {
          throw new TypeError('Object.keys called on non-object');
        }

        var result = [], prop, i;

        for (prop in obj) {
          if (hasOwnProperty.call(obj, prop)) {
            result.push(prop);
          }
        }

        if (hasDontEnumBug) {
          for (i = 0; i < dontEnumsLength; i++) {
            if (hasOwnProperty.call(obj, dontEnums[i])) {
              result.push(dontEnums[i]);
            }
          }
        }
        return result;
      };
    }());
  }

  // From https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/lastIndexOf
  if (!Array.prototype.lastIndexOf) {
    Array.prototype.lastIndexOf = function(searchElement /*, fromIndex*/) {
      'use strict';

      if (this === void 0 || this === null) {
        throw new TypeError();
      }

      var n, k,
        t = Object(this),
        len = t.length >>> 0;
      if (len === 0) {
        return -1;
      }

      n = len - 1;
      if (arguments.length > 1) {
        n = Number(arguments[1]);
        if (n != n) {
          n = 0;
        }
        else if (n !== 0 && n != (1 / 0) && n != -(1 / 0)) {
          n = (n > 0 || -1) * Math.floor(Math.abs(n));
        }
      }

      for (k = n >= 0 ? Math.min(n, len - 1) : len - Math.abs(n); k >= 0; k--) {
        if (k in t && t[k] === searchElement) {
          return k;
        }
      }
      return -1;
    };
  }
}();

},{}],4:[function(require,module,exports){
var logs = {
  applicationLogs: [],
  debugData: [],
  sasErrors: [],
  failedRequests: []
};

var limits = {
  applicationLogs: 100,
  debugData: 20,
  failedRequests: 20,
  sasErrors: 100
};

module.exports.get = {
  getSasErrors: function() {
    return logs.sasErrors;
  },
  getApplicationLogs: function() {
    return logs.applicationLogs;
  },
  getDebugData: function() {
    return logs.debugData;
  },
  getFailedRequests: function() {
    return logs.failedRequests;
  }
};

module.exports.clear = {
  clearApplicationLogs: function() {
    logs.applicationLogs.splice(0, logs.applicationLogs.length);
  },
  clearDebugData: function() {
    logs.debugData.splice(0, logs.debugData.length);
  },
  clearSasErrors: function() {
    logs.sasErrors.splice(0, logs.sasErrors.length);
  },
  clearFailedRequests: function() {
    logs.failedRequests.splice(0, logs.failedRequests.length);
  },
  clearAllLogs: function() {
    this.clearApplicationLogs();
    this.clearDebugData();
    this.clearSasErrors();
    this.clearFailedRequests();
  }
};

/*
* Adds application logs to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addApplicationLog = function(message, sasProgram) {
  if(message === 'blank') {
    return;
  }
  var log = {
    message:    message,
    time:       new Date(),
    sasProgram: sasProgram
  };
  logs.applicationLogs.push(log);

  if(logs.applicationLogs.length > limits.applicationLogs) {
    logs.applicationLogs.shift();
  }
};

/*
* Adds debug data to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addDebugData = function(htmlData, debugText, sasProgram, params) {
  logs.debugData.push({
    debugHtml:  htmlData,
    debugText:  debugText,
    sasProgram: sasProgram,
    params:     params,
    time:       new Date()
  });

  if(logs.debugData.length > limits.debugData) {
    logs.debugData.shift();
  }
};

/*
* Adds failed requests to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addFailedRequest = function(responseText, debugText, sasProgram) {
  logs.failedRequests.push({
    responseHtml: responseText,
    responseText: debugText,
    sasProgram:   sasProgram,
    time:         new Date()
  });

  //max 20 failed requests
  if(logs.failedRequests.length > limits.failedRequests) {
    logs.failedRequests.shift();
  }
};

/*
* Adds SAS errors to an array of logs
*
* @param {string} res - server response
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],5:[function(require,module,exports){
module.exports = function() {
  var timeout = 30000;
  var timeoutHandle;

  var xhr = function(type, url, data) {
    var methods = {
      success: function() {},
      error:   function() {}
    };
    var XHR     = XMLHttpRequest || ActiveXObject;
    var request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);
    request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    request.onreadystatechange = function () {
      if (request.readyState === 4) {
        clearTimeout(timeoutHandle);
        if (request.status >= 200 && request.status < 300) {
          methods.success.call(methods, request);
        } else {
          methods.error.call(methods, request);
        }
      }
    };

    if(timeout > 0) {
      timeoutHandle = setTimeout(function() {
        request.abort();
      }, timeout);
    }

    request.send(data);

    return {
      success: function (callback) {
        methods.success = callback;
        return this;
      },
      error: function (callback) {
        methods.error = callback;
        return this;
      }
    };
  };

  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        if(obj[p] instanceof Array) {
          for(var i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    return str.join("&");
  };

  return {
    get: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      var urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams);
    },
    post: function(url, data) {
      var dataStr;
      if(typeof data === 'object') {
        dataStr = serialize(data);
      }
      return xhr('POST', url, dataStr);
    },
    setTimeout: function(t) {
      timeout = t;
    }
  };
};

},{}],6:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.call = function(sasProgram, tablesObj, callback, params) {
  var self        = this;
  var retryCount  = 0;
  var dbg         = this.debug;

  if (!callback || typeof callback !== 'function'){
    throw new h54sError('argumentError', 'You must provide callback');
  }
  if(!sasProgram) {
    throw new h54sError('argumentError', 'You must provide Sas program file path');
  }
  if(typeof sasProgram !== 'string') {
    throw new h54sError('argumentError', 'First parameter should be string');
  }

  if(!params) {
    params = {
      _program: this.metadataRoot ? this.metadataRoot.replace(/\/?$/, '/') + sasProgram.replace(/^\//, '') : sasProgram,
      _debug:   this.debug ? 131 : 0,
      _service: 'default',
    };
  }

  if(tablesObj) {
    if(tablesObj instanceof h54s.Tables) {
      for(var key in tablesObj._tables) {
        if(tablesObj._tables.hasOwnProperty(key)) {
          params[key] = tablesObj._tables[key];
        }
      }
    } else {
      throw new h54sError('argumentError', 'Wrong type of tables object');
    }
  }

  if(this._disableCalls) {
    this._pendingCalls.push({
      sasProgram: sasProgram,
      callback:   callback,
      params:     params
    });
    return;
  }

  this._utils.ajax.post(this.url, params).success(function(res) {
    if(self._utils.needToLogin.call(self, res)) {
      //remember the call for latter use
      self._pendingCalls.push({
        sasProgram: sasProgram,
        callback:   callback,
        params:     params
      });

      //there's no need to continue if previous call returned login error
      if(self._disableCalls) {
        return;
      } else {
        self._disableCalls = true;
      }

      try {
        var sasAppMatches = res.responseURL.match(/_sasapp=([^&]*)/);
        self.sasApp = sasAppMatches[1].replace(/\+/g, ' ');
      } catch(e) {
        logs.addApplicationLog('Cannot extract _sasapp parameter from login URL');
      }

      callback(new h54sError('notLoggedinError', 'You are not logged in'));
    } else {
      var resObj, unescapedResObj;
      if(!dbg) {
        try {
          //remove new lines in json response
          resObj          = JSON.parse(res.responseText.replace(/(\r\n|\r|\n)/g, ''));
          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);

          logs.addApplicationLog(resObj.logmessage, sasProgram);
          callback(undefined, unescapedResObj);
        } catch(e) {
          if(e instanceof SyntaxError) {
            if(retryCount < self.maxXhrRetries) {
              self._utils.ajax.post(self.url, params).success(this.success).error(this.error);
              retryCount++;
              logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
            } else {
              self._utils.parseErrorResponse(res.responseText, sasProgram);
              self._utils.addFailedResponse(res.responseText, sasProgram);
              callback(new h54sError('parseError', 'Unable to parse response json'));
            }
          } else {
            var err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            callback(err);
          }
        }
      } else {
        try {
          resObj          = self._utils.parseDebugRes(res.responseText, sasProgram, params);
          resObj          = self._utils.convertDates(resObj);
          unescapedResObj = self._utils.unescapeValues(resObj);

          logs.addApplicationLog(resObj.logmessage);
          if(resObj.hasErrors) {
            callback(new h54sError('sasError', 'Sas program completed with errors'), unescapedResObj);
          } else {
            callback(undefined, unescapedResObj);
          }
        } catch(e) {
          if(e instanceof SyntaxError) {
            self._utils.parseErrorResponse(res.responseText, sasProgram);
            callback(new h54sError('parseError', e.message));
          } else {
            var err = new h54sError('unknownError', e.message);
            err.stack = e.stack;
            callback(err);
          }
        }
      }
    }
  }).error(function(res) {
    logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
    callback(new h54sError('httpError', res.statusText));
  });
};

/*
* Login method
*
* @param {string} user - Login username
* @param {string} pass - Login password
* @param {function} callback - Callback function called when ajax call is finished
*
* OR
*
* @param {function} callback - Callback function called when ajax call is finished
*
*/
module.exports.login = function(user, pass, callback) {
  var self = this;

  if(!user || !pass) {
    throw new h54sError('argumentError', 'Credentials not set');
  }
  if(typeof user !== 'string' || typeof pass !== 'string') {
    throw new h54sError('argumentError', 'User and pass parameters must be strings');
  }
  //NOTE: callback optional?
  if(!callback || typeof callback !== 'function') {
    throw new h54sError('argumentError', 'You must provide callback');
  }

  var loginParams = {
    _sasapp: self.sasApp,
    _service: 'default',
    ux: user,
    px: pass,
    //for SAS 9.4,
    username: user,
    password: pass
  };

  for (var key in this._aditionalLoginParams) {
    loginParams[key] = this._aditionalLoginParams[key];
  }

  this._utils.ajax.post(this.loginUrl, loginParams).success(function(res) {
    if(self._utils.needToLogin.call(self, res)) {
      //we are getting form again after redirect
      //and need to login again using the new url
      //_loginChanged is set in needToLogin function
      //but if login url is not different, we are checking if there are aditional parameters
      if(self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
        delete self._loginChanged;

        var inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
        if(inputs) {
          inputs.forEach(function(inputStr) {
            var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
            loginParams[valueMatch[1]] = valueMatch[2];
          });
        }

        self._utils.ajax.post(self.loginUrl, loginParams).success(this.success).error(this.error);
      } else {
        //getting form again, but it wasn't a redirect
        logs.addApplicationLog('Wrong username or password');
        callback(-1);
      }
    } else {
      callback(res.status);

      self._disableCalls = false;

      while(self._pendingCalls.length > 0) {
        var pendingCall     = self._pendingCalls.shift();
        var sasProgram      = pendingCall.sasProgram;
        var callbackPending = pendingCall.callback;
        var params          = pendingCall.params;

        //update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        if(self.retryAfterLogin) {
          self.call(sasProgram, null, callbackPending, params);
        }
      }
    }
  }).error(function(res) {
    //NOTE: error 502 if sasApp parameter is wrong
    logs.addApplicationLog('Login failed with status code: ' + res.status);
    callback(res.status);
  });
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function() {
  this.debug = true;
};

/*
* Exit debug mode
*
*/
module.exports.unsetDebugMode = function() {
  this.debug = false;
};

for(var key in logs.get) {
  if(logs.get.hasOwnProperty(key)) {
    module.exports[key] = logs.get[key];
  }
}

for(var key in logs.clear) {
  if(logs.clear.hasOwnProperty(key)) {
    module.exports[key] = logs.clear[key];
  }
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function(callback) {
  this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');

},{"../error.js":1,"../logs.js":4,"./utils.js":7}],7:[function(require,module,exports){
var logs = require('../logs.js');

/*
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseDebugRes = function(responseText, sasProgram, params) {
  //find json
  var patt          = /^(.?--h54s-data-start--)([\S\s]*)(--h54s-data-end--)/m;
  var matches       = responseText.match(patt);

  var page          = responseText.replace(patt, '');
  var htmlBodyPatt  = /<body.*>([\s\S]*)<\/body>/;
  var bodyMatches   = page.match(htmlBodyPatt);

  //remove html tags
  var debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
  debugText     = this.decodeHTMLEntities(debugText);

  logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  this.parseErrorResponse(responseText, sasProgram);

  //remove new lines in json response
  var jsonObj = JSON.parse(matches[2].replace(/(\r\n|\r|\n)/g, ''));
  if(debugText.indexOf('ERROR:') !== -1) {
    jsonObj.hasErrors = true;
  }

  return jsonObj;
};

/*
* Add failed response to logs - used only if debug=false
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
*
*/
module.exports.addFailedResponse = function(responseText, sasProgram) {
  var patt      = /<script([\s\S]*)\/form>/;
  var patt2     = /display\s?:\s?none;?\s?/;
  //remove script with form for toggling the logs and "display:none" from style
  responseText  = responseText.replace(patt, '').replace(patt2, '');
  var debugText = responseText.replace(/<[^>]*>/g, '');
  debugText = this.decodeHTMLEntities(debugText);

  logs.addFailedRequest(responseText, debugText, sasProgram);
};

/*
* Unescape all string values in returned object
*
* @param {object} obj
*
*/
module.exports.unescapeValues = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key]);
    } else if(typeof obj === 'object') {
      this.unescapeValues(obj[key]);
    }
  }
  return obj;
};

/*
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* #param {string} sasProgram - sas program which returned the response
*
*/
module.exports.parseErrorResponse = function(res, sasProgram) {
  var patt    = /ERROR(.*\.|.*\n.*\.)/g;
  var errors  = res.match(patt);
  if(!errors) {
    return;
  }

  var errMessage;
  for(var i = 0, n = errors.length; i < n; i++) {
    errMessage  = errors[i].replace(/<[^>]*>/g, '').replace(/(\n|\s{2,})/g, ' ');
    errMessage  = this.decodeHTMLEntities(errMessage);
    errors[i]   = {
      sasProgram: sasProgram,
      message:    errMessage,
      time:       new Date()
    };
  }

  logs.addSasErrors(errors);
};

/*
* Decode HTML entities
*
* @param {string} res - server response
*
*/
module.exports.decodeHTMLEntities = function (html) {
  var tempElement = document.createElement('span');
  var str         = html.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    function (str) {
      tempElement.innerHTML = str;
      str                   = tempElement.textContent || tempElement.innerText;
      return str;
    }
  );
  return str;
};

/*
* Convert sas time to javascript date
*
* @param {number} sasDate - sas Tate object
*
*/
module.exports.fromSasDateTime = function (sasDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = sasDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes

  // convert sas datetime to a current valid javascript date
  var basedateMs  = basedate.getTime(); // in ms
  var currdateMs  = currdate * 1000; // to ms
  var sasDatetime = currdateMs + basedateMs;
  var jsDate      = new Date();
  jsDate.setTime(sasDatetime); // first time to get offset BST daylight savings etc
  var currOffset  = jsDate.getTimezoneOffset(); // adjust for offset in minutes
  var offsetVar   = (baseOffset - currOffset) * 60 * 1000; // difference in milliseconds
  var offsetTime  = sasDatetime - offsetVar; // finding BST and daylight savings
  jsDate.setTime(offsetTime); // update with offset
  return jsDate;
};

/*
* Convert sas timestamps to javascript Date object
*
* @param {object} obj
*
*/
module.exports.convertDates = function(obj) {
  for (var key in obj) {
    if (typeof obj[key] === 'number' && (key.indexOf('dt_') === 0 || key.indexOf('DT_') === 0)) {
      obj[key] = this.fromSasDateTime(obj[key]);
    } else if(typeof obj === 'object') {
      this.convertDates(obj[key]);
    }
  }
  return obj;
};

module.exports.needToLogin = function(responseObj) {
  var patt = /<form.+action="(.*Logon[^"]*).*>/;
  var matches = patt.exec(responseObj.responseText);
  var newLoginUrl;

  if(!matches) {
    //there's no form, we are in. hooray!
    return false;
  } else {
    var actionUrl = matches[1].replace(/\?.*/, '');
    if(actionUrl.charAt(0) === '/') {
      newLoginUrl = this.hostUrl ? this.hostUrl + actionUrl : actionUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    } else {
      //relative path

      var lastIndOfSlash = responseObj.responseURL.lastIndexOf('/') + 1;
      //remove everything after the last slash, and everything until the first
      var relativeLoginUrl = responseObj.responseURL.substr(0, lastIndOfSlash).replace(/.*\/{2}[^\/]*/, '') + actionUrl;
      newLoginUrl = this.hostUrl ? this.hostUrl + relativeLoginUrl : relativeLoginUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    }

    //save parameters from hidden form fields
    var inputs = responseObj.responseText.match(/<input.*"hidden"[^>]*>/g);
    var hiddenFormParams = {};
    if(inputs) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      inputs.forEach(function(inputStr) {
        var valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
        hiddenFormParams[valueMatch[1]] = valueMatch[2];
      });
      this._aditionalLoginParams = hiddenFormParams;
    }

    return true;
  }
};

},{"../logs.js":4}],8:[function(require,module,exports){
var h54sError = require('../error.js');

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} message - macro name
*
*/
function Tables(table, macroName) {
  this._tables = {};

  this.add(table, macroName);
}

/*
* Add table to tables object
* @param {array} table - Array of table objects
* @param {string} macroName - Sas macro name
*
*/
Tables.prototype.add = function(table, macroName) {
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }
    if(!isNaN(macroName[macroName.length - 1])) {
      throw new h54sError('argumentError', 'Macro name cannot have number at the end');
    }
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  var result = this._utils.convertTableObject(table);

  var tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (var numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    var outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};

Tables.prototype._utils = require('./utils.js');

module.exports = Tables;

},{"../error.js":1,"./utils.js":9}],9:[function(require,module,exports){
var h54sError = require('../error.js');
var logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject) {
  var self            = this;
  var chunkThreshold  = 30000; // this goes to 30k for SAS

  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject is not an object');
  }

  var arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  var existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

  // function checkAndSetArray - this will check an inObject current key against the existing typeArray and either return -1 if there
  // is a type mismatch or add an element and update/increment the length if needed

  function checkAndIncrement(colSpec) {
    if (typeof (existingCols[colSpec.colName]) === 'undefined') {
      existingCols[colSpec.colName]           = {};
      existingCols[colSpec.colName].colName   = colSpec.colName;
      existingCols[colSpec.colName].colType   = colSpec.colType;
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1;
      return 0; // all ok
    }
    // check type match
    if (existingCols[colSpec.colName].colType !== colSpec.colType) {
      return -1; // there is a fudge in the typing
    }
    if (existingCols[colSpec.colName].colLength < colSpec.colLength) {
      existingCols[colSpec.colName].colLength = colSpec.colLength > 0 ? colSpec.colLength : 1; // increment the max length of this column
      return 0;
    }
  }
  var chunkArrayCount         = 0; // this is for keeping tabs on how long the current array string would be
  var targetArray             = []; // this is the array of target arrays
  var currentTarget           = 0;
  targetArray[currentTarget]  = [];
  var j                       = 0;
  for (var i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    var chunkRowCount             = 0;

    for (var key in inObject[i]) {
      var thisSpec  = {};
      var thisValue = inObject[i][key];

      //skip undefined values
      if(thisValue === undefined || thisValue === null) {
        continue;
      }

      //throw an error if there's NaN value
      if(typeof thisValue === 'number' && isNaN(thisValue)) {
        throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
      }

      if(thisValue === -Infinity || thisValue === Infinity) {
        throw new h54sError('typeError', thisValue.toString() + ' value in one of the values (columns) is not allowed');
      }

      if(thisValue === true || thisValue === false) {
        throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
      }

      // get type... if it is an object then convert it to json and store as a string
      var thisType  = typeof (thisValue);
      var isDate = thisValue instanceof Date;
      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string' && !isDate) { // straightforward string
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(isDate) {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'date';
        thisSpec.colLength                  = 8;
        targetArray[currentTarget][j][key]  = self.toSasDateTime(thisValue);
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].toString().length;
      } else if (thisType == 'object') {
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'json';
        thisSpec.colLength                  = JSON.stringify(thisValue).length;
        targetArray[currentTarget][j][key]  = encodeURIComponent(JSON.stringify(thisValue)).replace(/'/g, '%27');
        thisSpec.encodedLength              = targetArray[currentTarget][j][key].length;
      }

      chunkRowCount = chunkRowCount + 6 + key.length + thisSpec.encodedLength;

      if (checkAndIncrement(thisSpec) == -1) {
        throw new h54sError('typeError', 'There is a type mismatch in the array between values (columns) of the same name.');
      }
    }

    if (chunkRowCount > chunkThreshold) {
      throw new h54sError('argumentError', 'Row ' + j + ' exceeds size limit of 32kb');
    } else if(chunkArrayCount + chunkRowCount > chunkThreshold) {
      //create new array if this one is full and move the last item to the new array
      var lastRow = targetArray[currentTarget].pop(); // get rid of that last row
      currentTarget++; // move onto the next array
      targetArray[currentTarget]  = [lastRow]; // make it an array
      j                           = 0; // initialise new row counter for new array - it will be incremented at the end of the function
      chunkArrayCount             = chunkRowCount; // this is the new chunk max size
    } else {
      chunkArrayCount = chunkArrayCount + chunkRowCount;
    }
    j++;
  }

  // reformat existingCols into an array so sas can parse it;
  var specArray = [];
  for (var k in existingCols) {
    specArray.push(existingCols[k]);
  }
  return {
    spec:       specArray,
    data:       targetArray,
    jsonLength: chunkArrayCount
  }; // the spec will be the macro[0], with the data split into arrays of macro[1-n]
  // means in terms of dojo xhr object at least they need to go into the same array
};

/*
* Convert javascript date to sas time
*
* @param {object} jsDate - javascript Date object
*
*/
module.exports.toSasDateTime = function (jsDate) {
  var basedate = new Date("January 1, 1960 00:00:00");
  var currdate = jsDate;

  // offsets for UTC and timezones and BST
  var baseOffset = basedate.getTimezoneOffset(); // in minutes
  var currOffset = currdate.getTimezoneOffset(); // in minutes

  // convert currdate to a sas datetime
  var offsetSecs    = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
  var baseDateSecs  = basedate.getTime() / 1000; // get rid of ms
  var currdateSecs  = currdate.getTime() / 1000; // get rid of ms
  var sasDatetime   = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

  return sasDatetime;
};

},{"../error.js":1,"../logs.js":4}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9tZXRob2RzLmpzIiwic3JjL21ldGhvZHMvdXRpbHMuanMiLCJzcmMvdGFibGVzL3RhYmxlcy5qcyIsInNyYy90YWJsZXMvdXRpbHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKlxuKi9cbmZ1bmN0aW9uIGg1NHNFcnJvcih0eXBlLCBtZXNzYWdlKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbn1cblxuaDU0c0Vycm9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoRXJyb3IucHJvdG90eXBlLCB7XG4gIGNvbnN0cnVjdG9yOiB7XG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6IGg1NHNFcnJvclxuICB9LFxuICBuYW1lOiB7XG4gICAgY29uZmlndXJhYmxlOiBmYWxzZSxcbiAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICB3cml0YWJsZTogZmFsc2UsXG4gICAgdmFsdWU6ICdoNTRzRXJyb3InXG4gIH1cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGg1NHNFcnJvcjtcbiIsInZhciBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG5cbi8qXG4qIFJlcHJlc2VudHMgaHRtbDUgZm9yIHNhcyBhZGFwdGVyXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7b2JqZWN0fSBjb25maWcgLSBhZGFwdGVyIGNvbmZpZyBvYmplY3QsIHdpdGgga2V5cyBsaWtlIHVybCwgZGVidWcsIGV0Yy5cbipcbiovXG52YXIgaDU0cyA9IG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oY29uZmlnKSB7XG5cbiAgLy9kZWZhdWx0IGNvbmZpZyB2YWx1ZXNcbiAgdGhpcy5tYXhYaHJSZXRyaWVzICAgID0gNTtcbiAgdGhpcy51cmwgICAgICAgICAgICAgID0gXCIvU0FTU3RvcmVkUHJvY2Vzcy9kb1wiO1xuICB0aGlzLmRlYnVnICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5sb2dpblVybCAgICAgICAgID0gJy9TQVNMb2dvbi9Mb2dvbi5kbyc7XG4gIHRoaXMucmV0cnlBZnRlckxvZ2luICA9IHRydWU7XG4gIHRoaXMuc2FzQXBwICAgICAgICAgICA9ICdTdG9yZWQgUHJvY2VzcyBXZWIgQXBwIDkuMyc7XG4gIHRoaXMuYWpheFRpbWVvdXQgICAgICA9IDMwMDAwO1xuXG4gIHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzID0gW107XG5cbiAgdGhpcy5fcGVuZGluZ0NhbGxzICAgID0gW107XG5cbiAgaWYoY29uZmlnICYmIGNvbmZpZy5pc1JlbW90ZUNvbmZpZykge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cbiAgICAvLyAnL2Jhc2UvdGVzdC9oNTRzQ29uZmlnLmpzb24nIGlzIGZvciB0aGUgdGVzdGluZyB3aXRoIGthcm1hXG4gICAgLy9yZXBsYWNlZCB3aXRoIGd1bHAgaW4gZGV2IGJ1aWxkXG4gICAgdGhpcy5fdXRpbHMuYWpheC5nZXQoJy9iYXNlL3Rlc3QvaDU0c0NvbmZpZy5qc29uJykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICAgIHZhciByZW1vdGVDb25maWcgPSBKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQpO1xuXG4gICAgICBmb3IodmFyIGtleSBpbiByZW1vdGVDb25maWcpIHtcbiAgICAgICAgaWYocmVtb3RlQ29uZmlnLmhhc093blByb3BlcnR5KGtleSkgJiYgY29uZmlnW2tleV0gPT09IHVuZGVmaW5lZCAmJiBrZXkgIT09ICdpc1JlbW90ZUNvbmZpZycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9IHJlbW90ZUNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIF9zZXRDb25maWcuY2FsbChzZWxmLCBjb25maWcpO1xuXG4gICAgICAvL2V4ZWN1dGUgY2FsbGJhY2tzIHdoZW4gd2UgaGF2ZSByZW1vdGUgY29uZmlnXG4gICAgICAvL25vdGUgdGhhdCByZW1vdGUgY29uaWZnIGlzIG1lcmdlZCB3aXRoIGluc3RhbmNlIGNvbmZpZ1xuICAgICAgZm9yKHZhciBpID0gMCwgbiA9IHNlbGYucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICB2YXIgZm4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrc1tpXTtcbiAgICAgICAgZm4oKTtcbiAgICAgIH1cblxuICAgICAgLy9leGVjdXRlIHNhcyBjYWxscyBkaXNhYmxlZCB3aGlsZSB3YWl0aW5nIGZvciB0aGUgY29uZmlnXG4gICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcbiAgICAgIHdoaWxlKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHZhciBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuICAgICAgICB2YXIgc2FzUHJvZ3JhbSAgPSBwZW5kaW5nQ2FsbC5zYXNQcm9ncmFtO1xuICAgICAgICB2YXIgY2FsbGJhY2sgICAgPSBwZW5kaW5nQ2FsbC5jYWxsYmFjaztcbiAgICAgICAgdmFyIHBhcmFtcyAgICAgID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXG4gICAgICAgIC8vdXBkYXRlIHByb2dyYW0gd2l0aCBtZXRhZGF0YVJvb3QgaWYgaXQncyBub3Qgc2V0XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIHBlbmRpbmdDYWxsLnBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0gPSBzZWxmLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBwZW5kaW5nQ2FsbC5wYXJhbXMuX3Byb2dyYW0ucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgcGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFjaywgcGFyYW1zKTtcbiAgICAgIH1cbiAgICB9KS5lcnJvcihmdW5jdGlvbiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhamF4RXJyb3InLCAnUmVtb3RlIGNvbmZpZyBmaWxlIGNhbm5vdCBiZSBsb2FkZWQuIEh0dHAgc3RhdHVzIGNvZGU6ICcgKyBlcnIuc3RhdHVzKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBfc2V0Q29uZmlnLmNhbGwodGhpcywgY29uZmlnKTtcbiAgfVxuXG4gIC8vIHByaXZhdGUgZnVuY3Rpb24gdG8gc2V0IGg1NHMgaW5zdGFuY2UgcHJvcGVydGllc1xuICBmdW5jdGlvbiBfc2V0Q29uZmlnKGNvbmZpZykge1xuICAgIHRoaXMuX3V0aWxzLmFqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgICBpZighY29uZmlnKSB7XG4gICAgICB0aGlzLl91dGlscy5hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgY29uZmlnIG9iamVjdCcpO1xuICAgIH1cblxuICAgIC8vbWVyZ2UgY29uZmlnIG9iamVjdCBmcm9tIHBhcmFtZXRlciB3aXRoIHRoaXNcbiAgICBmb3IodmFyIGtleSBpbiBjb25maWcpIHtcbiAgICAgIGlmKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIGlmKChrZXkgPT09ICd1cmwnIHx8IGtleSA9PT0gJ2xvZ2luVXJsJykgJiYgY29uZmlnW2tleV0uY2hhckF0KDApICE9PSAnLycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9ICcvJyArIGNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNba2V5XSA9IGNvbmZpZ1trZXldO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vaWYgc2VydmVyIGlzIHJlbW90ZSB1c2UgdGhlIGZ1bGwgc2VydmVyIHVybFxuICAgIC8vTk9URTogdGhpcyBpcyBub3QgcGVybWl0ZWQgYnkgdGhlIHNhbWUtb3JpZ2luIHBvbGljeVxuICAgIGlmKGNvbmZpZy5ob3N0VXJsKSB7XG4gICAgICBpZihjb25maWcuaG9zdFVybC5jaGFyQXQoY29uZmlnLmhvc3RVcmwubGVuZ3RoIC0gMSkgPT09ICcvJykge1xuICAgICAgICBjb25maWcuaG9zdFVybCA9IGNvbmZpZy5ob3N0VXJsLnNsaWNlKDAsIC0xKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuaG9zdFVybCAgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIHRoaXMudXJsICAgICAgPSBjb25maWcuaG9zdFVybCArIHRoaXMudXJsO1xuICAgICAgdGhpcy5sb2dpblVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy5sb2dpblVybDtcbiAgICB9XG5cbiAgICB0aGlzLl91dGlscy5hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vcmVwbGFjZWQgd2l0aCBndWxwXG5oNTRzLnZlcnNpb24gPSAnX192ZXJzaW9uX18nO1xuXG5cbmg1NHMucHJvdG90eXBlID0gcmVxdWlyZSgnLi9tZXRob2RzL21ldGhvZHMuanMnKTtcblxuaDU0cy5UYWJsZXMgPSByZXF1aXJlKCcuL3RhYmxlcy90YWJsZXMuanMnKTtcblxuLy9zZWxmIGludm9rZWQgZnVuY3Rpb24gbW9kdWxlXG5yZXF1aXJlKCcuL2llX3BvbHlmaWxscy5qcycpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCFPYmplY3QuY3JlYXRlKSB7XG4gICAgT2JqZWN0LmNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvLCBwcm9wcykge1xuICAgICAgaWYgKHR5cGVvZiBwcm9wcyAhPT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICB0aHJvdyBcIlRoZSBtdWx0aXBsZS1hcmd1bWVudCB2ZXJzaW9uIG9mIE9iamVjdC5jcmVhdGUgaXMgbm90IHByb3ZpZGVkIGJ5IHRoaXMgYnJvd3NlciBhbmQgY2Fubm90IGJlIHNoaW1tZWQuXCI7XG4gICAgICB9XG4gICAgICBmdW5jdGlvbiBjdG9yKCkgeyB9XG4gICAgICBjdG9yLnByb3RvdHlwZSA9IHByb3RvO1xuICAgICAgcmV0dXJuIG5ldyBjdG9yKCk7XG4gICAgfTtcbiAgfVxuXG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3Qva2V5c1xuICBpZiAoIU9iamVjdC5rZXlzKSB7XG4gICAgT2JqZWN0LmtleXMgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgJ3VzZSBzdHJpY3QnO1xuICAgICAgdmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxcbiAgICAgICAgICBoYXNEb250RW51bUJ1ZyA9ICEoe3RvU3RyaW5nOiBudWxsfSkucHJvcGVydHlJc0VudW1lcmFibGUoJ3RvU3RyaW5nJyksXG4gICAgICAgICAgZG9udEVudW1zID0gW1xuICAgICAgICAgICAgJ3RvU3RyaW5nJyxcbiAgICAgICAgICAgICd0b0xvY2FsZVN0cmluZycsXG4gICAgICAgICAgICAndmFsdWVPZicsXG4gICAgICAgICAgICAnaGFzT3duUHJvcGVydHknLFxuICAgICAgICAgICAgJ2lzUHJvdG90eXBlT2YnLFxuICAgICAgICAgICAgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJyxcbiAgICAgICAgICAgICdjb25zdHJ1Y3RvcidcbiAgICAgICAgICBdLFxuICAgICAgICAgIGRvbnRFbnVtc0xlbmd0aCA9IGRvbnRFbnVtcy5sZW5ndGg7XG5cbiAgICAgIHJldHVybiBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JyAmJiAodHlwZW9mIG9iaiAhPT0gJ2Z1bmN0aW9uJyB8fCBvYmogPT09IG51bGwpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignT2JqZWN0LmtleXMgY2FsbGVkIG9uIG5vbi1vYmplY3QnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByZXN1bHQgPSBbXSwgcHJvcCwgaTtcblxuICAgICAgICBmb3IgKHByb3AgaW4gb2JqKSB7XG4gICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKSkge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2gocHJvcCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGhhc0RvbnRFbnVtQnVnKSB7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGRvbnRFbnVtc0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGRvbnRFbnVtc1tpXSkpIHtcbiAgICAgICAgICAgICAgcmVzdWx0LnB1c2goZG9udEVudW1zW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgIH07XG4gICAgfSgpKTtcbiAgfVxuXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvQXJyYXkvbGFzdEluZGV4T2ZcbiAgaWYgKCFBcnJheS5wcm90b3R5cGUubGFzdEluZGV4T2YpIHtcbiAgICBBcnJheS5wcm90b3R5cGUubGFzdEluZGV4T2YgPSBmdW5jdGlvbihzZWFyY2hFbGVtZW50IC8qLCBmcm9tSW5kZXgqLykge1xuICAgICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgICBpZiAodGhpcyA9PT0gdm9pZCAwIHx8IHRoaXMgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcigpO1xuICAgICAgfVxuXG4gICAgICB2YXIgbiwgayxcbiAgICAgICAgdCA9IE9iamVjdCh0aGlzKSxcbiAgICAgICAgbGVuID0gdC5sZW5ndGggPj4+IDA7XG4gICAgICBpZiAobGVuID09PSAwKSB7XG4gICAgICAgIHJldHVybiAtMTtcbiAgICAgIH1cblxuICAgICAgbiA9IGxlbiAtIDE7XG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgbiA9IE51bWJlcihhcmd1bWVudHNbMV0pO1xuICAgICAgICBpZiAobiAhPSBuKSB7XG4gICAgICAgICAgbiA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAobiAhPT0gMCAmJiBuICE9ICgxIC8gMCkgJiYgbiAhPSAtKDEgLyAwKSkge1xuICAgICAgICAgIG4gPSAobiA+IDAgfHwgLTEpICogTWF0aC5mbG9vcihNYXRoLmFicyhuKSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChrID0gbiA+PSAwID8gTWF0aC5taW4obiwgbGVuIC0gMSkgOiBsZW4gLSBNYXRoLmFicyhuKTsgayA+PSAwOyBrLS0pIHtcbiAgICAgICAgaWYgKGsgaW4gdCAmJiB0W2tdID09PSBzZWFyY2hFbGVtZW50KSB7XG4gICAgICAgICAgcmV0dXJuIGs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG59KCk7XG4iLCJ2YXIgbG9ncyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiBbXSxcbiAgZGVidWdEYXRhOiBbXSxcbiAgc2FzRXJyb3JzOiBbXSxcbiAgZmFpbGVkUmVxdWVzdHM6IFtdXG59O1xuXG52YXIgbGltaXRzID0ge1xuICBhcHBsaWNhdGlvbkxvZ3M6IDEwMCxcbiAgZGVidWdEYXRhOiAyMCxcbiAgZmFpbGVkUmVxdWVzdHM6IDIwLFxuICBzYXNFcnJvcnM6IDEwMFxufTtcblxubW9kdWxlLmV4cG9ydHMuZ2V0ID0ge1xuICBnZXRTYXNFcnJvcnM6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLnNhc0Vycm9ycztcbiAgfSxcbiAgZ2V0QXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5hcHBsaWNhdGlvbkxvZ3M7XG4gIH0sXG4gIGdldERlYnVnRGF0YTogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuZGVidWdEYXRhO1xuICB9LFxuICBnZXRGYWlsZWRSZXF1ZXN0czogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3MuZmFpbGVkUmVxdWVzdHM7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzLmNsZWFyID0ge1xuICBjbGVhckFwcGxpY2F0aW9uTG9nczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc3BsaWNlKDAsIGxvZ3MuYXBwbGljYXRpb25Mb2dzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmRlYnVnRGF0YS5zcGxpY2UoMCwgbG9ncy5kZWJ1Z0RhdGEubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJTYXNFcnJvcnM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3Muc2FzRXJyb3JzLnNwbGljZSgwLCBsb2dzLnNhc0Vycm9ycy5sZW5ndGgpO1xuICB9LFxuICBjbGVhckZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmZhaWxlZFJlcXVlc3RzLnNwbGljZSgwLCBsb2dzLmZhaWxlZFJlcXVlc3RzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyQWxsTG9nczogZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5jbGVhckFwcGxpY2F0aW9uTG9ncygpO1xuICAgIHRoaXMuY2xlYXJEZWJ1Z0RhdGEoKTtcbiAgICB0aGlzLmNsZWFyU2FzRXJyb3JzKCk7XG4gICAgdGhpcy5jbGVhckZhaWxlZFJlcXVlc3RzKCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgYXBwbGljYXRpb24gbG9ncyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRBcHBsaWNhdGlvbkxvZyA9IGZ1bmN0aW9uKG1lc3NhZ2UsIHNhc1Byb2dyYW0pIHtcbiAgaWYobWVzc2FnZSA9PT0gJ2JsYW5rJykge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgbG9nID0ge1xuICAgIG1lc3NhZ2U6ICAgIG1lc3NhZ2UsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKSxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtXG4gIH07XG4gIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnB1c2gobG9nKTtcblxuICBpZihsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGggPiBsaW1pdHMuYXBwbGljYXRpb25Mb2dzKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBkZWJ1ZyBkYXRhIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZERlYnVnRGF0YSA9IGZ1bmN0aW9uKGh0bWxEYXRhLCBkZWJ1Z1RleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICBsb2dzLmRlYnVnRGF0YS5wdXNoKHtcbiAgICBkZWJ1Z0h0bWw6ICBodG1sRGF0YSxcbiAgICBkZWJ1Z1RleHQ6ICBkZWJ1Z1RleHQsXG4gICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICBwYXJhbXM6ICAgICBwYXJhbXMsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICB9KTtcblxuICBpZihsb2dzLmRlYnVnRGF0YS5sZW5ndGggPiBsaW1pdHMuZGVidWdEYXRhKSB7XG4gICAgbG9ncy5kZWJ1Z0RhdGEuc2hpZnQoKTtcbiAgfVxufTtcblxuLypcbiogQWRkcyBmYWlsZWQgcmVxdWVzdHMgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkRmFpbGVkUmVxdWVzdCA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgZGVidWdUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIGxvZ3MuZmFpbGVkUmVxdWVzdHMucHVzaCh7XG4gICAgcmVzcG9uc2VIdG1sOiByZXNwb25zZVRleHQsXG4gICAgcmVzcG9uc2VUZXh0OiBkZWJ1Z1RleHQsXG4gICAgc2FzUHJvZ3JhbTogICBzYXNQcm9ncmFtLFxuICAgIHRpbWU6ICAgICAgICAgbmV3IERhdGUoKVxuICB9KTtcblxuICAvL21heCAyMCBmYWlsZWQgcmVxdWVzdHNcbiAgaWYobG9ncy5mYWlsZWRSZXF1ZXN0cy5sZW5ndGggPiBsaW1pdHMuZmFpbGVkUmVxdWVzdHMpIHtcbiAgICBsb2dzLmZhaWxlZFJlcXVlc3RzLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qXG4qIEFkZHMgU0FTIGVycm9ycyB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRTYXNFcnJvcnMgPSBmdW5jdGlvbihlcnJvcnMpIHtcbiAgbG9ncy5zYXNFcnJvcnMgPSBsb2dzLnNhc0Vycm9ycy5jb25jYXQoZXJyb3JzKTtcblxuICB3aGlsZShsb2dzLnNhc0Vycm9ycy5sZW5ndGggPiBsaW1pdHMuc2FzRXJyb3JzKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc2hpZnQoKTtcbiAgfVxufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIHZhciB0aW1lb3V0ID0gMzAwMDA7XG4gIHZhciB0aW1lb3V0SGFuZGxlO1xuXG4gIHZhciB4aHIgPSBmdW5jdGlvbih0eXBlLCB1cmwsIGRhdGEpIHtcbiAgICB2YXIgbWV0aG9kcyA9IHtcbiAgICAgIHN1Y2Nlc3M6IGZ1bmN0aW9uKCkge30sXG4gICAgICBlcnJvcjogICBmdW5jdGlvbigpIHt9XG4gICAgfTtcbiAgICB2YXIgWEhSICAgICA9IFhNTEh0dHBSZXF1ZXN0IHx8IEFjdGl2ZVhPYmplY3Q7XG4gICAgdmFyIHJlcXVlc3QgPSBuZXcgWEhSKCdNU1hNTDIuWE1MSFRUUC4zLjAnKTtcblxuICAgIHJlcXVlc3Qub3Blbih0eXBlLCB1cmwsIHRydWUpO1xuICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcignQ29udGVudC10eXBlJywgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpO1xuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYodGltZW91dCA+IDApIHtcbiAgICAgIHRpbWVvdXRIYW5kbGUgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICByZXF1ZXN0LmFib3J0KCk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9XG5cbiAgICByZXF1ZXN0LnNlbmQoZGF0YSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuc3VjY2VzcyA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH0sXG4gICAgICBlcnJvcjogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgIG1ldGhvZHMuZXJyb3IgPSBjYWxsYmFjaztcbiAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICB2YXIgc2VyaWFsaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHN0ciA9IFtdO1xuICAgIGZvcih2YXIgcCBpbiBvYmopXG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmKG9ialtwXSBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgZm9yKHZhciBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXVtpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIHJldHVybiBzdHIuam9pbihcIiZcIik7XG4gIH07XG5cbiAgcmV0dXJuIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKHVybCwgZGF0YSkge1xuICAgICAgdmFyIGRhdGFTdHI7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgZGF0YVN0ciA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgIH1cbiAgICAgIHZhciB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMpO1xuICAgIH0sXG4gICAgcG9zdDogZnVuY3Rpb24odXJsLCBkYXRhKSB7XG4gICAgICB2YXIgZGF0YVN0cjtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBkYXRhU3RyID0gc2VyaWFsaXplKGRhdGEpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHhocignUE9TVCcsIHVybCwgZGF0YVN0cik7XG4gICAgfSxcbiAgICBzZXRUaW1lb3V0OiBmdW5jdGlvbih0KSB7XG4gICAgICB0aW1lb3V0ID0gdDtcbiAgICB9XG4gIH07XG59O1xuIiwidmFyIGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG52YXIgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcblxuLypcbiogQ2FsbCBTYXMgcHJvZ3JhbVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIFBhdGggb2YgdGhlIHNhcyBwcm9ncmFtXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY2FsbCA9IGZ1bmN0aW9uKHNhc1Byb2dyYW0sIHRhYmxlc09iaiwgY2FsbGJhY2ssIHBhcmFtcykge1xuICB2YXIgc2VsZiAgICAgICAgPSB0aGlzO1xuICB2YXIgcmV0cnlDb3VudCAgPSAwO1xuICB2YXIgZGJnICAgICAgICAgPSB0aGlzLmRlYnVnO1xuXG4gIGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKXtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcbiAgfVxuICBpZighc2FzUHJvZ3JhbSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBTYXMgcHJvZ3JhbSBmaWxlIHBhdGgnKTtcbiAgfVxuICBpZih0eXBlb2Ygc2FzUHJvZ3JhbSAhPT0gJ3N0cmluZycpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgc3RyaW5nJyk7XG4gIH1cblxuICBpZighcGFyYW1zKSB7XG4gICAgcGFyYW1zID0ge1xuICAgICAgX3Byb2dyYW06IHRoaXMubWV0YWRhdGFSb290ID8gdGhpcy5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgc2FzUHJvZ3JhbS5yZXBsYWNlKC9eXFwvLywgJycpIDogc2FzUHJvZ3JhbSxcbiAgICAgIF9kZWJ1ZzogICB0aGlzLmRlYnVnID8gMTMxIDogMCxcbiAgICAgIF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG4gICAgfTtcbiAgfVxuXG4gIGlmKHRhYmxlc09iaikge1xuICAgIGlmKHRhYmxlc09iaiBpbnN0YW5jZW9mIGg1NHMuVGFibGVzKSB7XG4gICAgICBmb3IodmFyIGtleSBpbiB0YWJsZXNPYmouX3RhYmxlcykge1xuICAgICAgICBpZih0YWJsZXNPYmouX3RhYmxlcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgcGFyYW1zW2tleV0gPSB0YWJsZXNPYmouX3RhYmxlc1trZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnV3JvbmcgdHlwZSBvZiB0YWJsZXMgb2JqZWN0Jyk7XG4gICAgfVxuICB9XG5cbiAgaWYodGhpcy5fZGlzYWJsZUNhbGxzKSB7XG4gICAgdGhpcy5fcGVuZGluZ0NhbGxzLnB1c2goe1xuICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgIGNhbGxiYWNrOiAgIGNhbGxiYWNrLFxuICAgICAgcGFyYW1zOiAgICAgcGFyYW1zXG4gICAgfSk7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhpcy5fdXRpbHMuYWpheC5wb3N0KHRoaXMudXJsLCBwYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgaWYoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG4gICAgICAvL3JlbWVtYmVyIHRoZSBjYWxsIGZvciBsYXR0ZXIgdXNlXG4gICAgICBzZWxmLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG4gICAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICAgIGNhbGxiYWNrOiAgIGNhbGxiYWNrLFxuICAgICAgICBwYXJhbXM6ICAgICBwYXJhbXNcbiAgICAgIH0pO1xuXG4gICAgICAvL3RoZXJlJ3Mgbm8gbmVlZCB0byBjb250aW51ZSBpZiBwcmV2aW91cyBjYWxsIHJldHVybmVkIGxvZ2luIGVycm9yXG4gICAgICBpZihzZWxmLl9kaXNhYmxlQ2FsbHMpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgdHJ5IHtcbiAgICAgICAgdmFyIHNhc0FwcE1hdGNoZXMgPSByZXMucmVzcG9uc2VVUkwubWF0Y2goL19zYXNhcHA9KFteJl0qKS8pO1xuICAgICAgICBzZWxmLnNhc0FwcCA9IHNhc0FwcE1hdGNoZXNbMV0ucmVwbGFjZSgvXFwrL2csICcgJyk7XG4gICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnQ2Fubm90IGV4dHJhY3QgX3Nhc2FwcCBwYXJhbWV0ZXIgZnJvbSBsb2dpbiBVUkwnKTtcbiAgICAgIH1cblxuICAgICAgY2FsbGJhY2sobmV3IGg1NHNFcnJvcignbm90TG9nZ2VkaW5FcnJvcicsICdZb3UgYXJlIG5vdCBsb2dnZWQgaW4nKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZXNPYmosIHVuZXNjYXBlZFJlc09iajtcbiAgICAgIGlmKCFkYmcpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAvL3JlbW92ZSBuZXcgbGluZXMgaW4ganNvbiByZXNwb25zZVxuICAgICAgICAgIHJlc09iaiAgICAgICAgICA9IEpTT04ucGFyc2UocmVzLnJlc3BvbnNlVGV4dC5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKSk7XG4gICAgICAgICAgcmVzT2JqICAgICAgICAgID0gc2VsZi5fdXRpbHMuY29udmVydERhdGVzKHJlc09iaik7XG4gICAgICAgICAgdW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblxuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2cocmVzT2JqLmxvZ21lc3NhZ2UsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgIGNhbGxiYWNrKHVuZGVmaW5lZCwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBpZihyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XG4gICAgICAgICAgICAgIHNlbGYuX3V0aWxzLmFqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG4gICAgICAgICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgc2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuICAgICAgICAgICAgICBzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcbiAgICAgICAgICAgICAgY2FsbGJhY2sobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG4gICAgICAgICAgICBlcnIuc3RhY2sgPSBlLnN0YWNrO1xuICAgICAgICAgICAgY2FsbGJhY2soZXJyKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmVzT2JqICAgICAgICAgID0gc2VsZi5fdXRpbHMucGFyc2VEZWJ1Z1JlcyhyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuICAgICAgICAgIHJlc09iaiAgICAgICAgICA9IHNlbGYuX3V0aWxzLmNvbnZlcnREYXRlcyhyZXNPYmopO1xuICAgICAgICAgIHVuZXNjYXBlZFJlc09iaiA9IHNlbGYuX3V0aWxzLnVuZXNjYXBlVmFsdWVzKHJlc09iaik7XG5cbiAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKHJlc09iai5sb2dtZXNzYWdlKTtcbiAgICAgICAgICBpZihyZXNPYmouaGFzRXJyb3JzKSB7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKSwgdW5lc2NhcGVkUmVzT2JqKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY2FsbGJhY2sodW5kZWZpbmVkLCB1bmVzY2FwZWRSZXNPYmopO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgaWYoZSBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSB7XG4gICAgICAgICAgICBzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG4gICAgICAgICAgICBjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgZS5tZXNzYWdlKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuICAgICAgICAgICAgZXJyLnN0YWNrID0gZS5zdGFjaztcbiAgICAgICAgICAgIGNhbGxiYWNrKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9KS5lcnJvcihmdW5jdGlvbihyZXMpIHtcbiAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdSZXF1ZXN0IGZhaWxlZCB3aXRoIHN0YXR1czogJyArIHJlcy5zdGF0dXMsIHNhc1Byb2dyYW0pO1xuICAgIGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5zdGF0dXNUZXh0KSk7XG4gIH0pO1xufTtcblxuLypcbiogTG9naW4gbWV0aG9kXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSB1c2VyIC0gTG9naW4gdXNlcm5hbWVcbiogQHBhcmFtIHtzdHJpbmd9IHBhc3MgLSBMb2dpbiBwYXNzd29yZFxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKiBPUlxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGFqYXggY2FsbCBpcyBmaW5pc2hlZFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmxvZ2luID0gZnVuY3Rpb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmKCF1c2VyIHx8ICFwYXNzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDcmVkZW50aWFscyBub3Qgc2V0Jyk7XG4gIH1cbiAgaWYodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpO1xuICB9XG4gIC8vTk9URTogY2FsbGJhY2sgb3B0aW9uYWw/XG4gIGlmKCFjYWxsYmFjayB8fCB0eXBlb2YgY2FsbGJhY2sgIT09ICdmdW5jdGlvbicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1lvdSBtdXN0IHByb3ZpZGUgY2FsbGJhY2snKTtcbiAgfVxuXG4gIHZhciBsb2dpblBhcmFtcyA9IHtcbiAgICBfc2FzYXBwOiBzZWxmLnNhc0FwcCxcbiAgICBfc2VydmljZTogJ2RlZmF1bHQnLFxuICAgIHV4OiB1c2VyLFxuICAgIHB4OiBwYXNzLFxuICAgIC8vZm9yIFNBUyA5LjQsXG4gICAgdXNlcm5hbWU6IHVzZXIsXG4gICAgcGFzc3dvcmQ6IHBhc3NcbiAgfTtcblxuICBmb3IgKHZhciBrZXkgaW4gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMpIHtcbiAgICBsb2dpblBhcmFtc1trZXldID0gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXNba2V5XTtcbiAgfVxuXG4gIHRoaXMuX3V0aWxzLmFqYXgucG9zdCh0aGlzLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICBpZihzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcbiAgICAgIC8vd2UgYXJlIGdldHRpbmcgZm9ybSBhZ2FpbiBhZnRlciByZWRpcmVjdFxuICAgICAgLy9hbmQgbmVlZCB0byBsb2dpbiBhZ2FpbiB1c2luZyB0aGUgbmV3IHVybFxuICAgICAgLy9fbG9naW5DaGFuZ2VkIGlzIHNldCBpbiBuZWVkVG9Mb2dpbiBmdW5jdGlvblxuICAgICAgLy9idXQgaWYgbG9naW4gdXJsIGlzIG5vdCBkaWZmZXJlbnQsIHdlIGFyZSBjaGVja2luZyBpZiB0aGVyZSBhcmUgYWRpdGlvbmFsIHBhcmFtZXRlcnNcbiAgICAgIGlmKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xuICAgICAgICBkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xuXG4gICAgICAgIHZhciBpbnB1dHMgPSByZXMucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG4gICAgICAgIGlmKGlucHV0cykge1xuICAgICAgICAgIGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uKGlucHV0U3RyKSB7XG4gICAgICAgICAgICB2YXIgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcbiAgICAgICAgICAgIGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHNlbGYuX3V0aWxzLmFqYXgucG9zdChzZWxmLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy9nZXR0aW5nIGZvcm0gYWdhaW4sIGJ1dCBpdCB3YXNuJ3QgYSByZWRpcmVjdFxuICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdXcm9uZyB1c2VybmFtZSBvciBwYXNzd29yZCcpO1xuICAgICAgICBjYWxsYmFjaygtMSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXG4gICAgICBzZWxmLl9kaXNhYmxlQ2FsbHMgPSBmYWxzZTtcblxuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdmFyIHBlbmRpbmdDYWxsICAgICA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuICAgICAgICB2YXIgc2FzUHJvZ3JhbSAgICAgID0gcGVuZGluZ0NhbGwuc2FzUHJvZ3JhbTtcbiAgICAgICAgdmFyIGNhbGxiYWNrUGVuZGluZyA9IHBlbmRpbmdDYWxsLmNhbGxiYWNrO1xuICAgICAgICB2YXIgcGFyYW1zICAgICAgICAgID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXG4gICAgICAgIC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgcGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIGlmKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG4gICAgICAgICAgc2VsZi5jYWxsKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSkuZXJyb3IoZnVuY3Rpb24ocmVzKSB7XG4gICAgLy9OT1RFOiBlcnJvciA1MDIgaWYgc2FzQXBwIHBhcmFtZXRlciBpcyB3cm9uZ1xuICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG4gICAgY2FsbGJhY2socmVzLnN0YXR1cyk7XG4gIH0pO1xufTtcblxuLypcbiogRW50ZXIgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnNldERlYnVnTW9kZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmRlYnVnID0gdHJ1ZTtcbn07XG5cbi8qXG4qIEV4aXQgZGVidWcgbW9kZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZGVidWcgPSBmYWxzZTtcbn07XG5cbmZvcih2YXIga2V5IGluIGxvZ3MuZ2V0KSB7XG4gIGlmKGxvZ3MuZ2V0Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICBtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcbiAgfVxufVxuXG5mb3IodmFyIGtleSBpbiBsb2dzLmNsZWFyKSB7XG4gIGlmKGxvZ3MuY2xlYXIuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgIG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmNsZWFyW2tleV07XG4gIH1cbn1cblxuLypcbiogQWRkIGNhbGxiYWNrIGZ1bmN0aW9ucyBleGVjdXRlZCB3aGVuIHByb3BlcnRpZXMgYXJlIHVwZGF0ZWQgd2l0aCByZW1vdGUgY29uZmlnXG4qXG4qQGNhbGxiYWNrIC0gY2FsbGJhY2sgcHVzaGVkIHRvIGFycmF5XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMub25SZW1vdGVDb25maWdVcGRhdGUgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcbiIsInZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlciBpbiBkZWJ1ZyBtb2RlXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtvYmplY3R9IHBhcmFtcyAtIHBhcmFtcyBzZW50IHRvIHNhcyBwcm9ncmFtIHdpdGggYWRkVGFibGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5wYXJzZURlYnVnUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgLy9maW5kIGpzb25cbiAgdmFyIHBhdHQgICAgICAgICAgPSAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKikoLS1oNTRzLWRhdGEtZW5kLS0pL207XG4gIHZhciBtYXRjaGVzICAgICAgID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHBhdHQpO1xuXG4gIHZhciBwYWdlICAgICAgICAgID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UocGF0dCwgJycpO1xuICB2YXIgaHRtbEJvZHlQYXR0ICA9IC88Ym9keS4qPihbXFxzXFxTXSopPFxcL2JvZHk+LztcbiAgdmFyIGJvZHlNYXRjaGVzICAgPSBwYWdlLm1hdGNoKGh0bWxCb2R5UGF0dCk7XG5cbiAgLy9yZW1vdmUgaHRtbCB0YWdzXG4gIHZhciBkZWJ1Z1RleHQgPSBib2R5TWF0Y2hlc1sxXS5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcbiAgZGVidWdUZXh0ICAgICA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cbiAgbG9ncy5hZGREZWJ1Z0RhdGEoYm9keU1hdGNoZXNbMV0sIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcblxuICB0aGlzLnBhcnNlRXJyb3JSZXNwb25zZShyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXG4gIC8vcmVtb3ZlIG5ldyBsaW5lcyBpbiBqc29uIHJlc3BvbnNlXG4gIHZhciBqc29uT2JqID0gSlNPTi5wYXJzZShtYXRjaGVzWzJdLnJlcGxhY2UoLyhcXHJcXG58XFxyfFxcbikvZywgJycpKTtcbiAgaWYoZGVidWdUZXh0LmluZGV4T2YoJ0VSUk9SOicpICE9PSAtMSkge1xuICAgIGpzb25PYmouaGFzRXJyb3JzID0gdHJ1ZTtcbiAgfVxuXG4gIHJldHVybiBqc29uT2JqO1xufTtcblxuLypcbiogQWRkIGZhaWxlZCByZXNwb25zZSB0byBsb2dzIC0gdXNlZCBvbmx5IGlmIGRlYnVnPWZhbHNlXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXNwb25zZSA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkge1xuICB2YXIgcGF0dCAgICAgID0gLzxzY3JpcHQoW1xcc1xcU10qKVxcL2Zvcm0+LztcbiAgdmFyIHBhdHQyICAgICA9IC9kaXNwbGF5XFxzPzpcXHM/bm9uZTs/XFxzPy87XG4gIC8vcmVtb3ZlIHNjcmlwdCB3aXRoIGZvcm0gZm9yIHRvZ2dsaW5nIHRoZSBsb2dzIGFuZCBcImRpc3BsYXk6bm9uZVwiIGZyb20gc3R5bGVcbiAgcmVzcG9uc2VUZXh0ICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKS5yZXBsYWNlKHBhdHQyLCAnJyk7XG4gIHZhciBkZWJ1Z1RleHQgPSByZXNwb25zZVRleHQucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cbiAgbG9ncy5hZGRGYWlsZWRSZXF1ZXN0KHJlc3BvbnNlVGV4dCwgZGVidWdUZXh0LCBzYXNQcm9ncmFtKTtcbn07XG5cbi8qXG4qIFVuZXNjYXBlIGFsbCBzdHJpbmcgdmFsdWVzIGluIHJldHVybmVkIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gb2JqXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudW5lc2NhcGVWYWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdzdHJpbmcnKSB7XG4gICAgICBvYmpba2V5XSA9IGRlY29kZVVSSUNvbXBvbmVudChvYmpba2V5XSk7XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgICB0aGlzLnVuZXNjYXBlVmFsdWVzKG9ialtrZXldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIG9iajtcbn07XG5cbi8qXG4qIFBhcnNlIGVycm9yIHJlc3BvbnNlIGZyb20gc2VydmVyIGFuZCBzYXZlIGVycm9ycyBpbiBtZW1vcnlcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKiAjcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHdoaWNoIHJldHVybmVkIHRoZSByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRXJyb3JSZXNwb25zZSA9IGZ1bmN0aW9uKHJlcywgc2FzUHJvZ3JhbSkge1xuICB2YXIgcGF0dCAgICA9IC9FUlJPUiguKlxcLnwuKlxcbi4qXFwuKS9nO1xuICB2YXIgZXJyb3JzICA9IHJlcy5tYXRjaChwYXR0KTtcbiAgaWYoIWVycm9ycykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBlcnJNZXNzYWdlO1xuICBmb3IodmFyIGkgPSAwLCBuID0gZXJyb3JzLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgIGVyck1lc3NhZ2UgID0gZXJyb3JzW2ldLnJlcGxhY2UoLzxbXj5dKj4vZywgJycpLnJlcGxhY2UoLyhcXG58XFxzezIsfSkvZywgJyAnKTtcbiAgICBlcnJNZXNzYWdlICA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGVyck1lc3NhZ2UpO1xuICAgIGVycm9yc1tpXSAgID0ge1xuICAgICAgc2FzUHJvZ3JhbTogc2FzUHJvZ3JhbSxcbiAgICAgIG1lc3NhZ2U6ICAgIGVyck1lc3NhZ2UsXG4gICAgICB0aW1lOiAgICAgICBuZXcgRGF0ZSgpXG4gICAgfTtcbiAgfVxuXG4gIGxvZ3MuYWRkU2FzRXJyb3JzKGVycm9ycyk7XG59O1xuXG4vKlxuKiBEZWNvZGUgSFRNTCBlbnRpdGllc1xuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuZGVjb2RlSFRNTEVudGl0aWVzID0gZnVuY3Rpb24gKGh0bWwpIHtcbiAgdmFyIHRlbXBFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICB2YXIgc3RyICAgICAgICAgPSBodG1sLnJlcGxhY2UoLyYoIyg/OnhbMC05YS1mXSt8XFxkKyl8W2Etel0rKTsvZ2ksXG4gICAgZnVuY3Rpb24gKHN0cikge1xuICAgICAgdGVtcEVsZW1lbnQuaW5uZXJIVE1MID0gc3RyO1xuICAgICAgc3RyICAgICAgICAgICAgICAgICAgID0gdGVtcEVsZW1lbnQudGV4dENvbnRlbnQgfHwgdGVtcEVsZW1lbnQuaW5uZXJUZXh0O1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICk7XG4gIHJldHVybiBzdHI7XG59O1xuXG4vKlxuKiBDb252ZXJ0IHNhcyB0aW1lIHRvIGphdmFzY3JpcHQgZGF0ZVxuKlxuKiBAcGFyYW0ge251bWJlcn0gc2FzRGF0ZSAtIHNhcyBUYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmZyb21TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChzYXNEYXRlKSB7XG4gIHZhciBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICB2YXIgY3VycmRhdGUgPSBzYXNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgdmFyIGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBzYXMgZGF0ZXRpbWUgdG8gYSBjdXJyZW50IHZhbGlkIGphdmFzY3JpcHQgZGF0ZVxuICB2YXIgYmFzZWRhdGVNcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCk7IC8vIGluIG1zXG4gIHZhciBjdXJyZGF0ZU1zICA9IGN1cnJkYXRlICogMTAwMDsgLy8gdG8gbXNcbiAgdmFyIHNhc0RhdGV0aW1lID0gY3VycmRhdGVNcyArIGJhc2VkYXRlTXM7XG4gIHZhciBqc0RhdGUgICAgICA9IG5ldyBEYXRlKCk7XG4gIGpzRGF0ZS5zZXRUaW1lKHNhc0RhdGV0aW1lKTsgLy8gZmlyc3QgdGltZSB0byBnZXQgb2Zmc2V0IEJTVCBkYXlsaWdodCBzYXZpbmdzIGV0Y1xuICB2YXIgY3Vyck9mZnNldCAgPSBqc0RhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gYWRqdXN0IGZvciBvZmZzZXQgaW4gbWludXRlc1xuICB2YXIgb2Zmc2V0VmFyICAgPSAoYmFzZU9mZnNldCAtIGN1cnJPZmZzZXQpICogNjAgKiAxMDAwOyAvLyBkaWZmZXJlbmNlIGluIG1pbGxpc2Vjb25kc1xuICB2YXIgb2Zmc2V0VGltZSAgPSBzYXNEYXRldGltZSAtIG9mZnNldFZhcjsgLy8gZmluZGluZyBCU1QgYW5kIGRheWxpZ2h0IHNhdmluZ3NcbiAganNEYXRlLnNldFRpbWUob2Zmc2V0VGltZSk7IC8vIHVwZGF0ZSB3aXRoIG9mZnNldFxuICByZXR1cm4ganNEYXRlO1xufTtcblxuLypcbiogQ29udmVydCBzYXMgdGltZXN0YW1wcyB0byBqYXZhc2NyaXB0IERhdGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBvYmpcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jb252ZXJ0RGF0ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmICh0eXBlb2Ygb2JqW2tleV0gPT09ICdudW1iZXInICYmIChrZXkuaW5kZXhPZignZHRfJykgPT09IDAgfHwga2V5LmluZGV4T2YoJ0RUXycpID09PSAwKSkge1xuICAgICAgb2JqW2tleV0gPSB0aGlzLmZyb21TYXNEYXRlVGltZShvYmpba2V5XSk7XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgICB0aGlzLmNvbnZlcnREYXRlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG5tb2R1bGUuZXhwb3J0cy5uZWVkVG9Mb2dpbiA9IGZ1bmN0aW9uKHJlc3BvbnNlT2JqKSB7XG4gIHZhciBwYXR0ID0gLzxmb3JtLithY3Rpb249XCIoLipMb2dvblteXCJdKikuKj4vO1xuICB2YXIgbWF0Y2hlcyA9IHBhdHQuZXhlYyhyZXNwb25zZU9iai5yZXNwb25zZVRleHQpO1xuICB2YXIgbmV3TG9naW5Vcmw7XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICAvL3RoZXJlJ3Mgbm8gZm9ybSwgd2UgYXJlIGluLiBob29yYXkhXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHZhciBhY3Rpb25VcmwgPSBtYXRjaGVzWzFdLnJlcGxhY2UoL1xcPy4qLywgJycpO1xuICAgIGlmKGFjdGlvblVybC5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyBhY3Rpb25VcmwgOiBhY3Rpb25Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vcmVsYXRpdmUgcGF0aFxuXG4gICAgICB2YXIgbGFzdEluZE9mU2xhc2ggPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5sYXN0SW5kZXhPZignLycpICsgMTtcbiAgICAgIC8vcmVtb3ZlIGV2ZXJ5dGhpbmcgYWZ0ZXIgdGhlIGxhc3Qgc2xhc2gsIGFuZCBldmVyeXRoaW5nIHVudGlsIHRoZSBmaXJzdFxuICAgICAgdmFyIHJlbGF0aXZlTG9naW5VcmwgPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5zdWJzdHIoMCwgbGFzdEluZE9mU2xhc2gpLnJlcGxhY2UoLy4qXFwvezJ9W15cXC9dKi8sICcnKSArIGFjdGlvblVybDtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgcmVsYXRpdmVMb2dpblVybCA6IHJlbGF0aXZlTG9naW5Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9zYXZlIHBhcmFtZXRlcnMgZnJvbSBoaWRkZW4gZm9ybSBmaWVsZHNcbiAgICB2YXIgaW5wdXRzID0gcmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG4gICAgdmFyIGhpZGRlbkZvcm1QYXJhbXMgPSB7fTtcbiAgICBpZihpbnB1dHMpIHtcbiAgICAgIC8vaXQncyBuZXcgbG9naW4gcGFnZSBpZiB3ZSBoYXZlIHRoZXNlIGFkZGl0aW9uYWwgcGFyYW1ldGVyc1xuICAgICAgdGhpcy5faXNOZXdMb2dpblBhZ2UgPSB0cnVlO1xuICAgICAgaW5wdXRzLmZvckVhY2goZnVuY3Rpb24oaW5wdXRTdHIpIHtcbiAgICAgICAgdmFyIHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG4gICAgICAgIGhpZGRlbkZvcm1QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuICAgICAgfSk7XG4gICAgICB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcyA9IGhpZGRlbkZvcm1QYXJhbXM7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuLypcbiogaDU0cyB0YWJsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gVGFibGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gbWFjcm8gbmFtZVxuKlxuKi9cbmZ1bmN0aW9uIFRhYmxlcyh0YWJsZSwgbWFjcm9OYW1lKSB7XG4gIHRoaXMuX3RhYmxlcyA9IHt9O1xuXG4gIHRoaXMuYWRkKHRhYmxlLCBtYWNyb05hbWUpO1xufVxuXG4vKlxuKiBBZGQgdGFibGUgdG8gdGFibGVzIG9iamVjdFxuKiBAcGFyYW0ge2FycmF5fSB0YWJsZSAtIEFycmF5IG9mIHRhYmxlIG9iamVjdHNcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuVGFibGVzLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih0YWJsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgdmFyIHJlc3VsdCA9IHRoaXMuX3V0aWxzLmNvbnZlcnRUYWJsZU9iamVjdCh0YWJsZSk7XG5cbiAgdmFyIHRhYmxlQXJyYXkgPSBbXTtcbiAgdGFibGVBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KHJlc3VsdC5zcGVjKSk7XG4gIGZvciAodmFyIG51bWJlck9mVGFibGVzID0gMDsgbnVtYmVyT2ZUYWJsZXMgPCByZXN1bHQuZGF0YS5sZW5ndGg7IG51bWJlck9mVGFibGVzKyspIHtcbiAgICB2YXIgb3V0U3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzdWx0LmRhdGFbbnVtYmVyT2ZUYWJsZXNdKTtcbiAgICB0YWJsZUFycmF5LnB1c2gob3V0U3RyaW5nKTtcbiAgfVxuICB0aGlzLl90YWJsZXNbbWFjcm9OYW1lXSA9IHRhYmxlQXJyYXk7XG59O1xuXG5UYWJsZXMucHJvdG90eXBlLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBUYWJsZXM7XG4iLCJ2YXIgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbnZhciBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuXG4vKlxuKiBDb252ZXJ0IHRhYmxlIG9iamVjdCB0byBTYXMgcmVhZGFibGUgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBpbk9iamVjdCAtIE9iamVjdCB0byBjb252ZXJ0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY29udmVydFRhYmxlT2JqZWN0ID0gZnVuY3Rpb24oaW5PYmplY3QpIHtcbiAgdmFyIHNlbGYgICAgICAgICAgICA9IHRoaXM7XG4gIHZhciBjaHVua1RocmVzaG9sZCAgPSAzMDAwMDsgLy8gdGhpcyBnb2VzIHRvIDMwayBmb3IgU0FTXG5cbiAgLy8gZmlyc3QgY2hlY2sgdGhhdCB0aGUgb2JqZWN0IGlzIGFuIGFycmF5XG4gIGlmICh0eXBlb2YgKGluT2JqZWN0KSAhPT0gJ29iamVjdCcpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBpcyBub3QgYW4gb2JqZWN0Jyk7XG4gIH1cblxuICB2YXIgYXJyYXlMZW5ndGggPSBpbk9iamVjdC5sZW5ndGg7XG4gIGlmICh0eXBlb2YgKGFycmF5TGVuZ3RoKSAhPT0gJ251bWJlcicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBkb2VzIG5vdCBoYXZlIGEgdmFsaWQgbGVuZ3RoIGFuZCBpcyBtb3N0IGxpa2VseSBub3QgYW4gYXJyYXknKTtcbiAgfVxuXG4gIHZhciBleGlzdGluZ0NvbHMgPSB7fTsgLy8gdGhpcyBpcyBqdXN0IHRvIG1ha2UgbG9va3VwIGVhc2llciByYXRoZXIgdGhhbiB0cmF2ZXJzaW5nIGFycmF5IGVhY2ggdGltZS4gV2lsbCB0cmFuc2Zvcm0gYWZ0ZXJcblxuICAvLyBmdW5jdGlvbiBjaGVja0FuZFNldEFycmF5IC0gdGhpcyB3aWxsIGNoZWNrIGFuIGluT2JqZWN0IGN1cnJlbnQga2V5IGFnYWluc3QgdGhlIGV4aXN0aW5nIHR5cGVBcnJheSBhbmQgZWl0aGVyIHJldHVybiAtMSBpZiB0aGVyZVxuICAvLyBpcyBhIHR5cGUgbWlzbWF0Y2ggb3IgYWRkIGFuIGVsZW1lbnQgYW5kIHVwZGF0ZS9pbmNyZW1lbnQgdGhlIGxlbmd0aCBpZiBuZWVkZWRcblxuICBmdW5jdGlvbiBjaGVja0FuZEluY3JlbWVudChjb2xTcGVjKSB7XG4gICAgaWYgKHR5cGVvZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0gICAgICAgICAgID0ge307XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xOYW1lICAgPSBjb2xTcGVjLmNvbE5hbWU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICAgPSBjb2xTcGVjLmNvbFR5cGU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7XG4gICAgICByZXR1cm4gMDsgLy8gYWxsIG9rXG4gICAgfVxuICAgIC8vIGNoZWNrIHR5cGUgbWF0Y2hcbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAhPT0gY29sU3BlYy5jb2xUeXBlKSB7XG4gICAgICByZXR1cm4gLTE7IC8vIHRoZXJlIGlzIGEgZnVkZ2UgaW4gdGhlIHR5cGluZ1xuICAgIH1cbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoIDwgY29sU3BlYy5jb2xMZW5ndGgpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTsgLy8gaW5jcmVtZW50IHRoZSBtYXggbGVuZ3RoIG9mIHRoaXMgY29sdW1uXG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cbiAgdmFyIGNodW5rQXJyYXlDb3VudCAgICAgICAgID0gMDsgLy8gdGhpcyBpcyBmb3Iga2VlcGluZyB0YWJzIG9uIGhvdyBsb25nIHRoZSBjdXJyZW50IGFycmF5IHN0cmluZyB3b3VsZCBiZVxuICB2YXIgdGFyZ2V0QXJyYXkgICAgICAgICAgICAgPSBbXTsgLy8gdGhpcyBpcyB0aGUgYXJyYXkgb2YgdGFyZ2V0IGFycmF5c1xuICB2YXIgY3VycmVudFRhcmdldCAgICAgICAgICAgPSAwO1xuICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbXTtcbiAgdmFyIGogICAgICAgICAgICAgICAgICAgICAgID0gMDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbk9iamVjdC5sZW5ndGg7IGkrKykge1xuICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdID0ge307XG4gICAgdmFyIGNodW5rUm93Q291bnQgICAgICAgICAgICAgPSAwO1xuXG4gICAgZm9yICh2YXIga2V5IGluIGluT2JqZWN0W2ldKSB7XG4gICAgICB2YXIgdGhpc1NwZWMgID0ge307XG4gICAgICB2YXIgdGhpc1ZhbHVlID0gaW5PYmplY3RbaV1ba2V5XTtcblxuICAgICAgLy9za2lwIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXNWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy90aHJvdyBhbiBlcnJvciBpZiB0aGVyZSdzIE5hTiB2YWx1ZVxuICAgICAgaWYodHlwZW9mIHRoaXNWYWx1ZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odGhpc1ZhbHVlKSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IC1JbmZpbml0eSB8fCB0aGlzVmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHRoaXNWYWx1ZS50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSB0cnVlIHx8IHRoaXNWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Jvb2xlYW4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIGdldCB0eXBlLi4uIGlmIGl0IGlzIGFuIG9iamVjdCB0aGVuIGNvbnZlcnQgaXQgdG8ganNvbiBhbmQgc3RvcmUgYXMgYSBzdHJpbmdcbiAgICAgIHZhciB0aGlzVHlwZSAgPSB0eXBlb2YgKHRoaXNWYWx1ZSk7XG4gICAgICB2YXIgaXNEYXRlID0gdGhpc1ZhbHVlIGluc3RhbmNlb2YgRGF0ZTtcbiAgICAgIGlmICh0aGlzVHlwZSA9PT0gJ251bWJlcicpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIG51bWJlclxuICAgICAgICBpZih0aGlzVmFsdWUgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB0aGlzVmFsdWUgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdudW0nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGhpc1ZhbHVlLnRvU3RyaW5nKCkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IHRoaXNWYWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT09ICdzdHJpbmcnICYmICFpc0RhdGUpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIHN0cmluZ1xuICAgICAgICB0aGlzU3BlYy5jb2xOYW1lICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgPSB0aGlzVmFsdWUubGVuZ3RoO1xuXG4gICAgICAgIGlmICh0aGlzVmFsdWUgPT09IFwiXCIpIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gXCIgXCI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IGVuY29kZVVSSUNvbXBvbmVudCh0aGlzVmFsdWUpLnJlcGxhY2UoLycvZywgJyUyNycpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZihpc0RhdGUpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ2RhdGUnO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gc2VsZi50b1Nhc0RhdGVUaW1lKHRoaXNWYWx1ZSk7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS50b1N0cmluZygpLmxlbmd0aDtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ2pzb24nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH1cblxuICAgICAgY2h1bmtSb3dDb3VudCA9IGNodW5rUm93Q291bnQgKyA2ICsga2V5Lmxlbmd0aCArIHRoaXNTcGVjLmVuY29kZWRMZW5ndGg7XG5cbiAgICAgIGlmIChjaGVja0FuZEluY3JlbWVudCh0aGlzU3BlYykgPT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdSb3cgJyArIGogKyAnIGV4Y2VlZHMgc2l6ZSBsaW1pdCBvZiAzMmtiJyk7XG4gICAgfSBlbHNlIGlmKGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQgPiBjaHVua1RocmVzaG9sZCkge1xuICAgICAgLy9jcmVhdGUgbmV3IGFycmF5IGlmIHRoaXMgb25lIGlzIGZ1bGwgYW5kIG1vdmUgdGhlIGxhc3QgaXRlbSB0byB0aGUgbmV3IGFycmF5XG4gICAgICB2YXIgbGFzdFJvdyA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnBvcCgpOyAvLyBnZXQgcmlkIG9mIHRoYXQgbGFzdCByb3dcbiAgICAgIGN1cnJlbnRUYXJnZXQrKzsgLy8gbW92ZSBvbnRvIHRoZSBuZXh0IGFycmF5XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbbGFzdFJvd107IC8vIG1ha2UgaXQgYW4gYXJyYXlcbiAgICAgIGogICAgICAgICAgICAgICAgICAgICAgICAgICA9IDA7IC8vIGluaXRpYWxpc2UgbmV3IHJvdyBjb3VudGVyIGZvciBuZXcgYXJyYXkgLSBpdCB3aWxsIGJlIGluY3JlbWVudGVkIGF0IHRoZSBlbmQgb2YgdGhlIGZ1bmN0aW9uXG4gICAgICBjaHVua0FycmF5Q291bnQgICAgICAgICAgICAgPSBjaHVua1Jvd0NvdW50OyAvLyB0aGlzIGlzIHRoZSBuZXcgY2h1bmsgbWF4IHNpemVcbiAgICB9IGVsc2Uge1xuICAgICAgY2h1bmtBcnJheUNvdW50ID0gY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudDtcbiAgICB9XG4gICAgaisrO1xuICB9XG5cbiAgLy8gcmVmb3JtYXQgZXhpc3RpbmdDb2xzIGludG8gYW4gYXJyYXkgc28gc2FzIGNhbiBwYXJzZSBpdDtcbiAgdmFyIHNwZWNBcnJheSA9IFtdO1xuICBmb3IgKHZhciBrIGluIGV4aXN0aW5nQ29scykge1xuICAgIHNwZWNBcnJheS5wdXNoKGV4aXN0aW5nQ29sc1trXSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzcGVjOiAgICAgICBzcGVjQXJyYXksXG4gICAgZGF0YTogICAgICAgdGFyZ2V0QXJyYXksXG4gICAganNvbkxlbmd0aDogY2h1bmtBcnJheUNvdW50XG4gIH07IC8vIHRoZSBzcGVjIHdpbGwgYmUgdGhlIG1hY3JvWzBdLCB3aXRoIHRoZSBkYXRhIHNwbGl0IGludG8gYXJyYXlzIG9mIG1hY3JvWzEtbl1cbiAgLy8gbWVhbnMgaW4gdGVybXMgb2YgZG9qbyB4aHIgb2JqZWN0IGF0IGxlYXN0IHRoZXkgbmVlZCB0byBnbyBpbnRvIHRoZSBzYW1lIGFycmF5XG59O1xuXG4vKlxuKiBDb252ZXJ0IGphdmFzY3JpcHQgZGF0ZSB0byBzYXMgdGltZVxuKlxuKiBAcGFyYW0ge29iamVjdH0ganNEYXRlIC0gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnRvU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoanNEYXRlKSB7XG4gIHZhciBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICB2YXIgY3VycmRhdGUgPSBqc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICB2YXIgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcbiAgdmFyIGN1cnJPZmZzZXQgPSBjdXJyZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBjdXJyZGF0ZSB0byBhIHNhcyBkYXRldGltZVxuICB2YXIgb2Zmc2V0U2VjcyAgICA9IChjdXJyT2Zmc2V0IC0gYmFzZU9mZnNldCkgKiA2MDsgLy8gb2Zmc2V0RGlmZiBpcyBpbiBtaW51dGVzIHRvIHN0YXJ0IHdpdGhcbiAgdmFyIGJhc2VEYXRlU2VjcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIHZhciBjdXJyZGF0ZVNlY3MgID0gY3VycmRhdGUuZ2V0VGltZSgpIC8gMTAwMDsgLy8gZ2V0IHJpZCBvZiBtc1xuICB2YXIgc2FzRGF0ZXRpbWUgICA9IE1hdGgucm91bmQoY3VycmRhdGVTZWNzIC0gYmFzZURhdGVTZWNzIC0gb2Zmc2V0U2Vjcyk7IC8vIGFkanVzdFxuXG4gIHJldHVybiBzYXNEYXRldGltZTtcbn07XG4iXX0=
