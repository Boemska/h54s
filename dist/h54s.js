(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.h54s = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/*
* h54s error constructor
* @constructor
*
*@param {string} type - Error type
*@param {string} message - Error message
*@param {string} status - Error status returned from SAS
*
*/
function h54sError(type, message, status) {
  if(Error.captureStackTrace) {
    Error.captureStackTrace(this);
  }
  this.message = message;
  this.type    = type;
  this.status  = status;
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
const h54sError = require('../error.js');

/**
* h54s SAS Files object constructor
* @constructor
*
*@param {file} file - File added when object is created
*@param {string} macroName - macro name
*
*/
function Files(file, macroName) {
  this._files = {};

  Files.prototype.add.call(this, file, macroName);
}

/**
* Add file to files object
* @param {file} file - Instance of JavaScript File object
* @param {string} macroName - Sas macro name
*
*/
Files.prototype.add = function(file, macroName) {
  if(file && macroName) {
    if(!(file instanceof File || file instanceof Blob)) {
      throw new h54sError('argumentError', 'First argument must be instance of File object');
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

  this._files[macroName] = [
    'FILE',
    file
  ];
};

module.exports = Files;

},{"../error.js":1}],3:[function(require,module,exports){
const h54sError = require('./error.js');

const sasVersionMap = {
	v9: {
    url: '/SASStoredProcess/do',
    loginUrl: '/SASLogon/login',
		logoutUrl: '/SASStoredProcess/do?_action=logoff',
    RESTAuthLoginUrl: '/SASLogon/v1/tickets'
	},
	viya: {
		url: '/SASJobExecution/',
    loginUrl: '/SASLogon/login.do',
		logoutUrl: '/SASLogon/logout.do?',
    RESTAuthLoginUrl: ''
	}
}

/**
*
* @constructor
* @param {Object} config - Configuration object for the H54S SAS Adapter
* @param {String} config.sasVersion - Version of SAS, either 'v9' or 'viya'
* @param {Boolean} config.debug - Whether debug mode is enabled, sets _debug=131
* @param {String} config.metadataRoot - Base path of all project services to be prepended to _program path
* @param {String} config.url - URI of the job executor - SPWA or JES
* @param {String} config.loginUrl - URI of the SASLogon web login path - overridden by form action
* @param {String} config.logoutUrl - URI of the logout action
* @param {String} config.RESTauth - Boolean to toggle use of REST authentication in SAS v9
* @param {String} config.RESTauthLoginUrl - Address of SASLogon tickets endpoint for REST auth
* @param {Boolean} config.retryAfterLogin - Whether to resume requests which were parked with login redirect after a successful re-login
* @param {Number} config.maxXhrRetries - If a program call fails, attempt to call it again N times until it succeeds
* @param {Number} config.ajaxTimeout - Number of milliseconds to wait for a response before closing the request
* @param {Boolean} config.useMultipartFormData - Whether to use multipart for POST - for legacy backend support
* @param {String} config.csrf - CSRF token for JES
* @
*
*/
const h54s = module.exports = function(config) {
  // Default config values, overridden by anything in the config object
	this.sasVersion           = (config && config.sasVersion) || 'v9' //use v9 as default=
  this.debug                = (config && config.debug) || false;
  this.metadataRoot					= (config && config.metadataRoot) || '';
  this.url                  = sasVersionMap[this.sasVersion].url;
  this.loginUrl             = sasVersionMap[this.sasVersion].loginUrl;
  this.logoutUrl            = sasVersionMap[this.sasVersion].logoutUrl;
  this.RESTauth             = false;
  this.RESTauthLoginUrl     = sasVersionMap[this.sasVersion].RESTAuthLoginUrl;
  this.retryAfterLogin      = true;
  this.maxXhrRetries        = 5;
  this.ajaxTimeout          = (config && config.ajaxTimeout) || 300000;
  this.useMultipartFormData = (config && config.useMultipartFormData) || true;
  this.csrf                 = ''
  this.isViya								= this.sasVersion === 'viya';

  // Initialising callback stacks for when authentication is paused
  this.remoteConfigUpdateCallbacks = [];
  this._pendingCalls = [];
  this._customPendingCalls = [];
  this._disableCalls = false
  this._ajax = require('./methods/ajax.js')();

  _setConfig.call(this, config);

  // If this instance was deployed with a standalone config external to the build use that
  if(config && config.isRemoteConfig) {
    const self = this;

    this._disableCalls = true;

    // 'h54sConfig.json' is for the testing with karma
    //replaced by gulp in dev build (defined in gulpfile under proxies)
    this._ajax.get('h54sConfig.json').success(function(res) {
      const remoteConfig = JSON.parse(res.responseText)

			// Save local config before updating it with remote config
			const localConfig = Object.assign({}, config)
			const oldMetadataRoot = localConfig.metadataRoot;

      for(let key in remoteConfig) {
        if(remoteConfig.hasOwnProperty(key) && key !== 'isRemoteConfig') {
          config[key] = remoteConfig[key];
        }
      }

      _setConfig.call(self, config);

      // Execute callbacks when overrides from remote config are applied
      for(let i = 0, n = self.remoteConfigUpdateCallbacks.length; i < n; i++) {
        const fn = self.remoteConfigUpdateCallbacks[i];
        fn();
      }

      // Execute sas calls disabled while waiting for the config
      self._disableCalls = false;
      while(self._pendingCalls.length > 0) {
        const pendingCall = self._pendingCalls.shift();
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;

        // Update program path with metadataRoot if it's not set
        if(self.metadataRoot && params._program.indexOf(self.metadataRoot) === -1) {
          params._program = self.metadataRoot.replace(/\/?$/, '/') + params._program.replace(oldMetadataRoot, '').replace(/^\//, '');
        }

        // Update debug because it may change in the meantime
        params._debug = self.debug ? 131 : 0;

        self.call(sasProgram, null, callbackPending, params);
      }

      // Execute custom calls that we made while waitinf for the config
       while(self._customPendingCalls.length > 0) {
      	const pendingCall = self._customPendingCalls.shift()
				const callMethod = pendingCall.callMethod
				const _url = pendingCall._url
				const options = pendingCall.options;
        ///update program with metadataRoot if it's not set
        if(self.metadataRoot && options.params && options.params._program.indexOf(self.metadataRoot) === -1) {
          options.params._program = self.metadataRoot.replace(/\/?$/, '/') + options.params._program.replace(oldMetadataRoot, '').replace(/^\//, '');
        }
        //update debug because it also may have changed from remoteConfig
				if (options.params) {
					options.params._debug = self.debug ? 131 : 0;
				}
				self.managedRequest(callMethod, _url, options);
      }
    }).error(function (err) {
      throw new h54sError('ajaxError', 'Remote config file cannot be loaded. Http status code: ' + err.status);
    });
  }

  // private function to set h54s instance properties
  function _setConfig(config) {
    if(!config) {
      this._ajax.setTimeout(this.ajaxTimeout);
      return;
    } else if(typeof config !== 'object') {
      throw new h54sError('argumentError', 'First parameter should be config object');
    }

    //merge config object from parameter with this
    for(let key in config) {
      if(config.hasOwnProperty(key)) {
        if((key === 'url' || key === 'loginUrl') && config[key].charAt(0) !== '/') {
          config[key] = '/' + config[key];
        }
        this[key] = config[key];
      }
    }

    //if server is remote use the full server url
    //NOTE: This requires CORS and is here for legacy support
    if(config.hostUrl) {
      if(config.hostUrl.charAt(config.hostUrl.length - 1) === '/') {
        config.hostUrl = config.hostUrl.slice(0, -1);
      }
      this.hostUrl = config.hostUrl;
      if (!this.url.includes(this.hostUrl)) {
				this.url = config.hostUrl + this.url;
			}
			if (!this.loginUrl.includes(this.hostUrl)) {
				this.loginUrl = config.hostUrl + this.loginUrl;
			}
			if (!this.RESTauthLoginUrl.includes(this.hostUrl)) {
				this.RESTauthLoginUrl = config.hostUrl + this.RESTauthLoginUrl;
			}
    }

    this._ajax.setTimeout(this.ajaxTimeout);
  }
};

// replaced by gulp with real version at build time
h54s.version = '2.1.0';


h54s.prototype = require('./methods');

h54s.Tables = require('./tables');
h54s.Files = require('./files');
h54s.SasData = require('./sasData.js');

h54s.fromSasDateTime = require('./methods/utils.js').fromSasDateTime;
h54s.toSasDateTime = require('./tables/utils.js').toSasDateTime;

//self invoked function module
require('./ie_polyfills.js');

},{"./error.js":1,"./files":2,"./ie_polyfills.js":4,"./methods":7,"./methods/ajax.js":6,"./methods/utils.js":8,"./sasData.js":9,"./tables":10,"./tables/utils.js":11}],4:[function(require,module,exports){
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

if (window.NodeList && !NodeList.prototype.forEach) {
   NodeList.prototype.forEach = Array.prototype.forEach;
}
},{}],5:[function(require,module,exports){
const logs = {
  applicationLogs: [],
  debugData: [],
  sasErrors: [],
  failedRequests: []
};

const limits = {
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
  },
  getAllLogs: function () {
    return {
      sasErrors: logs.sasErrors,
      applicationLogs: logs.applicationLogs,
      debugData: logs.debugData,
      failedRequests: logs.failedRequests
    }
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

/**
*  Adds application logs to an array of logs
*
* @param {String} message - Message to add to applicationLogs
* @param {String} sasProgram - Header - which request did message come from
*
*/
module.exports.addApplicationLog = function(message, sasProgram) {
  if(message === 'blank') {
    return;
  }
  const log = {
    message:    message,
    time:       new Date(),
    sasProgram: sasProgram
  };
  logs.applicationLogs.push(log);

  if(logs.applicationLogs.length > limits.applicationLogs) {
    logs.applicationLogs.shift();
  }
};

/**
* Adds debug data to an array of logs
*
* @param {String} htmlData - Full html log from executor
* @param {String} debugText - Debug text that came after data output
* @param {String} sasProgram - Which program request did message come from
* @param {String} params - Web app params that were received
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

/**
* Adds failed requests to an array of failed request logs
*
* @param {String} responseText - Full html output from executor
* @param {String} debugText - Debug text that came after data output
* @param {String} sasProgram - Which program request did message come from
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

/**
* Adds SAS errors to an array of logs
*
* @param {Array} errors - Array of errors to concat to main log
*
*/
module.exports.addSasErrors = function(errors) {
  logs.sasErrors = logs.sasErrors.concat(errors);

  while(logs.sasErrors.length > limits.sasErrors) {
    logs.sasErrors.shift();
  }
};

},{}],6:[function(require,module,exports){
module.exports = function () {
  let timeout = 30000;
  let timeoutHandle;

  const xhr = function (type, url, data, multipartFormData, headers = {}) {
    const methods = {
      success: function () {
      },
      error: function () {
      }
    };

    const XHR = XMLHttpRequest;
    const request = new XHR('MSXML2.XMLHTTP.3.0');

    request.open(type, url, true);

    //multipart/form-data is set automatically so no need for else block
    // Content-Type header has to be explicitly set up
    if (!multipartFormData) {
      if (headers['Content-Type']) {
        request.setRequestHeader('Content-Type', headers['Content-Type'])
      } else {
        request.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      }
    }
    Object.keys(headers).forEach(key => {
      if (key !== 'Content-Type') {
        request.setRequestHeader(key, headers[key])
      }
    })
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

    if (timeout > 0) {
      timeoutHandle = setTimeout(function () {
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

  const serialize = function (obj) {
    const str = [];
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array) {
          for (let i = 0, n = obj[p].length; i < n; i++) {
            str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p][i]));
          }
        } else {
          str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
        }
      }
    }
    return str.join("&");
  };

  const createMultipartFormDataPayload = function (obj) {
    let data = new FormData();
    for (let p in obj) {
      if (obj.hasOwnProperty(p)) {
        if (obj[p] instanceof Array && p !== 'file') {
          for (let i = 0, n = obj[p].length; i < n; i++) {
            data.append(p, obj[p][i]);
          }
        } else if (p === 'file') {
          data.append(p, obj[p][0], obj[p][1]);
        } else {
          data.append(p, obj[p]);
        }
      }
    }
    return data;
  };

  return {
    get: function (url, data, multipartFormData, headers) {
      let dataStr;
      if (typeof data === 'object') {
        dataStr = serialize(data);
      }
      const urlWithParams = dataStr ? (url + '?' + dataStr) : url;
      return xhr('GET', urlWithParams, null, multipartFormData, headers);
    },
		post: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        } else {
          payload = serialize(data);
        }
      }
      return xhr('POST', url, payload, multipartFormData, headers);
    },
    put: function(url, data, multipartFormData, headers) {
      let payload = data;
      if(typeof data === 'object') {
        if(multipartFormData) {
          payload = createMultipartFormDataPayload(data);
        }
      }
      return xhr('PUT', url, payload, multipartFormData, headers);
    },
		delete: function(url, payload, multipartFormData, headers) {
    	return xhr('DELETE', url, payload, null, headers);
		},
    setTimeout: function (t) {
      timeout = t;
    },
    serialize
  };
};

},{}],7:[function(require,module,exports){
const h54sError = require('../error.js');
const logs = require('../logs.js');
const Tables = require('../tables');
const SasData = require('../sasData.js');
const Files = require('../files');

/**
* Call Sas program
*
* @param {string} sasProgram - Path of the sas program
* @param {Object} dataObj - Instance of Tables object with data added
* @param {function} callback - Callback function called when ajax call is finished
* @param {Object} params - object containing additional program parameters
*
*/
module.exports.call = function (sasProgram, dataObj, callback, params) {
	const self = this;
	let retryCount = 0;
	const dbg = this.debug
	const csrf = this.csrf;

	if (!callback || typeof callback !== 'function') {
		throw new h54sError('argumentError', 'You must provide a callback');
	}
	if (!sasProgram) {
		throw new h54sError('argumentError', 'You must provide Sas program file path');
	}
	if (typeof sasProgram !== 'string') {
		throw new h54sError('argumentError', 'First parameter should be string');
	}
	if (this.useMultipartFormData === false && !(dataObj instanceof Tables)) {
		throw new h54sError('argumentError', 'Cannot send files using application/x-www-form-urlencoded. Please use Tables or default value for useMultipartFormData');
	}

	if (!params) {
		params = {
			_program: this._utils.getFullProgramPath(this.metadataRoot, sasProgram),
			_debug: this.debug ? 131 : 0,
			_service: 'default',
			_csrf: csrf
		};
	} else {
		params = Object.assign({}, params, {_csrf: csrf})
	}

	if (dataObj) {
		let key, dataProvider;
		if (dataObj instanceof Tables) {
			dataProvider = dataObj._tables;
		} else if (dataObj instanceof Files || dataObj instanceof SasData) {
			dataProvider = dataObj._files;
		} else {
			console.log(new h54sError('argumentError', 'Wrong type of tables object'))
		}
		for (key in dataProvider) {
			if (dataProvider.hasOwnProperty(key)) {
				params[key] = dataProvider[key];
			}
		}
	}

	if (this._disableCalls) {
		this._pendingCalls.push({
			params,
			options: {
				sasProgram,
				dataObj,
				callback
			}
		});
		return;
	}

	this._ajax.post(this.url, params, this.useMultipartFormData).success(async function (res) {
		if (self._utils.needToLogin.call(self, res)) {
			//remember the call for latter use
			self._pendingCalls.push({
				params,
				options: {
					sasProgram,
					dataObj,
					callback
				}
			});

			//there's no need to continue if previous call returned login error
			if (self._disableCalls) {
				return;
			} else {
				self._disableCalls = true;
			}

			callback(new h54sError('notLoggedinError', 'You are not logged in'));
		} else {
			let resObj, unescapedResObj, err;
			let done = false;

			if (!dbg) {
				try {
					resObj = self._utils.parseRes(res.responseText, sasProgram, params);
					logs.addApplicationLog(resObj.logmessage, sasProgram);

					if (dataObj instanceof Tables) {
						unescapedResObj = self._utils.unescapeValues(resObj);
					} else {
						unescapedResObj = resObj;
					}

					if (resObj.status !== 'success') {
						err = new h54sError('programError', resObj.errormessage, resObj.status);
					}

					done = true;
				} catch (e) {
					if (e instanceof SyntaxError) {
						if (retryCount < self.maxXhrRetries) {
							done = false;
							self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
							retryCount++;
							logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
						} else {
							self._utils.parseErrorResponse(res.responseText, sasProgram);
							self._utils.addFailedResponse(res.responseText, sasProgram);
							err = new h54sError('parseError', 'Unable to parse response json');
							done = true;
						}
					} else if (e instanceof h54sError) {
						self._utils.parseErrorResponse(res.responseText, sasProgram);
						self._utils.addFailedResponse(res.responseText, sasProgram);
						err = e;
						done = true;
					} else {
						self._utils.parseErrorResponse(res.responseText, sasProgram);
						self._utils.addFailedResponse(res.responseText, sasProgram);
						err = new h54sError('unknownError', e.message);
						err.stack = e.stack;
						done = true;
					}
				} finally {
					if (done) {
						callback(err, unescapedResObj);
					}
				}
			} else {
				try {
					resObj = await self._utils.parseDebugRes(res.responseText, sasProgram, params, self.hostUrl, self.isViya);
					logs.addApplicationLog(resObj.logmessage, sasProgram);

					if (dataObj instanceof Tables) {
						unescapedResObj = self._utils.unescapeValues(resObj);
					} else {
						unescapedResObj = resObj;
					}

					if (resObj.status !== 'success') {
						err = new h54sError('programError', resObj.errormessage, resObj.status);
					}

					done = true;
				} catch (e) {
					if (e instanceof SyntaxError) {
						err = new h54sError('parseError', e.message);
						done = true;
					} else if (e instanceof h54sError) {
						if (e.type === 'parseError' && retryCount < 1) {
							done = false;
							self._ajax.post(self.url, params, self.useMultipartFormData).success(this.success).error(this.error);
							retryCount++;
							logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
						} else {
							if (e instanceof h54sError) {
								err = e;
							} else {
								err = new h54sError('parseError', 'Unable to parse response json');
							}
							done = true;
						}
					} else {
						err = new h54sError('unknownError', e.message);
						err.stack = e.stack;
						done = true;
					}
				} finally {
					if (done) {
						callback(err, unescapedResObj);
					}
				}
			}
		}
	}).error(function (res) {
		let _csrf
		if (res.status === 449 || (res.status === 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
			params['_csrf'] = _csrf;
			self.csrf = _csrf
			if (retryCount < self.maxXhrRetries) {
				self._ajax.post(self.url, params, true).success(this.success).error(this.error);
				retryCount++;
				logs.addApplicationLog("Retrying #" + retryCount, sasProgram);
			} else {
				self._utils.parseErrorResponse(res.responseText, sasProgram);
				self._utils.addFailedResponse(res.responseText, sasProgram);
				callback(new h54sError('parseError', 'Unable to parse response json'));
			}
		} else {
			logs.addApplicationLog('Request failed with status: ' + res.status, sasProgram);
			// if request has error text else callback
			callback(new h54sError('httpError', res.statusText));
		}
	});
};

/**
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
module.exports.login = function (user, pass, callback) {
	if (!user || !pass) {
		throw new h54sError('argumentError', 'Credentials not set');
	}
	if (typeof user !== 'string' || typeof pass !== 'string') {
		throw new h54sError('argumentError', 'User and pass parameters must be strings');
	}
	//NOTE: callback optional?
	if (!callback || typeof callback !== 'function') {
		throw new h54sError('argumentError', 'You must provide callback');
	}

	if (!this.RESTauth) {
		handleSasLogon.call(this, user, pass, callback);
	} else {
		handleRestLogon.call(this, user, pass, callback);
	}
};

/**
* ManagedRequest method
*
* @param {string} callMethod - get, post,
* @param {string} _url - URL to make request to
* @param {object} options - callback function as callback paramter in options object is required
*
*/
module.exports.managedRequest = function (callMethod = 'get', _url, options = {
	callback: () => console.log('Missing callback function')
}) {
	const self = this;
	const csrf = this.csrf;
	let retryCount = 0;
	const {useMultipartFormData, sasProgram, dataObj, params, callback, headers} = options

	if (sasProgram) {
		return self.call(sasProgram, dataObj, callback, params)
	}

	let url = _url
	if (!_url.startsWith('http')) {
		url = self.hostUrl + _url
	}

	const _headers = Object.assign({}, headers, {
		'X-CSRF-TOKEN': csrf
	})
	const _options = Object.assign({}, options, {
		headers: _headers
	})

	if (this._disableCalls) {
		this._customPendingCalls.push({
			callMethod,
			_url,
			options: _options
		});
		return;
	}

	self._ajax[callMethod](url, params, useMultipartFormData, _headers).success(function (res) {
		if (self._utils.needToLogin.call(self, res)) {
			//remember the call for latter use
			self._customPendingCalls.push({
				callMethod,
				_url,
				options: _options
			});

			//there's no need to continue if previous call returned login error
			if (self._disableCalls) {
				return;
			} else {
				self._disableCalls = true;
			}

			callback(new h54sError('notLoggedinError', 'You are not logged in'));
		} else {
			let resObj, err;
			let done = false;

			try {
				const arr = res.getAllResponseHeaders().split('\r\n');
				const resHeaders = arr.reduce(function (acc, current, i) {
					let parts = current.split(': ');
					acc[parts[0]] = parts[1];
					return acc;
				}, {});
				let body = res.responseText
				try {
					body = JSON.parse(body)
				} catch (e) {
					console.log('response is not JSON string')
				} finally {
					resObj = Object.assign({}, {
						headers: resHeaders,
						status: res.status,
						statusText: res.statusText,
						body
					})
					done = true;
				}
			} catch (e) {
				err = new h54sError('unknownError', e.message);
				err.stack = e.stack;
				done = true;

			} finally {
				if (done) {
					callback(err, resObj)
				}
			}
		}
	}).error(function (res) {
		let _csrf
		if (res.status == 449 || (res.status == 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
			self.csrf = _csrf
			const _headers = Object.assign({}, headers, {[res.getResponseHeader('X-CSRF-HEADER')]: _csrf})
			if (retryCount < self.maxXhrRetries) {
				self._ajax[callMethod](url, params, useMultipartFormData, _headers).success(this.success).error(this.error);
				retryCount++;
			} else {
				callback(new h54sError('parseError', 'Unable to parse response json'));
			}
		} else {
			logs.addApplicationLog('Managed request failed with status: ' + res.status, _url);
			// if request has error text else callback
			callback(new h54sError('httpError', res.responseText, res.status));
		}
	});
}

/**
 * Log on to SAS if we are asked to
 * @param {String} user - Username of user
 * @param {String} pass - Password of user
 * @param {function} callback - what to do after
 */
function handleSasLogon(user, pass, callback) {
	const self = this;

	const loginParams = {
		_service: 'default',
		//for SAS 9.4,
		username: user,
		password: pass
	};

	for (let key in this._aditionalLoginParams) {
		loginParams[key] = this._aditionalLoginParams[key];
	}

	this._loginAttempts = 0;

	this._ajax.post(this.loginUrl, loginParams)
		.success(handleSasLogonSuccess)
		.error(handleSasLogonError);

	function handleSasLogonError(res) {
		if (res.status == 449) {
			handleSasLogonSuccess(res);
			return;
		}

		logs.addApplicationLog('Login failed with status code: ' + res.status);
		callback(res.status);
	}

	function handleSasLogonSuccess(res) {
		if (++self._loginAttempts === 3) {
			return callback(-2);
		}
		if (self._utils.needToLogin.call(self, res)) {
			//we are getting form again after redirect
			//and need to login again using the new url
			//_loginChanged is set in needToLogin function
			//but if login url is not different, we are checking if there are aditional parameters
			if (self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
				delete self._loginChanged;
				const inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
				if (inputs) {
					inputs.forEach(function (inputStr) {
						const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
						loginParams[valueMatch[1]] = valueMatch[2];
					});
				}
				self._ajax.post(self.loginUrl, loginParams).success(function () {
					//we need this get request because of the sas 9.4 security checks
					self._ajax.get(self.url).success(handleSasLogonSuccess).error(handleSasLogonError);
				}).error(handleSasLogonError);
			}
			else {
				//getting form again, but it wasn't a redirect
				logs.addApplicationLog('Wrong username or password');
				callback(-1);
			}
		}
		else {
			self._disableCalls = false;
			callback(res.status);
			while (self._pendingCalls.length > 0) {
				const pendingCall = self._pendingCalls.shift();
				const method = pendingCall.method || self.call.bind(self);
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;
				if (self.retryAfterLogin) {
					method(sasProgram, null, callbackPending, params);
				}
			}
		}
	}
}
/**
 * REST logon for 9.4 v1 ticket based auth
 * @param {String} user -
 * @param {String} pass
 * @param {function} callback
 */
function handleRestLogon(user, pass, callback) {
	const self = this;

	const loginParams = {
		username: user,
		password: pass
	};

	this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function (res) {
		const location = res.getResponseHeader('Location');

		self._ajax.post(location, {
			service: self.url
		}).success(function (res) {
			if (self.url.indexOf('?') === -1) {
				self.url += '?ticket=' + res.responseText;
			} else {
				if (self.url.indexOf('ticket') !== -1) {
					self.url = self.url.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
				} else {
					self.url += '&ticket=' + res.responseText;
				}
			}

			callback(res.status);
		}).error(function (res) {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		});
	}).error(function (res) {
		if (res.responseText === 'error.authentication.credentials.bad') {
			callback(-1);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	});
}

/**
* Logout method
*
* @param {function} callback - Callback function called when logout is done
*
*/

module.exports.logout = function (callback) {
	const baseUrl = this.hostUrl || '';
	const url = baseUrl + this.logoutUrl;

	this._ajax.get(url).success(function (res) {
		this._disableCalls = true
		callback();
	}).error(function (res) {
		logs.addApplicationLog('Logout failed with status code: ' + res.status);
		callback(res.status);
	});
};

/*
* Enter debug mode
*
*/
module.exports.setDebugMode = function () {
	this.debug = true;
};

/*
* Exit debug mode and clear logs
*
*/
module.exports.unsetDebugMode = function () {
	this.debug = false;
};

for (let key in logs.get) {
	if (logs.get.hasOwnProperty(key)) {
		module.exports[key] = logs.get[key];
	}
}

for (let key in logs.clear) {
	if (logs.clear.hasOwnProperty(key)) {
		module.exports[key] = logs.clear[key];
	}
}

/*
* Add callback functions executed when properties are updated with remote config
*
*@callback - callback pushed to array
*
*/
module.exports.onRemoteConfigUpdate = function (callback) {
	this.remoteConfigUpdateCallbacks.push(callback);
};

module.exports._utils = require('./utils.js');

/**
 * Login call which returns a promise
 * @param {String} user - Username
 * @param {String} pass - Password
 */
module.exports.promiseLogin = function (user, pass) {
	return new Promise((resolve, reject) => {
		if (!user || !pass) {
			reject(new h54sError('argumentError', 'Credentials not set'))
		}
		if (typeof user !== 'string' || typeof pass !== 'string') {
			reject(new h54sError('argumentError', 'User and pass parameters must be strings'))
		}
		if (!this.RESTauth) {
			customHandleSasLogon.call(this, user, pass, resolve);
		} else {
			customHandleRestLogon.call(this, user, pass, resolve);
		}
	})
}

/**
 *
 * @param {String} user - Username
 * @param {String} pass - Password
 * @param {function} callback - function to call when successful
 */
function customHandleSasLogon(user, pass, callback) {
	const self = this;
	let loginParams = {
		_service: 'default',
		//for SAS 9.4,
		username: user,
		password: pass
	};

	for (let key in this._aditionalLoginParams) {
		loginParams[key] = this._aditionalLoginParams[key];
	}

	this._loginAttempts = 0;
	loginParams = this._ajax.serialize(loginParams)

	this._ajax.post(this.loginUrl, loginParams)
		.success(handleSasLogonSuccess)
		.error(handleSasLogonError);

	function handleSasLogonError(res) {
		if (res.status == 449) {
			handleSasLogonSuccess(res);
			// resolve(res.status);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	}

	function handleSasLogonSuccess(res) {
		if (++self._loginAttempts === 3) {
			callback(-2);
		}

		if (self._utils.needToLogin.call(self, res)) {
			//we are getting form again after redirect
			//and need to login again using the new url
			//_loginChanged is set in needToLogin function
			//but if login url is not different, we are checking if there are aditional parameters
			if (self._loginChanged || (self._isNewLoginPage && !self._aditionalLoginParams)) {
				delete self._loginChanged;
				const inputs = res.responseText.match(/<input.*"hidden"[^>]*>/g);
				if (inputs) {
					inputs.forEach(function (inputStr) {
						const valueMatch = inputStr.match(/name="([^"]*)"\svalue="([^"]*)/);
						loginParams[valueMatch[1]] = valueMatch[2];
					});
				}
				self._ajax.post(self.loginUrl, loginParams).success(function () {
					handleSasLogonSuccess()
				}).error(handleSasLogonError);
			}
			else {
				//getting form again, but it wasn't a redirect
				logs.addApplicationLog('Wrong username or password');
				callback(-1);
			}
		}
		else {
			self._disableCalls = false;
			callback(res.status);
			while (self._customPendingCalls.length > 0) {
				const pendingCall = self._customPendingCalls.shift()
				const method = pendingCall.method || self.managedRequest.bind(self);
				const callMethod = pendingCall.callMethod
				const _url = pendingCall._url
				const options = pendingCall.options;
				//update debug because it may change in the meantime
				if (options.params) {
					options.params._debug = self.debug ? 131 : 0;
				}
				if (self.retryAfterLogin) {
					method(callMethod, _url, options);
				}
			}

			while (self._pendingCalls.length > 0) {
				const pendingCall = self._pendingCalls.shift();
				const method = pendingCall.method || self.call.bind(self);
				const sasProgram = pendingCall.options.sasProgram;
				const callbackPending = pendingCall.options.callback;
				const params = pendingCall.params;
				//update debug because it may change in the meantime
				params._debug = self.debug ? 131 : 0;
				if (self.retryAfterLogin) {
					method(sasProgram, null, callbackPending, params);
				}
			}
		}
	};
}

/**
 * To be used with future managed metadata calls
 * @param {String} user - Username
 * @param {String} pass - Password
 * @param {function} callback - what to call after
 * @param {String} callbackUrl - where to navigate after getting ticket
 */
function customHandleRestLogon(user, pass, callback, callbackUrl) {
	const self = this;

	const loginParams = {
		username: user,
		password: pass
	};

	this._ajax.post(this.RESTauthLoginUrl, loginParams).success(function (res) {
		const location = res.getResponseHeader('Location');

		self._ajax.post(location, {
			service: callbackUrl
		}).success(function (res) {
			if (callbackUrl.indexOf('?') === -1) {
				callbackUrl += '?ticket=' + res.responseText;
			} else {
				if (callbackUrl.indexOf('ticket') !== -1) {
					callbackUrl = callbackUrl.replace(/ticket=[^&]+/, 'ticket=' + res.responseText);
				} else {
					callbackUrl += '&ticket=' + res.responseText;
				}
			}

			callback(res.status);
		}).error(function (res) {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		});
	}).error(function (res) {
		if (res.responseText === 'error.authentication.credentials.bad') {
			callback(-1);
		} else {
			logs.addApplicationLog('Login failed with status code: ' + res.status);
			callback(res.status);
		}
	});
}


// Utilility functions for handling files and folders on VIYA
/**
 * Returns the details of a folder from folder service
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.getFolderDetails = function (folderName, options) {
	// First call to get folder's id
	let url = "/folders/folders/@item?path=" + folderName
	return this.managedRequest('get', url, options);
}

/**
 * Returns the details of a file from files service
 * @param {String} fileUri - Full path of file to be found
 * @param {Object} options - Options object for managedRequest: cacheBust forces browser to fetch new file
 */
module.exports.getFileDetails = function (fileUri, options) {
	const cacheBust = options.cacheBust
	if (cacheBust) {
		fileUri += '?cacheBust=' + new Date().getTime()
	}
	return this.managedRequest('get', fileUri, options);
}

/**
 * Returns the contents of a file from files service
 * @param {String} fileUri - Full path of file to be downloaded
 * @param {Object} options - Options object for managedRequest: cacheBust forces browser to fetch new file
 */
module.exports.getFileContent = function (fileUri, options) {
	const cacheBust = options.cacheBust
	let uri = fileUri + '/content'
	if (cacheBust) {
		uri += '?cacheBust=' + new Date().getTime()
	}
	return this.managedRequest('get', uri, options);
}


// Util functions for working with files and folders
/**
 * Returns details about folder it self and it's members with details
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.getFolderContents = async function (folderName, options) {
	const self = this
	const {callback} = options

	// Second call to get folder's memebers
	const _callback = (err, data) => {
		// handle error of the first call
		if(err) {
			callback(err, data)
			return
		}
		let id = data.body.id
		let membersUrl = '/folders/folders/' + id + '/members' + '/?limit=10000000';
		return self.managedRequest('get', membersUrl, {callback})
	}

	// First call to get folder's id
	let url = "/folders/folders/@item?path=" + folderName
	const optionsObj = Object.assign({}, options, {
		callback: _callback
	})
	this.managedRequest('get', url, optionsObj)
}

/**
 * Creates a folder
 * @param {String} parentUri - The uri of the folder where the new child is being created
 * @param {String} folderName - Full path of folder to be found
 * @param {Object} options - Options object for managedRequest
 */
module.exports.createNewFolder = function (parentUri, folderName, options) {
	const headers = {
		'Accept': 'application/json, text/javascript, */*; q=0.01',
		'Content-Type': 'application/json',
	}

	const url = '/folders/folders?parentFolderUri=' + parentUri;
	const data = {
		'name': folderName,
		'type': "folder"
	}

	const optionsObj = Object.assign({}, options, {
		params: JSON.stringify(data),
		headers,
		useMultipartFormData: false
	})

	return this.managedRequest('post', url, optionsObj);
}

/**
 * Deletes a folder
 * @param {String} folderId - Full URI of folder to be deleted
 * @param {Object} options - Options object for managedRequest
 */
module.exports.deleteFolderById = function (folderId, options) {
	const url = '/folders/folders/' + folderId;
	return this.managedRequest('delete', url, options)
}

/**
 * Creates a new file
 * @param {String} fileName - Name of the file being created
 * @param {String} fileBlob - Content of the file
 * @param {String} parentFOlderUri - URI of the parent folder where the file is to be created
 * @param {Object} options - Options object for managedRequest
 */
module.exports.createNewFile = function (fileName, fileBlob, parentFolderUri, options) {
	let url = "/files/files#multipartUpload";
	let dataObj = {
		file: [fileBlob, fileName],
		parentFolderUri
	}

	const optionsObj = Object.assign({}, options, {
		params: dataObj,
		useMultipartFormData: true,
	})
	return this.managedRequest('post', url, optionsObj);
}

/**
 * Generic delete function that deletes by URI
 * @param {String} itemUri - Name of the item being deleted
 * @param {Object} options - Options object for managedRequest
 */
module.exports.deleteItem = function (itemUri, options) {
	return this.managedRequest('delete', itemUri, options)
}


/**
 * Updates contents of a file
 * @param {String} fileName - Name of the file being updated
 * @param {Object | Blob} dataObj - New content of the file (Object must contain file key)
 * Object example {
 *   file: [<blob>, <fileName>]
 * }
 * @param {String} lastModified - the last-modified header string that matches that of file being overwritten
 * @param {Object} options - Options object for managedRequest
 */
module.exports.updateFile = function (itemUri, dataObj, lastModified, options) {
	const url = itemUri + '/content'
	console.log('URL', url)
	let headers = {
		'Content-Type': 'application/vnd.sas.file',
		'If-Unmodified-Since': lastModified
	}
	const isBlob = dataObj instanceof Blob
	const useMultipartFormData = !isBlob // set useMultipartFormData to true if dataObj is not Blob

	const optionsObj = Object.assign({}, options, {
		params: dataObj,
		headers,
		useMultipartFormData
	})
	return this.managedRequest('put', url, optionsObj);
}

},{"../error.js":1,"../files":2,"../logs.js":5,"../sasData.js":9,"../tables":10,"./utils.js":8}],8:[function(require,module,exports){
const logs = require('../logs.js');
const h54sError = require('../error.js');

const programNotFoundPatt = /<title>(Stored Process Error|SASStoredProcess)<\/title>[\s\S]*<h2>(Stored process not found:.*|.*not a valid stored process path.)<\/h2>/;
const badJobDefinition = "<h2>Parameter Error <br/>Unable to get job definition.</h2>";

const responseReplace = function(res) {
  return res
};

/**
* Parse response from server
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
*
*/
module.exports.parseRes = function(responseText, sasProgram, params) {
  const matches = responseText.match(programNotFoundPatt);
  if(matches) {
    throw new h54sError('programNotFound', 'You have not been granted permission to perform this action, or the STP is missing.');
  }
  //remove new lines in json response
  //replace \\(d) with \(d) - SAS json parser is escaping it
  return JSON.parse(responseReplace(responseText));
};

/**
* Parse response from server in debug mode
*
* @param {object} responseText - response html from the server
* @param {string} sasProgram - sas program path
* @param {object} params - params sent to sas program with addTable
* @param {string} hostUrl - same as in h54s constructor
* @param {bool} isViya - same as in h54s constructor
*
*/
module.exports.parseDebugRes = function (responseText, sasProgram, params, hostUrl, isViya) {
	const self = this
	let matches = responseText.match(programNotFoundPatt);
	if (matches) {
		throw new h54sError('programNotFound', 'Sas program completed with errors');
	}

	if (isViya) {
		const matchesWrongJob = responseText.match(badJobDefinition);
		if (matchesWrongJob) {
			throw new h54sError('programNotFound', 'Sas program completed with errors. Unable to get job definition.');
		}
	}

	//find json
	let patt = isViya ? /^(.?<iframe.*src=")([^"]+)(.*iframe>)/m : /^(.?--h54s-data-start--)([\S\s]*?)(--h54s-data-end--)/m;
	matches = responseText.match(patt);

	const page = responseText.replace(patt, '');
	const htmlBodyPatt = /<body.*>([\s\S]*)<\/body>/;
	const bodyMatches = page.match(htmlBodyPatt);
	//remove html tags
	let debugText = bodyMatches[1].replace(/<[^>]*>/g, '');
	debugText = this.decodeHTMLEntities(debugText);

	logs.addDebugData(bodyMatches[1], debugText, sasProgram, params);

  if (isViya && this.parseErrorResponse(responseText, sasProgram)) {
		throw new h54sError('sasError', 'Sas program completed with errors');
	}
	if (!matches) {
		throw new h54sError('parseError', 'Unable to parse response json');
	}


	const promise = new Promise(function (resolve, reject) {
		let jsonObj
		if (isViya) {
			const xhr = new XMLHttpRequest();
			const baseUrl = hostUrl || "";
			xhr.open("GET", baseUrl + matches[2]);
			xhr.onload = function () {
				if (this.status >= 200 && this.status < 300) {
					resolve(JSON.parse(xhr.responseText.replace(/(\r\n|\r|\n)/g, '')));
				} else {
					reject(new h54sError('fetchError', xhr.statusText, this.status))
				}
			};
			xhr.onerror = function () {
				reject(new h54sError('fetchError', xhr.statusText))
			};
			xhr.send();
		} else {
			try {
				jsonObj = JSON.parse(responseReplace(matches[2]));
			} catch (e) {
				reject(new h54sError('parseError', 'Unable to parse response json'))
			}

			if (jsonObj && jsonObj.h54sAbort) {
				resolve(jsonObj);
			} else if (self.parseErrorResponse(responseText, sasProgram)) {
				reject(new h54sError('sasError', 'Sas program completed with errors'))
			} else {
				resolve(jsonObj);
			}
		}
	});

	return promise;
};

/**
* Add failed response to logs - used only if debug=false
*
* @param {string} responseText - response html from the server
* @param {string} sasProgram - sas program path
*
*/
module.exports.addFailedResponse = function(responseText, sasProgram) {
  const patt      = /<script([\s\S]*)\/form>/;
  const patt2     = /display\s?:\s?none;?\s?/;
  //remove script with form for toggling the logs and "display:none" from style
  responseText  = responseText.replace(patt, '').replace(patt2, '');
  let debugText = responseText.replace(/<[^>]*>/g, '');
  debugText = this.decodeHTMLEntities(debugText);

  logs.addFailedRequest(responseText, debugText, sasProgram);
};

/**
* Unescape all string values in returned object
*
* @param {object} obj
*
*/
module.exports.unescapeValues = function(obj) {
  for (let key in obj) {
    if (typeof obj[key] === 'string') {
      obj[key] = decodeURIComponent(obj[key]);
    } else if(typeof obj === 'object') {
      this.unescapeValues(obj[key]);
    }
  }
  return obj;
};

/**
* Parse error response from server and save errors in memory
*
* @param {string} res - server response
* @param {string} sasProgram - sas program which returned the response
*
*/
module.exports.parseErrorResponse = function(res, sasProgram) {
  //capture 'ERROR: [text].' or 'ERROR xx [text].'
  const patt    = /^ERROR(:\s|\s\d\d)(.*\.|.*\n.*\.)/gm;
  let errors  = res.replace(/(<([^>]+)>)/ig, '').match(patt);
  if(!errors) {
    return;
  }

  let errMessage;
  for(let i = 0, n = errors.length; i < n; i++) {
    errMessage  = errors[i].replace(/<[^>]*>/g, '').replace(/(\n|\s{2,})/g, ' ');
    errMessage  = this.decodeHTMLEntities(errMessage);
    errors[i]   = {
      sasProgram: sasProgram,
      message:    errMessage,
      time:       new Date()
    };
  }

  logs.addSasErrors(errors);

  return true;
};

/**
* Decode HTML entities - old utility function
*
* @param {string} res - server response
*
*/
module.exports.decodeHTMLEntities = function (html) {
  const tempElement = document.createElement('span');
  let str	= html.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi,
    function (str) {
      tempElement.innerHTML = str;
      str = tempElement.textContent || tempElement.innerText;
      return str;
    }
  );
  return str;
};

/**
* Convert sas time to javascript date
*
* @param {number} sasDate - sas Tate object
*
*/
module.exports.fromSasDateTime = function (sasDate) {
  const basedate = new Date("January 1, 1960 00:00:00");
  const currdate = sasDate;

  // offsets for UTC and timezones and BST
  const baseOffset = basedate.getTimezoneOffset(); // in minutes

  // convert sas datetime to a current valid javascript date
  const basedateMs  = basedate.getTime(); // in ms
  const currdateMs  = currdate * 1000; // to ms
  const sasDatetime = currdateMs + basedateMs;
  const jsDate      = new Date();
  jsDate.setTime(sasDatetime); // first time to get offset BST daylight savings etc
  const currOffset  = jsDate.getTimezoneOffset(); // adjust for offset in minutes
  const offsetVar   = (baseOffset - currOffset) * 60 * 1000; // difference in milliseconds
  const offsetTime  = sasDatetime - offsetVar; // finding BST and daylight savings
  jsDate.setTime(offsetTime); // update with offset
  return jsDate;
};

/**
 * Checks whether response object is a login redirect
 * @param {Object} responseObj xhr response to be checked for logon redirect
 */
module.exports.needToLogin = function(responseObj) {
	const isSASLogon = responseObj.responseURL && responseObj.responseURL.includes('SASLogon')
	if (isSASLogon === false) {
		return false
	}

  const patt = /<form.+action="(.*Logon[^"]*).*>/;
  const matches = patt.exec(responseObj.responseText);
  let newLoginUrl;

  if(!matches) {
    //there's no form, we are in. hooray!
    return false;
  } else {
    const actionUrl = matches[1].replace(/\?.*/, '');
    if(actionUrl.charAt(0) === '/') {
      newLoginUrl = this.hostUrl ? this.hostUrl + actionUrl : actionUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    } else {
      //relative path

      const lastIndOfSlash = responseObj.responseURL.lastIndexOf('/') + 1;
      //remove everything after the last slash, and everything until the first
      const relativeLoginUrl = responseObj.responseURL.substr(0, lastIndOfSlash).replace(/.*\/{2}[^\/]*/, '') + actionUrl;
      newLoginUrl = this.hostUrl ? this.hostUrl + relativeLoginUrl : relativeLoginUrl;
      if(newLoginUrl !== this.loginUrl) {
        this._loginChanged = true;
        this.loginUrl = newLoginUrl;
      }
    }

    //save parameters from hidden form fields
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseObj.responseText,"text/html");
    const res = doc.querySelectorAll("input[type='hidden']");
    const hiddenFormParams = {};
    if(res) {
      //it's new login page if we have these additional parameters
      this._isNewLoginPage = true;
      res.forEach(function(node) {
        hiddenFormParams[node.name] = node.value;
      });
      this._aditionalLoginParams = hiddenFormParams;
    }
    return true;
  }
};

/**
* Get full program path from metadata root and relative path
*
* @param {string} metadataRoot - Metadata root (path where all programs for the project are located)
* @param {string} sasProgramPath - Sas program path
*
*/
module.exports.getFullProgramPath = function(metadataRoot, sasProgramPath) {
  return metadataRoot ? metadataRoot.replace(/\/?$/, '/') + sasProgramPath.replace(/^\//, '') : sasProgramPath;
};

// Returns object where table rows are groupped by key
module.exports.getObjOfTable = function (table, key, value = null) {
	const obj = {}
	table.forEach(row => {
		obj[row[key]] = value ? row[value] : row
	})
	return obj
}

// Returns self uri out of links array
module.exports.getSelfUri = function (links) {
	return links
		.filter(e => e.rel === 'self')
		.map(e => e.uri)
		.shift();
}

},{"../error.js":1,"../logs.js":5}],9:[function(require,module,exports){
const h54sError = require('./error.js');
const logs      = require('./logs.js');
const Tables    = require('./tables');
const Files     = require('./files');
const toSasDateTime = require('./tables/utils.js').toSasDateTime;

/**
 * Checks whether a given table name is a valid SAS macro name
 * @param {String} macroName The SAS macro name to be given to this table
 */
function validateMacro(macroName) {
  if(macroName.length > 32) {
    throw new h54sError('argumentError', 'Table name too long. Maximum is 32 characters');
  }

  const charCodeAt0 = macroName.charCodeAt(0);
  // validate it starts with A-Z, a-z, or _
  if((charCodeAt0 < 65 || charCodeAt0 > 90) && (charCodeAt0 < 97 || charCodeAt0 > 122) && macroName[0] !== '_') {
    throw new h54sError('argumentError', 'Table name starting with number or special characters');
  }

  for(let i = 0; i < macroName.length; i++) {
    const charCode = macroName.charCodeAt(i);

    if((charCode < 48 || charCode > 57) &&
      (charCode < 65 || charCode > 90) &&
      (charCode < 97 || charCode > 122) &&
      macroName[i] !== '_')
    {
      throw new h54sError('argumentError', 'Table name has unsupported characters');
    }
  }
}

/**
* h54s SAS data object constructor
* @constructor
*
* @param {array|file} data - Table or file added when object is created
* @param {String} macroName The SAS macro name to be given to this table
* @param {number} parameterThreshold - size of data objects sent to SAS (legacy)
*
*/
function SasData(data, macroName, specs) {
  if(data instanceof Array) {
    this._files = {};
    this.addTable(data, macroName, specs);
  } else if(data instanceof File || data instanceof Blob) {
    Files.call(this, data, macroName);
  } else {
    throw new h54sError('argumentError', 'Data argument wrong type or missing');
  }
}

/**
* Add table to tables object
* @param {array} table - Array of table objects
* @param {String} macroName The SAS macro name to be given to this table
*
*/
SasData.prototype.addTable = function(table, macroName, specs) {
  const isSpecsProvided = !!specs;
  if(table && macroName) {
    if(!(table instanceof Array)) {
      throw new h54sError('argumentError', 'First argument must be array');
    }
    if(typeof macroName !== 'string') {
      throw new h54sError('argumentError', 'Second argument must be string');
    }

    validateMacro(macroName);
  } else {
    throw new h54sError('argumentError', 'Missing arguments');
  }

  if (typeof table !== 'object' || !(table instanceof Array)) {
    throw new h54sError('argumentError', 'Table argument is not an array');
  }

  let key;
  if(specs) {
    if(specs.constructor !== Object) {
      throw new h54sError('argumentError', 'Specs data type wrong. Object expected.');
    }
    for(key in table[0]) {
      if(!specs[key]) {
        throw new h54sError('argumentError', 'Missing columns in specs data.');
      }
    }
    for(key in specs) {
      if(specs[key].constructor !== Object) {
        throw new h54sError('argumentError', 'Wrong column descriptor in specs data.');
      }
      if(!specs[key].colType || !specs[key].colLength) {
        throw new h54sError('argumentError', 'Missing columns in specs descriptor.');
      }
    }
  }

  let i, j, //counters used latter in code
      row, val, type,
      specKeys = [];
	const specialChars = ['"', '\\', '/', '\n', '\t', '\f', '\r', '\b'];

  if(!specs) {
    specs = {};

    for (i = 0; i < table.length; i++) {
      row = table[i];

      if(typeof row !== 'object') {
        throw new h54sError('argumentError', 'Table item is not an object');
      }

      for(key in row) {
        if(row.hasOwnProperty(key)) {
          val  = row[key];
          type = typeof val;

          if(specs[key] === undefined) {
            specKeys.push(key);
            specs[key] = {};

            if (type === 'number') {
              if(val < Number.MIN_SAFE_INTEGER || val > Number.MAX_SAFE_INTEGER) {
                logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
              }
              specs[key].colType   = 'num';
              specs[key].colLength = 8;
            } else if (type === 'string' && !(val instanceof Date)) { // straightforward string
              specs[key].colType    = 'string';
              specs[key].colLength  = val.length;
            } else if(val instanceof Date) {
              specs[key].colType   = 'date';
              specs[key].colLength = 8;
            } else if (type === 'object') {
              specs[key].colType   = 'json';
              specs[key].colLength = JSON.stringify(val).length;
            }
          }
        }
      }
    }
  } else {
    specKeys = Object.keys(specs);
  }

  let sasCsv = '';

  // we need two loops - the first one is creating specs and validating
  for (i = 0; i < table.length; i++) {
    row = table[i];
    for(j = 0; j < specKeys.length; j++) {
      key = specKeys[j];
      if(row.hasOwnProperty(key)) {
        val  = row[key];
        type = typeof val;

        if(type === 'number' && isNaN(val)) {
          throw new h54sError('typeError', 'NaN value in one of the values (columns) is not allowed');
        }
        if(val === -Infinity || val === Infinity) {
          throw new h54sError('typeError', val.toString() + ' value in one of the values (columns) is not allowed');
        }
        if(val === true || val === false) {
          throw new h54sError('typeError', 'Boolean value in one of the values (columns) is not allowed');
        }
        if(type === 'string' && val.indexOf('\r\n') !== -1) {
          throw new h54sError('typeError', 'New line character is not supported');
        }

        // convert null to '.' for numbers and to '' for strings
        if(val === null) {
          if(specs[key].colType === 'string') {
            val = '';
            type = 'string';
          } else if(specs[key].colType === 'num') {
            val = '.';
            type = 'number';
          } else {
            throw new h54sError('typeError', 'Cannot convert null value');
          }
        }


        if ((type === 'number' && specs[key].colType !== 'num' && val !== '.') ||
          ((type === 'string' && !(val instanceof Date) && specs[key].colType !== 'string') &&
          (type === 'string' && specs[key].colType == 'num' && val !== '.')) ||
          (val instanceof Date && specs[key].colType !== 'date') ||
          ((type === 'object' && val.constructor !== Date) && specs[key].colType !== 'json'))
        {
          throw new h54sError('typeError', 'There is a specs type mismatch in the array between values (columns) of the same name.' +
            ' type/colType/val = ' + type +'/' + specs[key].colType + '/' + val );
        } else if(!isSpecsProvided && type === 'string' && specs[key].colLength < val.length) {
          specs[key].colLength = val.length;
        } else if((type === 'string' && specs[key].colLength < val.length) || (type !== 'string' && specs[key].colLength !== 8)) {
          throw new h54sError('typeError', 'There is a specs length mismatch in the array between values (columns) of the same name.' +
            ' type/colType/val = ' + type +'/' + specs[key].colType + '/' + val );
        }

        if (val instanceof Date) {
          val = toSasDateTime(val);
        }

        switch(specs[key].colType) {
          case 'num':
          case 'date':
            sasCsv += val;
            break;
          case 'string':
            sasCsv += '"' + val.replace(/"/g, '""') + '"';
            let colLength = val.length;
            for(let k = 0; k < val.length; k++) {
              if(specialChars.indexOf(val[k]) !== -1) {
                colLength++;
              } else {
                let code = val.charCodeAt(k);
                if(code > 0xffff) {
                  colLength += 3;
                } else if(code > 0x7ff) {
                  colLength += 2;
                } else if(code > 0x7f) {
                  colLength += 1;
                }
              }
            }
            // use maximum value between max previous, current value and 1 (first two can be 0 wich is not supported)
            specs[key].colLength = Math.max(specs[key].colLength, colLength, 1);
            break;
          case 'object':
            sasCsv += '"' + JSON.stringify(val).replace(/"/g, '""') + '"';
            break;
        }
      }
      // do not insert if it's the last column
      if(j < specKeys.length - 1) {
        sasCsv += ',';
      }
    }
    if(i < table.length - 1) {
      sasCsv += '\r\n';
    }
  }

  //convert specs to csv with pipes
  const specString = specKeys.map(function(key) {
    return key + ',' + specs[key].colType + ',' + specs[key].colLength;
  }).join('|');

  this._files[macroName] = [
    specString,
    new Blob([sasCsv], {type: 'text/csv;charset=UTF-8'})
  ];
};

/**
 * Add file as a verbatim blob file uplaod
 * @param {Blob} file - the blob that will be uploaded as file
 * @param {String} macroName - the SAS webin name given to this file
 */
SasData.prototype.addFile  = function(file, macroName) {
  Files.prototype.add.call(this, file, macroName);
};

module.exports = SasData;

},{"./error.js":1,"./files":2,"./logs.js":5,"./tables":10,"./tables/utils.js":11}],10:[function(require,module,exports){
const h54sError = require('../error.js');

/*
* h54s tables object constructor
* @constructor
*
*@param {array} table - Table added when object is created
*@param {string} macroName - macro name
*@param {number} parameterThreshold - size of data objects sent to SAS
*
*/
function Tables(table, macroName, parameterThreshold) {
  this._tables = {};
  this._parameterThreshold = parameterThreshold || 30000;

  Tables.prototype.add.call(this, table, macroName);
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

  const result = this._utils.convertTableObject(table, this._parameterThreshold);

  const tableArray = [];
  tableArray.push(JSON.stringify(result.spec));
  for (let numberOfTables = 0; numberOfTables < result.data.length; numberOfTables++) {
    const outString = JSON.stringify(result.data[numberOfTables]);
    tableArray.push(outString);
  }
  this._tables[macroName] = tableArray;
};

Tables.prototype._utils = require('./utils.js');

module.exports = Tables;

},{"../error.js":1,"./utils.js":11}],11:[function(require,module,exports){
const h54sError = require('../error.js');
const logs = require('../logs.js');

/*
* Convert table object to Sas readable object
*
* @param {object} inObject - Object to convert
*
*/
module.exports.convertTableObject = function(inObject, chunkThreshold) {
  const self            = this;

  if(chunkThreshold > 30000) {
    console.warn('You should not set threshold larger than 30kb because of the SAS limitations');
  }

  // first check that the object is an array
  if (typeof (inObject) !== 'object') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject is not an object');
  }

  const arrayLength = inObject.length;
  if (typeof (arrayLength) !== 'number') {
    throw new h54sError('argumentError', 'The parameter passed to checkAndGetTypeObject does not have a valid length and is most likely not an array');
  }

  const existingCols = {}; // this is just to make lookup easier rather than traversing array each time. Will transform after

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
  let chunkArrayCount         = 0; // this is for keeping tabs on how long the current array string would be
  const targetArray           = []; // this is the array of target arrays
  let currentTarget           = 0;
  targetArray[currentTarget]  = [];
  let j                       = 0;
  for (let i = 0; i < inObject.length; i++) {
    targetArray[currentTarget][j] = {};
    let chunkRowCount             = 0;

    for (let key in inObject[i]) {
      const thisSpec  = {};
      const thisValue = inObject[i][key];

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
      const thisType  = typeof (thisValue);

      if (thisType === 'number') { // straightforward number
        if(thisValue < Number.MIN_SAFE_INTEGER || thisValue > Number.MAX_SAFE_INTEGER) {
          logs.addApplicationLog('Object[' + i + '].' + key + ' - This value exceeds expected numeric precision.');
        }
        thisSpec.colName                    = key;
        thisSpec.colType                    = 'num';
        thisSpec.colLength                  = 8;
        thisSpec.encodedLength              = thisValue.toString().length;
        targetArray[currentTarget][j][key]  = thisValue;
      } else if (thisType === 'string') {
        thisSpec.colName    = key;
        thisSpec.colType    = 'string';
        thisSpec.colLength  = thisValue.length;

        if (thisValue === "") {
          targetArray[currentTarget][j][key] = " ";
        } else {
          targetArray[currentTarget][j][key] = encodeURIComponent(thisValue).replace(/'/g, '%27');
        }
        thisSpec.encodedLength = targetArray[currentTarget][j][key].length;
      } else if(thisValue instanceof Date) {
      	console.log("ERROR VALUE ", thisValue)
      	console.log("TYPEOF VALUE ", typeof thisValue)
        throw new h54sError('typeError', 'Date type not supported. Please use h54s.toSasDateTime function to convert it');
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

    //remove last added row if it's empty
    if(Object.keys(targetArray[currentTarget][j]).length === 0) {
      targetArray[currentTarget].splice(j, 1);
      continue;
    }

    if (chunkRowCount > chunkThreshold) {
      throw new h54sError('argumentError', 'Row ' + j + ' exceeds size limit of 32kb');
    } else if(chunkArrayCount + chunkRowCount > chunkThreshold) {
      //create new array if this one is full and move the last item to the new array
      const lastRow = targetArray[currentTarget].pop(); // get rid of that last row
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
  const specArray = [];
  for (let k in existingCols) {
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
  const basedate = new Date("January 1, 1960 00:00:00");
  const currdate = jsDate;

  // offsets for UTC and timezones and BST
  const baseOffset = basedate.getTimezoneOffset(); // in minutes
  const currOffset = currdate.getTimezoneOffset(); // in minutes

  // convert currdate to a sas datetime
  const offsetSecs    = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
  const baseDateSecs  = basedate.getTime() / 1000; // get rid of ms
  const currdateSecs  = currdate.getTime() / 1000; // get rid of ms
  const sasDatetime   = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

  return sasDatetime;
};

},{"../error.js":1,"../logs.js":5}]},{},[3])(3)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMzJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKlxuKiBoNTRzIGVycm9yIGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7c3RyaW5nfSB0eXBlIC0gRXJyb3IgdHlwZVxuKkBwYXJhbSB7c3RyaW5nfSBtZXNzYWdlIC0gRXJyb3IgbWVzc2FnZVxuKkBwYXJhbSB7c3RyaW5nfSBzdGF0dXMgLSBFcnJvciBzdGF0dXMgcmV0dXJuZWQgZnJvbSBTQVNcbipcbiovXG5mdW5jdGlvbiBoNTRzRXJyb3IodHlwZSwgbWVzc2FnZSwgc3RhdHVzKSB7XG4gIGlmKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcyk7XG4gIH1cbiAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgdGhpcy50eXBlICAgID0gdHlwZTtcbiAgdGhpcy5zdGF0dXMgID0gc3RhdHVzO1xufVxuXG5oNTRzRXJyb3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShFcnJvci5wcm90b3R5cGUsIHtcbiAgY29uc3RydWN0b3I6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogaDU0c0Vycm9yXG4gIH0sXG4gIG5hbWU6IHtcbiAgICBjb25maWd1cmFibGU6IGZhbHNlLFxuICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgIHdyaXRhYmxlOiBmYWxzZSxcbiAgICB2YWx1ZTogJ2g1NHNFcnJvcidcbiAgfVxufSk7XG5cbm1vZHVsZS5leHBvcnRzID0gaDU0c0Vycm9yO1xuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuLyoqXG4qIGg1NHMgU0FTIEZpbGVzIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbipAcGFyYW0ge2ZpbGV9IGZpbGUgLSBGaWxlIGFkZGVkIHdoZW4gb2JqZWN0IGlzIGNyZWF0ZWRcbipAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gbWFjcm8gbmFtZVxuKlxuKi9cbmZ1bmN0aW9uIEZpbGVzKGZpbGUsIG1hY3JvTmFtZSkge1xuICB0aGlzLl9maWxlcyA9IHt9O1xuXG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufVxuXG4vKipcbiogQWRkIGZpbGUgdG8gZmlsZXMgb2JqZWN0XG4qIEBwYXJhbSB7ZmlsZX0gZmlsZSAtIEluc3RhbmNlIG9mIEphdmFTY3JpcHQgRmlsZSBvYmplY3RcbiogQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIFNhcyBtYWNybyBuYW1lXG4qXG4qL1xuRmlsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKGZpbGUsIG1hY3JvTmFtZSkge1xuICBpZihmaWxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEoZmlsZSBpbnN0YW5jZW9mIEZpbGUgfHwgZmlsZSBpbnN0YW5jZW9mIEJsb2IpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgaW5zdGFuY2Ugb2YgRmlsZSBvYmplY3QnKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgJ0ZJTEUnLFxuICAgIGZpbGVcbiAgXTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmlsZXM7XG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuL2Vycm9yLmpzJyk7XG5cbmNvbnN0IHNhc1ZlcnNpb25NYXAgPSB7XG5cdHY5OiB7XG4gICAgdXJsOiAnL1NBU1N0b3JlZFByb2Nlc3MvZG8nLFxuICAgIGxvZ2luVXJsOiAnL1NBU0xvZ29uL2xvZ2luJyxcblx0XHRsb2dvdXRVcmw6ICcvU0FTU3RvcmVkUHJvY2Vzcy9kbz9fYWN0aW9uPWxvZ29mZicsXG4gICAgUkVTVEF1dGhMb2dpblVybDogJy9TQVNMb2dvbi92MS90aWNrZXRzJ1xuXHR9LFxuXHR2aXlhOiB7XG5cdFx0dXJsOiAnL1NBU0pvYkV4ZWN1dGlvbi8nLFxuICAgIGxvZ2luVXJsOiAnL1NBU0xvZ29uL2xvZ2luLmRvJyxcblx0XHRsb2dvdXRVcmw6ICcvU0FTTG9nb24vbG9nb3V0LmRvPycsXG4gICAgUkVTVEF1dGhMb2dpblVybDogJydcblx0fVxufVxuXG4vKipcbipcbiogQGNvbnN0cnVjdG9yXG4qIEBwYXJhbSB7T2JqZWN0fSBjb25maWcgLSBDb25maWd1cmF0aW9uIG9iamVjdCBmb3IgdGhlIEg1NFMgU0FTIEFkYXB0ZXJcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5zYXNWZXJzaW9uIC0gVmVyc2lvbiBvZiBTQVMsIGVpdGhlciAndjknIG9yICd2aXlhJ1xuKiBAcGFyYW0ge0Jvb2xlYW59IGNvbmZpZy5kZWJ1ZyAtIFdoZXRoZXIgZGVidWcgbW9kZSBpcyBlbmFibGVkLCBzZXRzIF9kZWJ1Zz0xMzFcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5tZXRhZGF0YVJvb3QgLSBCYXNlIHBhdGggb2YgYWxsIHByb2plY3Qgc2VydmljZXMgdG8gYmUgcHJlcGVuZGVkIHRvIF9wcm9ncmFtIHBhdGhcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy51cmwgLSBVUkkgb2YgdGhlIGpvYiBleGVjdXRvciAtIFNQV0Egb3IgSkVTXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcubG9naW5VcmwgLSBVUkkgb2YgdGhlIFNBU0xvZ29uIHdlYiBsb2dpbiBwYXRoIC0gb3ZlcnJpZGRlbiBieSBmb3JtIGFjdGlvblxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLmxvZ291dFVybCAtIFVSSSBvZiB0aGUgbG9nb3V0IGFjdGlvblxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLlJFU1RhdXRoIC0gQm9vbGVhbiB0byB0b2dnbGUgdXNlIG9mIFJFU1QgYXV0aGVudGljYXRpb24gaW4gU0FTIHY5XG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcuUkVTVGF1dGhMb2dpblVybCAtIEFkZHJlc3Mgb2YgU0FTTG9nb24gdGlja2V0cyBlbmRwb2ludCBmb3IgUkVTVCBhdXRoXG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLnJldHJ5QWZ0ZXJMb2dpbiAtIFdoZXRoZXIgdG8gcmVzdW1lIHJlcXVlc3RzIHdoaWNoIHdlcmUgcGFya2VkIHdpdGggbG9naW4gcmVkaXJlY3QgYWZ0ZXIgYSBzdWNjZXNzZnVsIHJlLWxvZ2luXG4qIEBwYXJhbSB7TnVtYmVyfSBjb25maWcubWF4WGhyUmV0cmllcyAtIElmIGEgcHJvZ3JhbSBjYWxsIGZhaWxzLCBhdHRlbXB0IHRvIGNhbGwgaXQgYWdhaW4gTiB0aW1lcyB1bnRpbCBpdCBzdWNjZWVkc1xuKiBAcGFyYW0ge051bWJlcn0gY29uZmlnLmFqYXhUaW1lb3V0IC0gTnVtYmVyIG9mIG1pbGxpc2Vjb25kcyB0byB3YWl0IGZvciBhIHJlc3BvbnNlIGJlZm9yZSBjbG9zaW5nIHRoZSByZXF1ZXN0XG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLnVzZU11bHRpcGFydEZvcm1EYXRhIC0gV2hldGhlciB0byB1c2UgbXVsdGlwYXJ0IGZvciBQT1NUIC0gZm9yIGxlZ2FjeSBiYWNrZW5kIHN1cHBvcnRcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5jc3JmIC0gQ1NSRiB0b2tlbiBmb3IgSkVTXG4qIEBcbipcbiovXG5jb25zdCBoNTRzID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihjb25maWcpIHtcbiAgLy8gRGVmYXVsdCBjb25maWcgdmFsdWVzLCBvdmVycmlkZGVuIGJ5IGFueXRoaW5nIGluIHRoZSBjb25maWcgb2JqZWN0XG5cdHRoaXMuc2FzVmVyc2lvbiAgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5zYXNWZXJzaW9uKSB8fCAndjknIC8vdXNlIHY5IGFzIGRlZmF1bHQ9XG4gIHRoaXMuZGVidWcgICAgICAgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5kZWJ1ZykgfHwgZmFsc2U7XG4gIHRoaXMubWV0YWRhdGFSb290XHRcdFx0XHRcdD0gKGNvbmZpZyAmJiBjb25maWcubWV0YWRhdGFSb290KSB8fCAnJztcbiAgdGhpcy51cmwgICAgICAgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS51cmw7XG4gIHRoaXMubG9naW5VcmwgICAgICAgICAgICAgPSBzYXNWZXJzaW9uTWFwW3RoaXMuc2FzVmVyc2lvbl0ubG9naW5Vcmw7XG4gIHRoaXMubG9nb3V0VXJsICAgICAgICAgICAgPSBzYXNWZXJzaW9uTWFwW3RoaXMuc2FzVmVyc2lvbl0ubG9nb3V0VXJsO1xuICB0aGlzLlJFU1RhdXRoICAgICAgICAgICAgID0gZmFsc2U7XG4gIHRoaXMuUkVTVGF1dGhMb2dpblVybCAgICAgPSBzYXNWZXJzaW9uTWFwW3RoaXMuc2FzVmVyc2lvbl0uUkVTVEF1dGhMb2dpblVybDtcbiAgdGhpcy5yZXRyeUFmdGVyTG9naW4gICAgICA9IHRydWU7XG4gIHRoaXMubWF4WGhyUmV0cmllcyAgICAgICAgPSA1O1xuICB0aGlzLmFqYXhUaW1lb3V0ICAgICAgICAgID0gKGNvbmZpZyAmJiBjb25maWcuYWpheFRpbWVvdXQpIHx8IDMwMDAwMDtcbiAgdGhpcy51c2VNdWx0aXBhcnRGb3JtRGF0YSA9IChjb25maWcgJiYgY29uZmlnLnVzZU11bHRpcGFydEZvcm1EYXRhKSB8fCB0cnVlO1xuICB0aGlzLmNzcmYgICAgICAgICAgICAgICAgID0gJydcbiAgdGhpcy5pc1ZpeWFcdFx0XHRcdFx0XHRcdFx0PSB0aGlzLnNhc1ZlcnNpb24gPT09ICd2aXlhJztcblxuICAvLyBJbml0aWFsaXNpbmcgY2FsbGJhY2sgc3RhY2tzIGZvciB3aGVuIGF1dGhlbnRpY2F0aW9uIGlzIHBhdXNlZFxuICB0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICB0aGlzLl9wZW5kaW5nQ2FsbHMgPSBbXTtcbiAgdGhpcy5fY3VzdG9tUGVuZGluZ0NhbGxzID0gW107XG4gIHRoaXMuX2Rpc2FibGVDYWxscyA9IGZhbHNlXG4gIHRoaXMuX2FqYXggPSByZXF1aXJlKCcuL21ldGhvZHMvYWpheC5qcycpKCk7XG5cbiAgX3NldENvbmZpZy5jYWxsKHRoaXMsIGNvbmZpZyk7XG5cbiAgLy8gSWYgdGhpcyBpbnN0YW5jZSB3YXMgZGVwbG95ZWQgd2l0aCBhIHN0YW5kYWxvbmUgY29uZmlnIGV4dGVybmFsIHRvIHRoZSBidWlsZCB1c2UgdGhhdFxuICBpZihjb25maWcgJiYgY29uZmlnLmlzUmVtb3RlQ29uZmlnKSB7XG4gICAgY29uc3Qgc2VsZiA9IHRoaXM7XG5cbiAgICB0aGlzLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXG4gICAgLy8gJ2g1NHNDb25maWcuanNvbicgaXMgZm9yIHRoZSB0ZXN0aW5nIHdpdGgga2FybWFcbiAgICAvL3JlcGxhY2VkIGJ5IGd1bHAgaW4gZGV2IGJ1aWxkIChkZWZpbmVkIGluIGd1bHBmaWxlIHVuZGVyIHByb3hpZXMpXG4gICAgdGhpcy5fYWpheC5nZXQoJ2g1NHNDb25maWcuanNvbicpLnN1Y2Nlc3MoZnVuY3Rpb24ocmVzKSB7XG4gICAgICBjb25zdCByZW1vdGVDb25maWcgPSBKU09OLnBhcnNlKHJlcy5yZXNwb25zZVRleHQpXG5cblx0XHRcdC8vIFNhdmUgbG9jYWwgY29uZmlnIGJlZm9yZSB1cGRhdGluZyBpdCB3aXRoIHJlbW90ZSBjb25maWdcblx0XHRcdGNvbnN0IGxvY2FsQ29uZmlnID0gT2JqZWN0LmFzc2lnbih7fSwgY29uZmlnKVxuXHRcdFx0Y29uc3Qgb2xkTWV0YWRhdGFSb290ID0gbG9jYWxDb25maWcubWV0YWRhdGFSb290O1xuXG4gICAgICBmb3IobGV0IGtleSBpbiByZW1vdGVDb25maWcpIHtcbiAgICAgICAgaWYocmVtb3RlQ29uZmlnLmhhc093blByb3BlcnR5KGtleSkgJiYga2V5ICE9PSAnaXNSZW1vdGVDb25maWcnKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSByZW1vdGVDb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBfc2V0Q29uZmlnLmNhbGwoc2VsZiwgY29uZmlnKTtcblxuICAgICAgLy8gRXhlY3V0ZSBjYWxsYmFja3Mgd2hlbiBvdmVycmlkZXMgZnJvbSByZW1vdGUgY29uZmlnIGFyZSBhcHBsaWVkXG4gICAgICBmb3IobGV0IGkgPSAwLCBuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3MubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgIGNvbnN0IGZuID0gc2VsZi5yZW1vdGVDb25maWdVcGRhdGVDYWxsYmFja3NbaV07XG4gICAgICAgIGZuKCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEV4ZWN1dGUgc2FzIGNhbGxzIGRpc2FibGVkIHdoaWxlIHdhaXRpbmcgZm9yIHRoZSBjb25maWdcbiAgICAgIHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuICAgICAgd2hpbGUoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgY29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcblx0XHRcdFx0Y29uc3QgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwub3B0aW9ucy5jYWxsYmFjaztcblx0XHRcdFx0Y29uc3QgcGFyYW1zID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICAvLyBVcGRhdGUgcHJvZ3JhbSBwYXRoIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBwYXJhbXMuX3Byb2dyYW0uaW5kZXhPZihzZWxmLm1ldGFkYXRhUm9vdCkgPT09IC0xKSB7XG4gICAgICAgICAgcGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgcGFyYW1zLl9wcm9ncmFtLnJlcGxhY2Uob2xkTWV0YWRhdGFSb290LCAnJykucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFVwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG4gICAgICAgIHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblxuICAgICAgICBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuICAgICAgfVxuXG4gICAgICAvLyBFeGVjdXRlIGN1c3RvbSBjYWxscyB0aGF0IHdlIG1hZGUgd2hpbGUgd2FpdGluZiBmb3IgdGhlIGNvbmZpZ1xuICAgICAgIHdoaWxlKHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG4gICAgICBcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLnNoaWZ0KClcblx0XHRcdFx0Y29uc3QgY2FsbE1ldGhvZCA9IHBlbmRpbmdDYWxsLmNhbGxNZXRob2Rcblx0XHRcdFx0Y29uc3QgX3VybCA9IHBlbmRpbmdDYWxsLl91cmxcblx0XHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHBlbmRpbmdDYWxsLm9wdGlvbnM7XG4gICAgICAgIC8vL3VwZGF0ZSBwcm9ncmFtIHdpdGggbWV0YWRhdGFSb290IGlmIGl0J3Mgbm90IHNldFxuICAgICAgICBpZihzZWxmLm1ldGFkYXRhUm9vdCAmJiBvcHRpb25zLnBhcmFtcyAmJiBvcHRpb25zLnBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBvcHRpb25zLnBhcmFtcy5fcHJvZ3JhbSA9IHNlbGYubWV0YWRhdGFSb290LnJlcGxhY2UoL1xcLz8kLywgJy8nKSArIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtLnJlcGxhY2Uob2xkTWV0YWRhdGFSb290LCAnJykucmVwbGFjZSgvXlxcLy8sICcnKTtcbiAgICAgICAgfVxuICAgICAgICAvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IGFsc28gbWF5IGhhdmUgY2hhbmdlZCBmcm9tIHJlbW90ZUNvbmZpZ1xuXHRcdFx0XHRpZiAob3B0aW9ucy5wYXJhbXMpIHtcblx0XHRcdFx0XHRvcHRpb25zLnBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLm1hbmFnZWRSZXF1ZXN0KGNhbGxNZXRob2QsIF91cmwsIG9wdGlvbnMpO1xuICAgICAgfVxuICAgIH0pLmVycm9yKGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FqYXhFcnJvcicsICdSZW1vdGUgY29uZmlnIGZpbGUgY2Fubm90IGJlIGxvYWRlZC4gSHR0cCBzdGF0dXMgY29kZTogJyArIGVyci5zdGF0dXMpO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gcHJpdmF0ZSBmdW5jdGlvbiB0byBzZXQgaDU0cyBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gIGZ1bmN0aW9uIF9zZXRDb25maWcoY29uZmlnKSB7XG4gICAgaWYoIWNvbmZpZykge1xuICAgICAgdGhpcy5fYWpheC5zZXRUaW1lb3V0KHRoaXMuYWpheFRpbWVvdXQpO1xuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSBpZih0eXBlb2YgY29uZmlnICE9PSAnb2JqZWN0Jykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBwYXJhbWV0ZXIgc2hvdWxkIGJlIGNvbmZpZyBvYmplY3QnKTtcbiAgICB9XG5cbiAgICAvL21lcmdlIGNvbmZpZyBvYmplY3QgZnJvbSBwYXJhbWV0ZXIgd2l0aCB0aGlzXG4gICAgZm9yKGxldCBrZXkgaW4gY29uZmlnKSB7XG4gICAgICBpZihjb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBpZigoa2V5ID09PSAndXJsJyB8fCBrZXkgPT09ICdsb2dpblVybCcpICYmIGNvbmZpZ1trZXldLmNoYXJBdCgwKSAhPT0gJy8nKSB7XG4gICAgICAgICAgY29uZmlnW2tleV0gPSAnLycgKyBjb25maWdba2V5XTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzW2tleV0gPSBjb25maWdba2V5XTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvL2lmIHNlcnZlciBpcyByZW1vdGUgdXNlIHRoZSBmdWxsIHNlcnZlciB1cmxcbiAgICAvL05PVEU6IFRoaXMgcmVxdWlyZXMgQ09SUyBhbmQgaXMgaGVyZSBmb3IgbGVnYWN5IHN1cHBvcnRcbiAgICBpZihjb25maWcuaG9zdFVybCkge1xuICAgICAgaWYoY29uZmlnLmhvc3RVcmwuY2hhckF0KGNvbmZpZy5ob3N0VXJsLmxlbmd0aCAtIDEpID09PSAnLycpIHtcbiAgICAgICAgY29uZmlnLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybC5zbGljZSgwLCAtMSk7XG4gICAgICB9XG4gICAgICB0aGlzLmhvc3RVcmwgPSBjb25maWcuaG9zdFVybDtcbiAgICAgIGlmICghdGhpcy51cmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLnVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy51cmw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMubG9naW5VcmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLmxvZ2luVXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLmxvZ2luVXJsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLlJFU1RhdXRoTG9naW5VcmwuaW5jbHVkZXModGhpcy5ob3N0VXJsKSkge1xuXHRcdFx0XHR0aGlzLlJFU1RhdXRoTG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMuUkVTVGF1dGhMb2dpblVybDtcblx0XHRcdH1cbiAgICB9XG5cbiAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gIH1cbn07XG5cbi8vIHJlcGxhY2VkIGJ5IGd1bHAgd2l0aCByZWFsIHZlcnNpb24gYXQgYnVpbGQgdGltZVxuaDU0cy52ZXJzaW9uID0gJ19fdmVyc2lvbl9fJztcblxuXG5oNTRzLnByb3RvdHlwZSA9IHJlcXVpcmUoJy4vbWV0aG9kcycpO1xuXG5oNTRzLlRhYmxlcyA9IHJlcXVpcmUoJy4vdGFibGVzJyk7XG5oNTRzLkZpbGVzID0gcmVxdWlyZSgnLi9maWxlcycpO1xuaDU0cy5TYXNEYXRhID0gcmVxdWlyZSgnLi9zYXNEYXRhLmpzJyk7XG5cbmg1NHMuZnJvbVNhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi9tZXRob2RzL3V0aWxzLmpzJykuZnJvbVNhc0RhdGVUaW1lO1xuaDU0cy50b1Nhc0RhdGVUaW1lID0gcmVxdWlyZSgnLi90YWJsZXMvdXRpbHMuanMnKS50b1Nhc0RhdGVUaW1lO1xuXG4vL3NlbGYgaW52b2tlZCBmdW5jdGlvbiBtb2R1bGVcbnJlcXVpcmUoJy4vaWVfcG9seWZpbGxzLmpzJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIU9iamVjdC5jcmVhdGUpIHtcbiAgICBPYmplY3QuY3JlYXRlID0gZnVuY3Rpb24ocHJvdG8sIHByb3BzKSB7XG4gICAgICBpZiAodHlwZW9mIHByb3BzICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgIHRocm93IFwiVGhlIG11bHRpcGxlLWFyZ3VtZW50IHZlcnNpb24gb2YgT2JqZWN0LmNyZWF0ZSBpcyBub3QgcHJvdmlkZWQgYnkgdGhpcyBicm93c2VyIGFuZCBjYW5ub3QgYmUgc2hpbW1lZC5cIjtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uIGN0b3IoKSB7IH1cbiAgICAgIGN0b3IucHJvdG90eXBlID0gcHJvdG87XG4gICAgICByZXR1cm4gbmV3IGN0b3IoKTtcbiAgICB9O1xuICB9XG5cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9rZXlzXG4gIGlmICghT2JqZWN0LmtleXMpIHtcbiAgICBPYmplY3Qua2V5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG4gICAgICB2YXIgaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LFxuICAgICAgICAgIGhhc0RvbnRFbnVtQnVnID0gISh7dG9TdHJpbmc6IG51bGx9KS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKSxcbiAgICAgICAgICBkb250RW51bXMgPSBbXG4gICAgICAgICAgICAndG9TdHJpbmcnLFxuICAgICAgICAgICAgJ3RvTG9jYWxlU3RyaW5nJyxcbiAgICAgICAgICAgICd2YWx1ZU9mJyxcbiAgICAgICAgICAgICdoYXNPd25Qcm9wZXJ0eScsXG4gICAgICAgICAgICAnaXNQcm90b3R5cGVPZicsXG4gICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLFxuICAgICAgICAgICAgJ2NvbnN0cnVjdG9yJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgZG9udEVudW1zTGVuZ3RoID0gZG9udEVudW1zLmxlbmd0aDtcblxuICAgICAgcmV0dXJuIGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09ICdvYmplY3QnICYmICh0eXBlb2Ygb2JqICE9PSAnZnVuY3Rpb24nIHx8IG9iaiA9PT0gbnVsbCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdPYmplY3Qua2V5cyBjYWxsZWQgb24gbm9uLW9iamVjdCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdCA9IFtdLCBwcm9wLCBpO1xuXG4gICAgICAgIGZvciAocHJvcCBpbiBvYmopIHtcbiAgICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChwcm9wKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaGFzRG9udEVudW1CdWcpIHtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZG9udEVudW1zTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgZG9udEVudW1zW2ldKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChkb250RW51bXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgfTtcbiAgICB9KCkpO1xuICB9XG5cbiAgLy8gRnJvbSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9BcnJheS9sYXN0SW5kZXhPZlxuICBpZiAoIUFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZikge1xuICAgIEFycmF5LnByb3RvdHlwZS5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKHNlYXJjaEVsZW1lbnQgLyosIGZyb21JbmRleCovKSB7XG4gICAgICAndXNlIHN0cmljdCc7XG5cbiAgICAgIGlmICh0aGlzID09PSB2b2lkIDAgfHwgdGhpcyA9PT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCk7XG4gICAgICB9XG5cbiAgICAgIHZhciBuLCBrLFxuICAgICAgICB0ID0gT2JqZWN0KHRoaXMpLFxuICAgICAgICBsZW4gPSB0Lmxlbmd0aCA+Pj4gMDtcbiAgICAgIGlmIChsZW4gPT09IDApIHtcbiAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgfVxuXG4gICAgICBuID0gbGVuIC0gMTtcbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBuID0gTnVtYmVyKGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGlmIChuICE9IG4pIHtcbiAgICAgICAgICBuID0gMDtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChuICE9PSAwICYmIG4gIT0gKDEgLyAwKSAmJiBuICE9IC0oMSAvIDApKSB7XG4gICAgICAgICAgbiA9IChuID4gMCB8fCAtMSkgKiBNYXRoLmZsb29yKE1hdGguYWJzKG4pKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmb3IgKGsgPSBuID49IDAgPyBNYXRoLm1pbihuLCBsZW4gLSAxKSA6IGxlbiAtIE1hdGguYWJzKG4pOyBrID49IDA7IGstLSkge1xuICAgICAgICBpZiAoayBpbiB0ICYmIHRba10gPT09IHNlYXJjaEVsZW1lbnQpIHtcbiAgICAgICAgICByZXR1cm4gaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cbn0oKTtcblxuaWYgKHdpbmRvdy5Ob2RlTGlzdCAmJiAhTm9kZUxpc3QucHJvdG90eXBlLmZvckVhY2gpIHtcbiAgIE5vZGVMaXN0LnByb3RvdHlwZS5mb3JFYWNoID0gQXJyYXkucHJvdG90eXBlLmZvckVhY2g7XG59IiwiY29uc3QgbG9ncyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiBbXSxcbiAgZGVidWdEYXRhOiBbXSxcbiAgc2FzRXJyb3JzOiBbXSxcbiAgZmFpbGVkUmVxdWVzdHM6IFtdXG59O1xuXG5jb25zdCBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfSxcbiAgZ2V0QWxsTG9nczogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICBzYXNFcnJvcnM6IGxvZ3Muc2FzRXJyb3JzLFxuICAgICAgYXBwbGljYXRpb25Mb2dzOiBsb2dzLmFwcGxpY2F0aW9uTG9ncyxcbiAgICAgIGRlYnVnRGF0YTogbG9ncy5kZWJ1Z0RhdGEsXG4gICAgICBmYWlsZWRSZXF1ZXN0czogbG9ncy5mYWlsZWRSZXF1ZXN0c1xuICAgIH1cbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLyoqXG4qICBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSAtIE1lc3NhZ2UgdG8gYWRkIHRvIGFwcGxpY2F0aW9uTG9nc1xuKiBAcGFyYW0ge1N0cmluZ30gc2FzUHJvZ3JhbSAtIEhlYWRlciAtIHdoaWNoIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XG4gIGlmKG1lc3NhZ2UgPT09ICdibGFuaycpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgbG9nID0ge1xuICAgIG1lc3NhZ2U6ICAgIG1lc3NhZ2UsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKSxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtXG4gIH07XG4gIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnB1c2gobG9nKTtcblxuICBpZihsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGggPiBsaW1pdHMuYXBwbGljYXRpb25Mb2dzKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc2hpZnQoKTtcbiAgfVxufTtcblxuLyoqXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSBodG1sRGF0YSAtIEZ1bGwgaHRtbCBsb2cgZnJvbSBleGVjdXRvclxuKiBAcGFyYW0ge1N0cmluZ30gZGVidWdUZXh0IC0gRGVidWcgdGV4dCB0aGF0IGNhbWUgYWZ0ZXIgZGF0YSBvdXRwdXRcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBXaGljaCBwcm9ncmFtIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMgLSBXZWIgYXBwIHBhcmFtcyB0aGF0IHdlcmUgcmVjZWl2ZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGREZWJ1Z0RhdGEgPSBmdW5jdGlvbihodG1sRGF0YSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgbG9ncy5kZWJ1Z0RhdGEucHVzaCh7XG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXG4gICAgZGVidWdUZXh0OiAgZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgaWYobG9ncy5kZWJ1Z0RhdGEubGVuZ3RoID4gbGltaXRzLmRlYnVnRGF0YSkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qKlxuKiBBZGRzIGZhaWxlZCByZXF1ZXN0cyB0byBhbiBhcnJheSBvZiBmYWlsZWQgcmVxdWVzdCBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSByZXNwb25zZVRleHQgLSBGdWxsIGh0bWwgb3V0cHV0IGZyb20gZXhlY3V0b3JcbiogQHBhcmFtIHtTdHJpbmd9IGRlYnVnVGV4dCAtIERlYnVnIHRleHQgdGhhdCBjYW1lIGFmdGVyIGRhdGEgb3V0cHV0XG4qIEBwYXJhbSB7U3RyaW5nfSBzYXNQcm9ncmFtIC0gV2hpY2ggcHJvZ3JhbSByZXF1ZXN0IGRpZCBtZXNzYWdlIGNvbWUgZnJvbVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlcXVlc3QgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xuICAgIHJlc3BvbnNlSHRtbDogcmVzcG9uc2VUZXh0LFxuICAgIHJlc3BvbnNlVGV4dDogZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcbiAgICB0aW1lOiAgICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgLy9tYXggMjAgZmFpbGVkIHJlcXVlc3RzXG4gIGlmKGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoID4gbGltaXRzLmZhaWxlZFJlcXVlc3RzKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKipcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtBcnJheX0gZXJyb3JzIC0gQXJyYXkgb2YgZXJyb3JzIHRvIGNvbmNhdCB0byBtYWluIGxvZ1xuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZFNhc0Vycm9ycyA9IGZ1bmN0aW9uKGVycm9ycykge1xuICBsb2dzLnNhc0Vycm9ycyA9IGxvZ3Muc2FzRXJyb3JzLmNvbmNhdChlcnJvcnMpO1xuXG4gIHdoaWxlKGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCA+IGxpbWl0cy5zYXNFcnJvcnMpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zaGlmdCgpO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIGxldCB0aW1lb3V0ID0gMzAwMDA7XG4gIGxldCB0aW1lb3V0SGFuZGxlO1xuXG4gIGNvbnN0IHhociA9IGZ1bmN0aW9uICh0eXBlLCB1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzID0ge30pIHtcbiAgICBjb25zdCBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoKSB7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IFhIUiA9IFhNTEh0dHBSZXF1ZXN0O1xuICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgWEhSKCdNU1hNTDIuWE1MSFRUUC4zLjAnKTtcblxuICAgIHJlcXVlc3Qub3Blbih0eXBlLCB1cmwsIHRydWUpO1xuXG4gICAgLy9tdWx0aXBhcnQvZm9ybS1kYXRhIGlzIHNldCBhdXRvbWF0aWNhbGx5IHNvIG5vIG5lZWQgZm9yIGVsc2UgYmxvY2tcbiAgICAvLyBDb250ZW50LVR5cGUgaGVhZGVyIGhhcyB0byBiZSBleHBsaWNpdGx5IHNldCB1cFxuICAgIGlmICghbXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgIGlmIChoZWFkZXJzWydDb250ZW50LVR5cGUnXSkge1xuICAgICAgICByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsIGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgICB9XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKGhlYWRlcnMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgIT09ICdDb250ZW50LVR5cGUnKSB7XG4gICAgICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgIH1cbiAgICB9KVxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYgKHRpbWVvdXQgPiAwKSB7XG4gICAgICB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlcXVlc3QuYWJvcnQoKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cblxuICAgIHJlcXVlc3Quc2VuZChkYXRhKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5lcnJvciA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIGNvbnN0IHNlcmlhbGl6ZSA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBjb25zdCBzdHIgPSBbXTtcbiAgICBmb3IgKGxldCBwIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZiAob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXVtpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9O1xuXG4gIGNvbnN0IGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZCA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBsZXQgZGF0YSA9IG5ldyBGb3JtRGF0YSgpO1xuICAgIGZvciAobGV0IHAgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmIChvYmpbcF0gaW5zdGFuY2VvZiBBcnJheSAmJiBwICE9PSAnZmlsZScpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVtpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHAgPT09ICdmaWxlJykge1xuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVswXSwgb2JqW3BdWzFdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgZ2V0OiBmdW5jdGlvbiAodXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgICAgbGV0IGRhdGFTdHI7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICB9XG4gICAgICBjb25zdCB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMsIG51bGwsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcbiAgICB9LFxuXHRcdHBvc3Q6IGZ1bmN0aW9uKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpIHtcbiAgICAgIGxldCBwYXlsb2FkID0gZGF0YTtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZihtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgICAgIHBheWxvYWQgPSBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQoZGF0YSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGF5bG9hZCA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHhocignUE9TVCcsIHVybCwgcGF5bG9hZCwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpO1xuICAgIH0sXG4gICAgcHV0OiBmdW5jdGlvbih1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XG4gICAgICBsZXQgcGF5bG9hZCA9IGRhdGE7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQVVQnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcbiAgICB9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24odXJsLCBwYXlsb2FkLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgIFx0cmV0dXJuIHhocignREVMRVRFJywgdXJsLCBwYXlsb2FkLCBudWxsLCBoZWFkZXJzKTtcblx0XHR9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uICh0KSB7XG4gICAgICB0aW1lb3V0ID0gdDtcbiAgICB9LFxuICAgIHNlcmlhbGl6ZVxuICB9O1xufTtcbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5jb25zdCBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuY29uc3QgVGFibGVzID0gcmVxdWlyZSgnLi4vdGFibGVzJyk7XG5jb25zdCBTYXNEYXRhID0gcmVxdWlyZSgnLi4vc2FzRGF0YS5qcycpO1xuY29uc3QgRmlsZXMgPSByZXF1aXJlKCcuLi9maWxlcycpO1xuXG4vKipcbiogQ2FsbCBTYXMgcHJvZ3JhbVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIFBhdGggb2YgdGhlIHNhcyBwcm9ncmFtXG4qIEBwYXJhbSB7T2JqZWN0fSBkYXRhT2JqIC0gSW5zdGFuY2Ugb2YgVGFibGVzIG9iamVjdCB3aXRoIGRhdGEgYWRkZWRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbiogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyAtIG9iamVjdCBjb250YWluaW5nIGFkZGl0aW9uYWwgcHJvZ3JhbSBwYXJhbWV0ZXJzXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY2FsbCA9IGZ1bmN0aW9uIChzYXNQcm9ncmFtLCBkYXRhT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRsZXQgcmV0cnlDb3VudCA9IDA7XG5cdGNvbnN0IGRiZyA9IHRoaXMuZGVidWdcblx0Y29uc3QgY3NyZiA9IHRoaXMuY3NyZjtcblxuXHRpZiAoIWNhbGxiYWNrIHx8IHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBhIGNhbGxiYWNrJyk7XG5cdH1cblx0aWYgKCFzYXNQcm9ncmFtKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIFNhcyBwcm9ncmFtIGZpbGUgcGF0aCcpO1xuXHR9XG5cdGlmICh0eXBlb2Ygc2FzUHJvZ3JhbSAhPT0gJ3N0cmluZycpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgc3RyaW5nJyk7XG5cdH1cblx0aWYgKHRoaXMudXNlTXVsdGlwYXJ0Rm9ybURhdGEgPT09IGZhbHNlICYmICEoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0Nhbm5vdCBzZW5kIGZpbGVzIHVzaW5nIGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZC4gUGxlYXNlIHVzZSBUYWJsZXMgb3IgZGVmYXVsdCB2YWx1ZSBmb3IgdXNlTXVsdGlwYXJ0Rm9ybURhdGEnKTtcblx0fVxuXG5cdGlmICghcGFyYW1zKSB7XG5cdFx0cGFyYW1zID0ge1xuXHRcdFx0X3Byb2dyYW06IHRoaXMuX3V0aWxzLmdldEZ1bGxQcm9ncmFtUGF0aCh0aGlzLm1ldGFkYXRhUm9vdCwgc2FzUHJvZ3JhbSksXG5cdFx0XHRfZGVidWc6IHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuXHRcdFx0X3NlcnZpY2U6ICdkZWZhdWx0Jyxcblx0XHRcdF9jc3JmOiBjc3JmXG5cdFx0fTtcblx0fSBlbHNlIHtcblx0XHRwYXJhbXMgPSBPYmplY3QuYXNzaWduKHt9LCBwYXJhbXMsIHtfY3NyZjogY3NyZn0pXG5cdH1cblxuXHRpZiAoZGF0YU9iaikge1xuXHRcdGxldCBrZXksIGRhdGFQcm92aWRlcjtcblx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0ZGF0YVByb3ZpZGVyID0gZGF0YU9iai5fdGFibGVzO1xuXHRcdH0gZWxzZSBpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIEZpbGVzIHx8IGRhdGFPYmogaW5zdGFuY2VvZiBTYXNEYXRhKSB7XG5cdFx0XHRkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl9maWxlcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5sb2cobmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyB0eXBlIG9mIHRhYmxlcyBvYmplY3QnKSlcblx0XHR9XG5cdFx0Zm9yIChrZXkgaW4gZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHRpZiAoZGF0YVByb3ZpZGVyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRcdFx0cGFyYW1zW2tleV0gPSBkYXRhUHJvdmlkZXJba2V5XTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAodGhpcy5fZGlzYWJsZUNhbGxzKSB7XG5cdFx0dGhpcy5fcGVuZGluZ0NhbGxzLnB1c2goe1xuXHRcdFx0cGFyYW1zLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRzYXNQcm9ncmFtLFxuXHRcdFx0XHRkYXRhT2JqLFxuXHRcdFx0XHRjYWxsYmFja1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLnVybCwgcGFyYW1zLCB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKGFzeW5jIGZ1bmN0aW9uIChyZXMpIHtcblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG5cdFx0XHQvL3JlbWVtYmVyIHRoZSBjYWxsIGZvciBsYXR0ZXIgdXNlXG5cdFx0XHRzZWxmLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG5cdFx0XHRcdHBhcmFtcyxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNhc1Byb2dyYW0sXG5cdFx0XHRcdFx0ZGF0YU9iaixcblx0XHRcdFx0XHRjYWxsYmFja1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly90aGVyZSdzIG5vIG5lZWQgdG8gY29udGludWUgaWYgcHJldmlvdXMgY2FsbCByZXR1cm5lZCBsb2dpbiBlcnJvclxuXHRcdFx0aWYgKHNlbGYuX2Rpc2FibGVDYWxscykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHJlc09iaiwgdW5lc2NhcGVkUmVzT2JqLCBlcnI7XG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoIWRiZykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc09iaiA9IHNlbGYuX3V0aWxzLnBhcnNlUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cblx0XHRcdFx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuXHRcdFx0XHRcdFx0aWYgKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcblx0XHRcdFx0XHRcdFx0ZG9uZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuXHRcdFx0XHRcdFx0XHRyZXRyeUNvdW50Kys7XG5cdFx0XHRcdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0XHRcdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdGVyciA9IGU7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0ZXJyLnN0YWNrID0gZS5zdGFjaztcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXNPYmogPSBhd2FpdCBzZWxmLl91dGlscy5wYXJzZURlYnVnUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcywgc2VsZi5ob3N0VXJsLCBzZWxmLmlzVml5YSk7XG5cdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cblx0XHRcdFx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmIChlLnR5cGUgPT09ICdwYXJzZUVycm9yJyAmJiByZXRyeUNvdW50IDwgMSkge1xuXHRcdFx0XHRcdFx0XHRkb25lID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRlcnIgPSBlO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRsZXQgX2NzcmZcblx0XHRpZiAocmVzLnN0YXR1cyA9PT0gNDQ5IHx8IChyZXMuc3RhdHVzID09PSA0MDMgJiYgKHJlcy5yZXNwb25zZVRleHQuaW5jbHVkZXMoJ19jc3JmJykgfHwgcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdYLUZvcmJpZGRlbi1SZWFzb24nKSA9PT0gJ0NTUkYnKSAmJiAoX2NzcmYgPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIocmVzLmdldFJlc3BvbnNlSGVhZGVyKCdYLUNTUkYtSEVBREVSJykpKSkpIHtcblx0XHRcdHBhcmFtc1snX2NzcmYnXSA9IF9jc3JmO1xuXHRcdFx0c2VsZi5jc3JmID0gX2NzcmZcblx0XHRcdGlmIChyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XG5cdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCB0cnVlKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnUmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBzYXNQcm9ncmFtKTtcblx0XHRcdC8vIGlmIHJlcXVlc3QgaGFzIGVycm9yIHRleHQgZWxzZSBjYWxsYmFja1xuXHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcignaHR0cEVycm9yJywgcmVzLnN0YXR1c1RleHQpKTtcblx0XHR9XG5cdH0pO1xufTtcblxuLyoqXG4qIExvZ2luIG1ldGhvZFxuKlxuKiBAcGFyYW0ge3N0cmluZ30gdXNlciAtIExvZ2luIHVzZXJuYW1lXG4qIEBwYXJhbSB7c3RyaW5nfSBwYXNzIC0gTG9naW4gcGFzc3dvcmRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiogT1JcbipcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5sb2dpbiA9IGZ1bmN0aW9uICh1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuXHRpZiAoIXVzZXIgfHwgIXBhc3MpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0NyZWRlbnRpYWxzIG5vdCBzZXQnKTtcblx0fVxuXHRpZiAodHlwZW9mIHVzZXIgIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBwYXNzICE9PSAnc3RyaW5nJykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVXNlciBhbmQgcGFzcyBwYXJhbWV0ZXJzIG11c3QgYmUgc3RyaW5ncycpO1xuXHR9XG5cdC8vTk9URTogY2FsbGJhY2sgb3B0aW9uYWw/XG5cdGlmICghY2FsbGJhY2sgfHwgdHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIGNhbGxiYWNrJyk7XG5cdH1cblxuXHRpZiAoIXRoaXMuUkVTVGF1dGgpIHtcblx0XHRoYW5kbGVTYXNMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIGNhbGxiYWNrKTtcblx0fSBlbHNlIHtcblx0XHRoYW5kbGVSZXN0TG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCBjYWxsYmFjayk7XG5cdH1cbn07XG5cbi8qKlxuKiBNYW5hZ2VkUmVxdWVzdCBtZXRob2RcbipcbiogQHBhcmFtIHtzdHJpbmd9IGNhbGxNZXRob2QgLSBnZXQsIHBvc3QsXG4qIEBwYXJhbSB7c3RyaW5nfSBfdXJsIC0gVVJMIHRvIG1ha2UgcmVxdWVzdCB0b1xuKiBAcGFyYW0ge29iamVjdH0gb3B0aW9ucyAtIGNhbGxiYWNrIGZ1bmN0aW9uIGFzIGNhbGxiYWNrIHBhcmFtdGVyIGluIG9wdGlvbnMgb2JqZWN0IGlzIHJlcXVpcmVkXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMubWFuYWdlZFJlcXVlc3QgPSBmdW5jdGlvbiAoY2FsbE1ldGhvZCA9ICdnZXQnLCBfdXJsLCBvcHRpb25zID0ge1xuXHRjYWxsYmFjazogKCkgPT4gY29uc29sZS5sb2coJ01pc3NpbmcgY2FsbGJhY2sgZnVuY3Rpb24nKVxufSkge1xuXHRjb25zdCBzZWxmID0gdGhpcztcblx0Y29uc3QgY3NyZiA9IHRoaXMuY3NyZjtcblx0bGV0IHJldHJ5Q291bnQgPSAwO1xuXHRjb25zdCB7dXNlTXVsdGlwYXJ0Rm9ybURhdGEsIHNhc1Byb2dyYW0sIGRhdGFPYmosIHBhcmFtcywgY2FsbGJhY2ssIGhlYWRlcnN9ID0gb3B0aW9uc1xuXG5cdGlmIChzYXNQcm9ncmFtKSB7XG5cdFx0cmV0dXJuIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBkYXRhT2JqLCBjYWxsYmFjaywgcGFyYW1zKVxuXHR9XG5cblx0bGV0IHVybCA9IF91cmxcblx0aWYgKCFfdXJsLnN0YXJ0c1dpdGgoJ2h0dHAnKSkge1xuXHRcdHVybCA9IHNlbGYuaG9zdFVybCArIF91cmxcblx0fVxuXG5cdGNvbnN0IF9oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgaGVhZGVycywge1xuXHRcdCdYLUNTUkYtVE9LRU4nOiBjc3JmXG5cdH0pXG5cdGNvbnN0IF9vcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuXHRcdGhlYWRlcnM6IF9oZWFkZXJzXG5cdH0pXG5cblx0aWYgKHRoaXMuX2Rpc2FibGVDYWxscykge1xuXHRcdHRoaXMuX2N1c3RvbVBlbmRpbmdDYWxscy5wdXNoKHtcblx0XHRcdGNhbGxNZXRob2QsXG5cdFx0XHRfdXJsLFxuXHRcdFx0b3B0aW9uczogX29wdGlvbnNcblx0XHR9KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRzZWxmLl9hamF4W2NhbGxNZXRob2RdKHVybCwgcGFyYW1zLCB1c2VNdWx0aXBhcnRGb3JtRGF0YSwgX2hlYWRlcnMpLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcblx0XHRcdC8vcmVtZW1iZXIgdGhlIGNhbGwgZm9yIGxhdHRlciB1c2Vcblx0XHRcdHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5wdXNoKHtcblx0XHRcdFx0Y2FsbE1ldGhvZCxcblx0XHRcdFx0X3VybCxcblx0XHRcdFx0b3B0aW9uczogX29wdGlvbnNcblx0XHRcdH0pO1xuXG5cdFx0XHQvL3RoZXJlJ3Mgbm8gbmVlZCB0byBjb250aW51ZSBpZiBwcmV2aW91cyBjYWxsIHJldHVybmVkIGxvZ2luIGVycm9yXG5cdFx0XHRpZiAoc2VsZi5fZGlzYWJsZUNhbGxzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlbGYuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ25vdExvZ2dlZGluRXJyb3InLCAnWW91IGFyZSBub3QgbG9nZ2VkIGluJykpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgcmVzT2JqLCBlcnI7XG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhcnIgPSByZXMuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkuc3BsaXQoJ1xcclxcbicpO1xuXHRcdFx0XHRjb25zdCByZXNIZWFkZXJzID0gYXJyLnJlZHVjZShmdW5jdGlvbiAoYWNjLCBjdXJyZW50LCBpKSB7XG5cdFx0XHRcdFx0bGV0IHBhcnRzID0gY3VycmVudC5zcGxpdCgnOiAnKTtcblx0XHRcdFx0XHRhY2NbcGFydHNbMF1dID0gcGFydHNbMV07XG5cdFx0XHRcdFx0cmV0dXJuIGFjYztcblx0XHRcdFx0fSwge30pO1xuXHRcdFx0XHRsZXQgYm9keSA9IHJlcy5yZXNwb25zZVRleHRcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRib2R5ID0gSlNPTi5wYXJzZShib2R5KVxuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coJ3Jlc3BvbnNlIGlzIG5vdCBKU09OIHN0cmluZycpXG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0cmVzT2JqID0gT2JqZWN0LmFzc2lnbih7fSwge1xuXHRcdFx0XHRcdFx0aGVhZGVyczogcmVzSGVhZGVycyxcblx0XHRcdFx0XHRcdHN0YXR1czogcmVzLnN0YXR1cyxcblx0XHRcdFx0XHRcdHN0YXR1c1RleHQ6IHJlcy5zdGF0dXNUZXh0LFxuXHRcdFx0XHRcdFx0Ym9keVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcblx0XHRcdFx0ZXJyLnN0YWNrID0gZS5zdGFjaztcblx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmIChkb25lKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2soZXJyLCByZXNPYmopXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRsZXQgX2NzcmZcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkgfHwgKHJlcy5zdGF0dXMgPT0gNDAzICYmIChyZXMucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdfY3NyZicpIHx8IHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1Gb3JiaWRkZW4tUmVhc29uJykgPT09ICdDU1JGJykgJiYgKF9jc3JmID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpKSkpKSB7XG5cdFx0XHRzZWxmLmNzcmYgPSBfY3NyZlxuXHRcdFx0Y29uc3QgX2hlYWRlcnMgPSBPYmplY3QuYXNzaWduKHt9LCBoZWFkZXJzLCB7W3Jlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpXTogX2NzcmZ9KVxuXHRcdFx0aWYgKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcblx0XHRcdFx0c2VsZi5fYWpheFtjYWxsTWV0aG9kXSh1cmwsIHBhcmFtcywgdXNlTXVsdGlwYXJ0Rm9ybURhdGEsIF9oZWFkZXJzKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ01hbmFnZWQgcmVxdWVzdCBmYWlsZWQgd2l0aCBzdGF0dXM6ICcgKyByZXMuc3RhdHVzLCBfdXJsKTtcblx0XHRcdC8vIGlmIHJlcXVlc3QgaGFzIGVycm9yIHRleHQgZWxzZSBjYWxsYmFja1xuXHRcdFx0Y2FsbGJhY2sobmV3IGg1NHNFcnJvcignaHR0cEVycm9yJywgcmVzLnJlc3BvbnNlVGV4dCwgcmVzLnN0YXR1cykpO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuICogTG9nIG9uIHRvIFNBUyBpZiB3ZSBhcmUgYXNrZWQgdG9cbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWUgb2YgdXNlclxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3MgLSBQYXNzd29yZCBvZiB1c2VyXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIHdoYXQgdG8gZG8gYWZ0ZXJcbiAqL1xuZnVuY3Rpb24gaGFuZGxlU2FzTG9nb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cblx0Y29uc3QgbG9naW5QYXJhbXMgPSB7XG5cdFx0X3NlcnZpY2U6ICdkZWZhdWx0Jyxcblx0XHQvL2ZvciBTQVMgOS40LFxuXHRcdHVzZXJuYW1lOiB1c2VyLFxuXHRcdHBhc3N3b3JkOiBwYXNzXG5cdH07XG5cblx0Zm9yIChsZXQga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG5cdFx0bG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG5cdH1cblxuXHR0aGlzLl9sb2dpbkF0dGVtcHRzID0gMDtcblxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpXG5cdFx0LnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKVxuXHRcdC5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvbkVycm9yKHJlcykge1xuXHRcdGlmIChyZXMuc3RhdHVzID09IDQ0OSkge1xuXHRcdFx0aGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpIHtcblx0XHRpZiAoKytzZWxmLl9sb2dpbkF0dGVtcHRzID09PSAzKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soLTIpO1xuXHRcdH1cblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG5cdFx0XHQvL3dlIGFyZSBnZXR0aW5nIGZvcm0gYWdhaW4gYWZ0ZXIgcmVkaXJlY3Rcblx0XHRcdC8vYW5kIG5lZWQgdG8gbG9naW4gYWdhaW4gdXNpbmcgdGhlIG5ldyB1cmxcblx0XHRcdC8vX2xvZ2luQ2hhbmdlZCBpcyBzZXQgaW4gbmVlZFRvTG9naW4gZnVuY3Rpb25cblx0XHRcdC8vYnV0IGlmIGxvZ2luIHVybCBpcyBub3QgZGlmZmVyZW50LCB3ZSBhcmUgY2hlY2tpbmcgaWYgdGhlcmUgYXJlIGFkaXRpb25hbCBwYXJhbWV0ZXJzXG5cdFx0XHRpZiAoc2VsZi5fbG9naW5DaGFuZ2VkIHx8IChzZWxmLl9pc05ld0xvZ2luUGFnZSAmJiAhc2VsZi5fYWRpdGlvbmFsTG9naW5QYXJhbXMpKSB7XG5cdFx0XHRcdGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XG5cdFx0XHRcdGNvbnN0IGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcblx0XHRcdFx0aWYgKGlucHV0cykge1xuXHRcdFx0XHRcdGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uIChpbnB1dFN0cikge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcblx0XHRcdFx0XHRcdGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdC8vd2UgbmVlZCB0aGlzIGdldCByZXF1ZXN0IGJlY2F1c2Ugb2YgdGhlIHNhcyA5LjQgc2VjdXJpdHkgY2hlY2tzXG5cdFx0XHRcdFx0c2VsZi5fYWpheC5nZXQoc2VsZi51cmwpLnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKS5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblx0XHRcdFx0fSkuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly9nZXR0aW5nIGZvcm0gYWdhaW4sIGJ1dCBpdCB3YXNuJ3QgYSByZWRpcmVjdFxuXHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdXcm9uZyB1c2VybmFtZSBvciBwYXNzd29yZCcpO1xuXHRcdFx0XHRjYWxsYmFjaygtMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0c2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHRcdHdoaWxlIChzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuXHRcdFx0XHRjb25zdCBtZXRob2QgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5jYWxsLmJpbmQoc2VsZik7XG5cdFx0XHRcdGNvbnN0IHNhc1Byb2dyYW0gPSBwZW5kaW5nQ2FsbC5vcHRpb25zLnNhc1Byb2dyYW07XG5cdFx0XHRcdGNvbnN0IGNhbGxiYWNrUGVuZGluZyA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuY2FsbGJhY2s7XG5cdFx0XHRcdGNvbnN0IHBhcmFtcyA9IHBlbmRpbmdDYWxsLnBhcmFtcztcblx0XHRcdFx0Ly91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRwYXJhbXMuX2RlYnVnID0gc2VsZi5kZWJ1ZyA/IDEzMSA6IDA7XG5cdFx0XHRcdGlmIChzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xuXHRcdFx0XHRcdG1ldGhvZChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cbi8qKlxuICogUkVTVCBsb2dvbiBmb3IgOS40IHYxIHRpY2tldCBiYXNlZCBhdXRoXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzc1xuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2tcbiAqL1xuZnVuY3Rpb24gaGFuZGxlUmVzdExvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXG5cdGNvbnN0IGxvZ2luUGFyYW1zID0ge1xuXHRcdHVzZXJuYW1lOiB1c2VyLFxuXHRcdHBhc3N3b3JkOiBwYXNzXG5cdH07XG5cblx0dGhpcy5fYWpheC5wb3N0KHRoaXMuUkVTVGF1dGhMb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdMb2NhdGlvbicpO1xuXG5cdFx0c2VsZi5fYWpheC5wb3N0KGxvY2F0aW9uLCB7XG5cdFx0XHRzZXJ2aWNlOiBzZWxmLnVybFxuXHRcdH0pLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0aWYgKHNlbGYudXJsLmluZGV4T2YoJz8nKSA9PT0gLTEpIHtcblx0XHRcdFx0c2VsZi51cmwgKz0gJz90aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoc2VsZi51cmwuaW5kZXhPZigndGlja2V0JykgIT09IC0xKSB7XG5cdFx0XHRcdFx0c2VsZi51cmwgPSBzZWxmLnVybC5yZXBsYWNlKC90aWNrZXQ9W14mXSsvLCAndGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZWxmLnVybCArPSAnJnRpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fSk7XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRpZiAocmVzLnJlc3BvbnNlVGV4dCA9PT0gJ2Vycm9yLmF1dGhlbnRpY2F0aW9uLmNyZWRlbnRpYWxzLmJhZCcpIHtcblx0XHRcdGNhbGxiYWNrKC0xKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH1cblx0fSk7XG59XG5cbi8qKlxuKiBMb2dvdXQgbWV0aG9kXG4qXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gbG9nb3V0IGlzIGRvbmVcbipcbiovXG5cbm1vZHVsZS5leHBvcnRzLmxvZ291dCA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXHRjb25zdCBiYXNlVXJsID0gdGhpcy5ob3N0VXJsIHx8ICcnO1xuXHRjb25zdCB1cmwgPSBiYXNlVXJsICsgdGhpcy5sb2dvdXRVcmw7XG5cblx0dGhpcy5fYWpheC5nZXQodXJsKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHR0aGlzLl9kaXNhYmxlQ2FsbHMgPSB0cnVlXG5cdFx0Y2FsbGJhY2soKTtcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ291dCBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHR9KTtcbn07XG5cbi8qXG4qIEVudGVyIGRlYnVnIG1vZGVcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5zZXREZWJ1Z01vZGUgPSBmdW5jdGlvbiAoKSB7XG5cdHRoaXMuZGVidWcgPSB0cnVlO1xufTtcblxuLypcbiogRXhpdCBkZWJ1ZyBtb2RlIGFuZCBjbGVhciBsb2dzXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudW5zZXREZWJ1Z01vZGUgPSBmdW5jdGlvbiAoKSB7XG5cdHRoaXMuZGVidWcgPSBmYWxzZTtcbn07XG5cbmZvciAobGV0IGtleSBpbiBsb2dzLmdldCkge1xuXHRpZiAobG9ncy5nZXQuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuXHRcdG1vZHVsZS5leHBvcnRzW2tleV0gPSBsb2dzLmdldFtrZXldO1xuXHR9XG59XG5cbmZvciAobGV0IGtleSBpbiBsb2dzLmNsZWFyKSB7XG5cdGlmIChsb2dzLmNsZWFyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5jbGVhcltrZXldO1xuXHR9XG59XG5cbi8qXG4qIEFkZCBjYWxsYmFjayBmdW5jdGlvbnMgZXhlY3V0ZWQgd2hlbiBwcm9wZXJ0aWVzIGFyZSB1cGRhdGVkIHdpdGggcmVtb3RlIGNvbmZpZ1xuKlxuKkBjYWxsYmFjayAtIGNhbGxiYWNrIHB1c2hlZCB0byBhcnJheVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLm9uUmVtb3RlQ29uZmlnVXBkYXRlID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG5cdHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzLnB1c2goY2FsbGJhY2spO1xufTtcblxubW9kdWxlLmV4cG9ydHMuX3V0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG4vKipcbiAqIExvZ2luIGNhbGwgd2hpY2ggcmV0dXJucyBhIHByb21pc2VcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmRcbiAqL1xubW9kdWxlLmV4cG9ydHMucHJvbWlzZUxvZ2luID0gZnVuY3Rpb24gKHVzZXIsIHBhc3MpIHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRpZiAoIXVzZXIgfHwgIXBhc3MpIHtcblx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0NyZWRlbnRpYWxzIG5vdCBzZXQnKSlcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB1c2VyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFzcyAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1VzZXIgYW5kIHBhc3MgcGFyYW1ldGVycyBtdXN0IGJlIHN0cmluZ3MnKSlcblx0XHR9XG5cdFx0aWYgKCF0aGlzLlJFU1RhdXRoKSB7XG5cdFx0XHRjdXN0b21IYW5kbGVTYXNMb2dvbi5jYWxsKHRoaXMsIHVzZXIsIHBhc3MsIHJlc29sdmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdXN0b21IYW5kbGVSZXN0TG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCByZXNvbHZlKTtcblx0XHR9XG5cdH0pXG59XG5cbi8qKlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmRcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gZnVuY3Rpb24gdG8gY2FsbCB3aGVuIHN1Y2Nlc3NmdWxcbiAqL1xuZnVuY3Rpb24gY3VzdG9tSGFuZGxlU2FzTG9nb24odXNlciwgcGFzcywgY2FsbGJhY2spIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdGxldCBsb2dpblBhcmFtcyA9IHtcblx0XHRfc2VydmljZTogJ2RlZmF1bHQnLFxuXHRcdC8vZm9yIFNBUyA5LjQsXG5cdFx0dXNlcm5hbWU6IHVzZXIsXG5cdFx0cGFzc3dvcmQ6IHBhc3Ncblx0fTtcblxuXHRmb3IgKGxldCBrZXkgaW4gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMpIHtcblx0XHRsb2dpblBhcmFtc1trZXldID0gdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXNba2V5XTtcblx0fVxuXG5cdHRoaXMuX2xvZ2luQXR0ZW1wdHMgPSAwO1xuXHRsb2dpblBhcmFtcyA9IHRoaXMuX2FqYXguc2VyaWFsaXplKGxvZ2luUGFyYW1zKVxuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLmxvZ2luVXJsLCBsb2dpblBhcmFtcylcblx0XHQuc3VjY2VzcyhoYW5kbGVTYXNMb2dvblN1Y2Nlc3MpXG5cdFx0LmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXG5cdGZ1bmN0aW9uIGhhbmRsZVNhc0xvZ29uRXJyb3IocmVzKSB7XG5cdFx0aWYgKHJlcy5zdGF0dXMgPT0gNDQ5KSB7XG5cdFx0XHRoYW5kbGVTYXNMb2dvblN1Y2Nlc3MocmVzKTtcblx0XHRcdC8vIHJlc29sdmUocmVzLnN0YXR1cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvblN1Y2Nlc3MocmVzKSB7XG5cdFx0aWYgKCsrc2VsZi5fbG9naW5BdHRlbXB0cyA9PT0gMykge1xuXHRcdFx0Y2FsbGJhY2soLTIpO1xuXHRcdH1cblxuXHRcdGlmIChzZWxmLl91dGlscy5uZWVkVG9Mb2dpbi5jYWxsKHNlbGYsIHJlcykpIHtcblx0XHRcdC8vd2UgYXJlIGdldHRpbmcgZm9ybSBhZ2FpbiBhZnRlciByZWRpcmVjdFxuXHRcdFx0Ly9hbmQgbmVlZCB0byBsb2dpbiBhZ2FpbiB1c2luZyB0aGUgbmV3IHVybFxuXHRcdFx0Ly9fbG9naW5DaGFuZ2VkIGlzIHNldCBpbiBuZWVkVG9Mb2dpbiBmdW5jdGlvblxuXHRcdFx0Ly9idXQgaWYgbG9naW4gdXJsIGlzIG5vdCBkaWZmZXJlbnQsIHdlIGFyZSBjaGVja2luZyBpZiB0aGVyZSBhcmUgYWRpdGlvbmFsIHBhcmFtZXRlcnNcblx0XHRcdGlmIChzZWxmLl9sb2dpbkNoYW5nZWQgfHwgKHNlbGYuX2lzTmV3TG9naW5QYWdlICYmICFzZWxmLl9hZGl0aW9uYWxMb2dpblBhcmFtcykpIHtcblx0XHRcdFx0ZGVsZXRlIHNlbGYuX2xvZ2luQ2hhbmdlZDtcblx0XHRcdFx0Y29uc3QgaW5wdXRzID0gcmVzLnJlc3BvbnNlVGV4dC5tYXRjaCgvPGlucHV0LipcImhpZGRlblwiW14+XSo+L2cpO1xuXHRcdFx0XHRpZiAoaW5wdXRzKSB7XG5cdFx0XHRcdFx0aW5wdXRzLmZvckVhY2goZnVuY3Rpb24gKGlucHV0U3RyKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZU1hdGNoID0gaW5wdXRTdHIubWF0Y2goL25hbWU9XCIoW15cIl0qKVwiXFxzdmFsdWU9XCIoW15cIl0qKS8pO1xuXHRcdFx0XHRcdFx0bG9naW5QYXJhbXNbdmFsdWVNYXRjaFsxXV0gPSB2YWx1ZU1hdGNoWzJdO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLmxvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdFx0aGFuZGxlU2FzTG9nb25TdWNjZXNzKClcblx0XHRcdFx0fSkuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0Ly9nZXR0aW5nIGZvcm0gYWdhaW4sIGJ1dCBpdCB3YXNuJ3QgYSByZWRpcmVjdFxuXHRcdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdXcm9uZyB1c2VybmFtZSBvciBwYXNzd29yZCcpO1xuXHRcdFx0XHRjYWxsYmFjaygtMSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0c2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHRcdHdoaWxlIChzZWxmLl9jdXN0b21QZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nQ2FsbCA9IHNlbGYuX2N1c3RvbVBlbmRpbmdDYWxscy5zaGlmdCgpXG5cdFx0XHRcdGNvbnN0IG1ldGhvZCA9IHBlbmRpbmdDYWxsLm1ldGhvZCB8fCBzZWxmLm1hbmFnZWRSZXF1ZXN0LmJpbmQoc2VsZik7XG5cdFx0XHRcdGNvbnN0IGNhbGxNZXRob2QgPSBwZW5kaW5nQ2FsbC5jYWxsTWV0aG9kXG5cdFx0XHRcdGNvbnN0IF91cmwgPSBwZW5kaW5nQ2FsbC5fdXJsXG5cdFx0XHRcdGNvbnN0IG9wdGlvbnMgPSBwZW5kaW5nQ2FsbC5vcHRpb25zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdGlmIChvcHRpb25zLnBhcmFtcykge1xuXHRcdFx0XHRcdG9wdGlvbnMucGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZWxmLnJldHJ5QWZ0ZXJMb2dpbikge1xuXHRcdFx0XHRcdG1ldGhvZChjYWxsTWV0aG9kLCBfdXJsLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR3aGlsZSAoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcblx0XHRcdFx0Y29uc3QgbWV0aG9kID0gcGVuZGluZ0NhbGwubWV0aG9kIHx8IHNlbGYuY2FsbC5iaW5kKHNlbGYpO1xuXHRcdFx0XHRjb25zdCBzYXNQcm9ncmFtID0gcGVuZGluZ0NhbGwub3B0aW9ucy5zYXNQcm9ncmFtO1xuXHRcdFx0XHRjb25zdCBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cdFx0XHRcdC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0cGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXHRcdFx0XHRpZiAoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcblx0XHRcdFx0XHRtZXRob2Qoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xufVxuXG4vKipcbiAqIFRvIGJlIHVzZWQgd2l0aCBmdXR1cmUgbWFuYWdlZCBtZXRhZGF0YSBjYWxsc1xuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLSBVc2VybmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3MgLSBQYXNzd29yZFxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSB3aGF0IHRvIGNhbGwgYWZ0ZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBjYWxsYmFja1VybCAtIHdoZXJlIHRvIG5hdmlnYXRlIGFmdGVyIGdldHRpbmcgdGlja2V0XG4gKi9cbmZ1bmN0aW9uIGN1c3RvbUhhbmRsZVJlc3RMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaywgY2FsbGJhY2tVcmwpIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cblx0Y29uc3QgbG9naW5QYXJhbXMgPSB7XG5cdFx0dXNlcm5hbWU6IHVzZXIsXG5cdFx0cGFzc3dvcmQ6IHBhc3Ncblx0fTtcblxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy5SRVNUYXV0aExvZ2luVXJsLCBsb2dpblBhcmFtcykuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ0xvY2F0aW9uJyk7XG5cblx0XHRzZWxmLl9hamF4LnBvc3QobG9jYXRpb24sIHtcblx0XHRcdHNlcnZpY2U6IGNhbGxiYWNrVXJsXG5cdFx0fSkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRpZiAoY2FsbGJhY2tVcmwuaW5kZXhPZignPycpID09PSAtMSkge1xuXHRcdFx0XHRjYWxsYmFja1VybCArPSAnP3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjYWxsYmFja1VybC5pbmRleE9mKCd0aWNrZXQnKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRjYWxsYmFja1VybCA9IGNhbGxiYWNrVXJsLnJlcGxhY2UoL3RpY2tldD1bXiZdKy8sICd0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNhbGxiYWNrVXJsICs9ICcmdGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9KTtcblx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdGlmIChyZXMucmVzcG9uc2VUZXh0ID09PSAnZXJyb3IuYXV0aGVudGljYXRpb24uY3JlZGVudGlhbHMuYmFkJykge1xuXHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fVxuXHR9KTtcbn1cblxuXG4vLyBVdGlsaWxpdHkgZnVuY3Rpb25zIGZvciBoYW5kbGluZyBmaWxlcyBhbmQgZm9sZGVycyBvbiBWSVlBXG4vKipcbiAqIFJldHVybnMgdGhlIGRldGFpbHMgb2YgYSBmb2xkZXIgZnJvbSBmb2xkZXIgc2VydmljZVxuICogQHBhcmFtIHtTdHJpbmd9IGZvbGRlck5hbWUgLSBGdWxsIHBhdGggb2YgZm9sZGVyIHRvIGJlIGZvdW5kXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRGb2xkZXJEZXRhaWxzID0gZnVuY3Rpb24gKGZvbGRlck5hbWUsIG9wdGlvbnMpIHtcblx0Ly8gRmlyc3QgY2FsbCB0byBnZXQgZm9sZGVyJ3MgaWRcblx0bGV0IHVybCA9IFwiL2ZvbGRlcnMvZm9sZGVycy9AaXRlbT9wYXRoPVwiICsgZm9sZGVyTmFtZVxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgdXJsLCBvcHRpb25zKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkZXRhaWxzIG9mIGEgZmlsZSBmcm9tIGZpbGVzIHNlcnZpY2VcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlVXJpIC0gRnVsbCBwYXRoIG9mIGZpbGUgdG8gYmUgZm91bmRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0OiBjYWNoZUJ1c3QgZm9yY2VzIGJyb3dzZXIgdG8gZmV0Y2ggbmV3IGZpbGVcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0RmlsZURldGFpbHMgPSBmdW5jdGlvbiAoZmlsZVVyaSwgb3B0aW9ucykge1xuXHRjb25zdCBjYWNoZUJ1c3QgPSBvcHRpb25zLmNhY2hlQnVzdFxuXHRpZiAoY2FjaGVCdXN0KSB7XG5cdFx0ZmlsZVVyaSArPSAnP2NhY2hlQnVzdD0nICsgbmV3IERhdGUoKS5nZXRUaW1lKClcblx0fVxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgZmlsZVVyaSwgb3B0aW9ucyk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgY29udGVudHMgb2YgYSBmaWxlIGZyb20gZmlsZXMgc2VydmljZVxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVVcmkgLSBGdWxsIHBhdGggb2YgZmlsZSB0byBiZSBkb3dubG9hZGVkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdDogY2FjaGVCdXN0IGZvcmNlcyBicm93c2VyIHRvIGZldGNoIG5ldyBmaWxlXG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldEZpbGVDb250ZW50ID0gZnVuY3Rpb24gKGZpbGVVcmksIG9wdGlvbnMpIHtcblx0Y29uc3QgY2FjaGVCdXN0ID0gb3B0aW9ucy5jYWNoZUJ1c3Rcblx0bGV0IHVyaSA9IGZpbGVVcmkgKyAnL2NvbnRlbnQnXG5cdGlmIChjYWNoZUJ1c3QpIHtcblx0XHR1cmkgKz0gJz9jYWNoZUJ1c3Q9JyArIG5ldyBEYXRlKCkuZ2V0VGltZSgpXG5cdH1cblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIHVyaSwgb3B0aW9ucyk7XG59XG5cblxuLy8gVXRpbCBmdW5jdGlvbnMgZm9yIHdvcmtpbmcgd2l0aCBmaWxlcyBhbmQgZm9sZGVyc1xuLyoqXG4gKiBSZXR1cm5zIGRldGFpbHMgYWJvdXQgZm9sZGVyIGl0IHNlbGYgYW5kIGl0J3MgbWVtYmVycyB3aXRoIGRldGFpbHNcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJOYW1lIC0gRnVsbCBwYXRoIG9mIGZvbGRlciB0byBiZSBmb3VuZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0Rm9sZGVyQ29udGVudHMgPSBhc3luYyBmdW5jdGlvbiAoZm9sZGVyTmFtZSwgb3B0aW9ucykge1xuXHRjb25zdCBzZWxmID0gdGhpc1xuXHRjb25zdCB7Y2FsbGJhY2t9ID0gb3B0aW9uc1xuXG5cdC8vIFNlY29uZCBjYWxsIHRvIGdldCBmb2xkZXIncyBtZW1lYmVyc1xuXHRjb25zdCBfY2FsbGJhY2sgPSAoZXJyLCBkYXRhKSA9PiB7XG5cdFx0Ly8gaGFuZGxlIGVycm9yIG9mIHRoZSBmaXJzdCBjYWxsXG5cdFx0aWYoZXJyKSB7XG5cdFx0XHRjYWxsYmFjayhlcnIsIGRhdGEpXG5cdFx0XHRyZXR1cm5cblx0XHR9XG5cdFx0bGV0IGlkID0gZGF0YS5ib2R5LmlkXG5cdFx0bGV0IG1lbWJlcnNVcmwgPSAnL2ZvbGRlcnMvZm9sZGVycy8nICsgaWQgKyAnL21lbWJlcnMnICsgJy8/bGltaXQ9MTAwMDAwMDAnO1xuXHRcdHJldHVybiBzZWxmLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCBtZW1iZXJzVXJsLCB7Y2FsbGJhY2t9KVxuXHR9XG5cblx0Ly8gRmlyc3QgY2FsbCB0byBnZXQgZm9sZGVyJ3MgaWRcblx0bGV0IHVybCA9IFwiL2ZvbGRlcnMvZm9sZGVycy9AaXRlbT9wYXRoPVwiICsgZm9sZGVyTmFtZVxuXHRjb25zdCBvcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuXHRcdGNhbGxiYWNrOiBfY2FsbGJhY2tcblx0fSlcblx0dGhpcy5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgdXJsLCBvcHRpb25zT2JqKVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBmb2xkZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXJlbnRVcmkgLSBUaGUgdXJpIG9mIHRoZSBmb2xkZXIgd2hlcmUgdGhlIG5ldyBjaGlsZCBpcyBiZWluZyBjcmVhdGVkXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9sZGVyTmFtZSAtIEZ1bGwgcGF0aCBvZiBmb2xkZXIgdG8gYmUgZm91bmRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmNyZWF0ZU5ld0ZvbGRlciA9IGZ1bmN0aW9uIChwYXJlbnRVcmksIGZvbGRlck5hbWUsIG9wdGlvbnMpIHtcblx0Y29uc3QgaGVhZGVycyA9IHtcblx0XHQnQWNjZXB0JzogJ2FwcGxpY2F0aW9uL2pzb24sIHRleHQvamF2YXNjcmlwdCwgKi8qOyBxPTAuMDEnLFxuXHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdH1cblxuXHRjb25zdCB1cmwgPSAnL2ZvbGRlcnMvZm9sZGVycz9wYXJlbnRGb2xkZXJVcmk9JyArIHBhcmVudFVyaTtcblx0Y29uc3QgZGF0YSA9IHtcblx0XHQnbmFtZSc6IGZvbGRlck5hbWUsXG5cdFx0J3R5cGUnOiBcImZvbGRlclwiXG5cdH1cblxuXHRjb25zdCBvcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuXHRcdHBhcmFtczogSlNPTi5zdHJpbmdpZnkoZGF0YSksXG5cdFx0aGVhZGVycyxcblx0XHR1c2VNdWx0aXBhcnRGb3JtRGF0YTogZmFsc2Vcblx0fSlcblxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgncG9zdCcsIHVybCwgb3B0aW9uc09iaik7XG59XG5cbi8qKlxuICogRGVsZXRlcyBhIGZvbGRlclxuICogQHBhcmFtIHtTdHJpbmd9IGZvbGRlcklkIC0gRnVsbCBVUkkgb2YgZm9sZGVyIHRvIGJlIGRlbGV0ZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmRlbGV0ZUZvbGRlckJ5SWQgPSBmdW5jdGlvbiAoZm9sZGVySWQsIG9wdGlvbnMpIHtcblx0Y29uc3QgdXJsID0gJy9mb2xkZXJzL2ZvbGRlcnMvJyArIGZvbGRlcklkO1xuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZGVsZXRlJywgdXJsLCBvcHRpb25zKVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgZmlsZVxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVOYW1lIC0gTmFtZSBvZiB0aGUgZmlsZSBiZWluZyBjcmVhdGVkXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZUJsb2IgLSBDb250ZW50IG9mIHRoZSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFyZW50Rk9sZGVyVXJpIC0gVVJJIG9mIHRoZSBwYXJlbnQgZm9sZGVyIHdoZXJlIHRoZSBmaWxlIGlzIHRvIGJlIGNyZWF0ZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmNyZWF0ZU5ld0ZpbGUgPSBmdW5jdGlvbiAoZmlsZU5hbWUsIGZpbGVCbG9iLCBwYXJlbnRGb2xkZXJVcmksIG9wdGlvbnMpIHtcblx0bGV0IHVybCA9IFwiL2ZpbGVzL2ZpbGVzI211bHRpcGFydFVwbG9hZFwiO1xuXHRsZXQgZGF0YU9iaiA9IHtcblx0XHRmaWxlOiBbZmlsZUJsb2IsIGZpbGVOYW1lXSxcblx0XHRwYXJlbnRGb2xkZXJVcmlcblx0fVxuXG5cdGNvbnN0IG9wdGlvbnNPYmogPSBPYmplY3QuYXNzaWduKHt9LCBvcHRpb25zLCB7XG5cdFx0cGFyYW1zOiBkYXRhT2JqLFxuXHRcdHVzZU11bHRpcGFydEZvcm1EYXRhOiB0cnVlLFxuXHR9KVxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgncG9zdCcsIHVybCwgb3B0aW9uc09iaik7XG59XG5cbi8qKlxuICogR2VuZXJpYyBkZWxldGUgZnVuY3Rpb24gdGhhdCBkZWxldGVzIGJ5IFVSSVxuICogQHBhcmFtIHtTdHJpbmd9IGl0ZW1VcmkgLSBOYW1lIG9mIHRoZSBpdGVtIGJlaW5nIGRlbGV0ZWRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmRlbGV0ZUl0ZW0gPSBmdW5jdGlvbiAoaXRlbVVyaSwgb3B0aW9ucykge1xuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgnZGVsZXRlJywgaXRlbVVyaSwgb3B0aW9ucylcbn1cblxuXG4vKipcbiAqIFVwZGF0ZXMgY29udGVudHMgb2YgYSBmaWxlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZU5hbWUgLSBOYW1lIG9mIHRoZSBmaWxlIGJlaW5nIHVwZGF0ZWRcbiAqIEBwYXJhbSB7T2JqZWN0IHwgQmxvYn0gZGF0YU9iaiAtIE5ldyBjb250ZW50IG9mIHRoZSBmaWxlIChPYmplY3QgbXVzdCBjb250YWluIGZpbGUga2V5KVxuICogT2JqZWN0IGV4YW1wbGUge1xuICogICBmaWxlOiBbPGJsb2I+LCA8ZmlsZU5hbWU+XVxuICogfVxuICogQHBhcmFtIHtTdHJpbmd9IGxhc3RNb2RpZmllZCAtIHRoZSBsYXN0LW1vZGlmaWVkIGhlYWRlciBzdHJpbmcgdGhhdCBtYXRjaGVzIHRoYXQgb2YgZmlsZSBiZWluZyBvdmVyd3JpdHRlblxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMudXBkYXRlRmlsZSA9IGZ1bmN0aW9uIChpdGVtVXJpLCBkYXRhT2JqLCBsYXN0TW9kaWZpZWQsIG9wdGlvbnMpIHtcblx0Y29uc3QgdXJsID0gaXRlbVVyaSArICcvY29udGVudCdcblx0Y29uc29sZS5sb2coJ1VSTCcsIHVybClcblx0bGV0IGhlYWRlcnMgPSB7XG5cdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi92bmQuc2FzLmZpbGUnLFxuXHRcdCdJZi1Vbm1vZGlmaWVkLVNpbmNlJzogbGFzdE1vZGlmaWVkXG5cdH1cblx0Y29uc3QgaXNCbG9iID0gZGF0YU9iaiBpbnN0YW5jZW9mIEJsb2Jcblx0Y29uc3QgdXNlTXVsdGlwYXJ0Rm9ybURhdGEgPSAhaXNCbG9iIC8vIHNldCB1c2VNdWx0aXBhcnRGb3JtRGF0YSB0byB0cnVlIGlmIGRhdGFPYmogaXMgbm90IEJsb2JcblxuXHRjb25zdCBvcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuXHRcdHBhcmFtczogZGF0YU9iaixcblx0XHRoZWFkZXJzLFxuXHRcdHVzZU11bHRpcGFydEZvcm1EYXRhXG5cdH0pXG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdwdXQnLCB1cmwsIG9wdGlvbnNPYmopO1xufVxuIiwiY29uc3QgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcbmNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5cbmNvbnN0IHByb2dyYW1Ob3RGb3VuZFBhdHQgPSAvPHRpdGxlPihTdG9yZWQgUHJvY2VzcyBFcnJvcnxTQVNTdG9yZWRQcm9jZXNzKTxcXC90aXRsZT5bXFxzXFxTXSo8aDI+KFN0b3JlZCBwcm9jZXNzIG5vdCBmb3VuZDouKnwuKm5vdCBhIHZhbGlkIHN0b3JlZCBwcm9jZXNzIHBhdGguKTxcXC9oMj4vO1xuY29uc3QgYmFkSm9iRGVmaW5pdGlvbiA9IFwiPGgyPlBhcmFtZXRlciBFcnJvciA8YnIvPlVuYWJsZSB0byBnZXQgam9iIGRlZmluaXRpb24uPC9oMj5cIjtcblxuY29uc3QgcmVzcG9uc2VSZXBsYWNlID0gZnVuY3Rpb24ocmVzKSB7XG4gIHJldHVybiByZXNcbn07XG5cbi8qKlxuKiBQYXJzZSByZXNwb25zZSBmcm9tIHNlcnZlclxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qIEBwYXJhbSB7b2JqZWN0fSBwYXJhbXMgLSBwYXJhbXMgc2VudCB0byBzYXMgcHJvZ3JhbSB3aXRoIGFkZFRhYmxlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VSZXMgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcykge1xuICBjb25zdCBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xuICBpZihtYXRjaGVzKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1lvdSBoYXZlIG5vdCBiZWVuIGdyYW50ZWQgcGVybWlzc2lvbiB0byBwZXJmb3JtIHRoaXMgYWN0aW9uLCBvciB0aGUgU1RQIGlzIG1pc3NpbmcuJyk7XG4gIH1cbiAgLy9yZW1vdmUgbmV3IGxpbmVzIGluIGpzb24gcmVzcG9uc2VcbiAgLy9yZXBsYWNlIFxcXFwoZCkgd2l0aCBcXChkKSAtIFNBUyBqc29uIHBhcnNlciBpcyBlc2NhcGluZyBpdFxuICByZXR1cm4gSlNPTi5wYXJzZShyZXNwb25zZVJlcGxhY2UocmVzcG9uc2VUZXh0KSk7XG59O1xuXG4vKipcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIgaW4gZGVidWcgbW9kZVxuKlxuKiBAcGFyYW0ge29iamVjdH0gcmVzcG9uc2VUZXh0IC0gcmVzcG9uc2UgaHRtbCBmcm9tIHRoZSBzZXJ2ZXJcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW0gLSBzYXMgcHJvZ3JhbSBwYXRoXG4qIEBwYXJhbSB7b2JqZWN0fSBwYXJhbXMgLSBwYXJhbXMgc2VudCB0byBzYXMgcHJvZ3JhbSB3aXRoIGFkZFRhYmxlXG4qIEBwYXJhbSB7c3RyaW5nfSBob3N0VXJsIC0gc2FtZSBhcyBpbiBoNTRzIGNvbnN0cnVjdG9yXG4qIEBwYXJhbSB7Ym9vbH0gaXNWaXlhIC0gc2FtZSBhcyBpbiBoNTRzIGNvbnN0cnVjdG9yXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VEZWJ1Z1JlcyA9IGZ1bmN0aW9uIChyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcywgaG9zdFVybCwgaXNWaXlhKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzXG5cdGxldCBtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHByb2dyYW1Ob3RGb3VuZFBhdHQpO1xuXHRpZiAobWF0Y2hlcykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcblx0fVxuXG5cdGlmIChpc1ZpeWEpIHtcblx0XHRjb25zdCBtYXRjaGVzV3JvbmdKb2IgPSByZXNwb25zZVRleHQubWF0Y2goYmFkSm9iRGVmaW5pdGlvbik7XG5cdFx0aWYgKG1hdGNoZXNXcm9uZ0pvYikge1xuXHRcdFx0dGhyb3cgbmV3IGg1NHNFcnJvcigncHJvZ3JhbU5vdEZvdW5kJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycy4gVW5hYmxlIHRvIGdldCBqb2IgZGVmaW5pdGlvbi4nKTtcblx0XHR9XG5cdH1cblxuXHQvL2ZpbmQganNvblxuXHRsZXQgcGF0dCA9IGlzVml5YSA/IC9eKC4/PGlmcmFtZS4qc3JjPVwiKShbXlwiXSspKC4qaWZyYW1lPikvbSA6IC9eKC4/LS1oNTRzLWRhdGEtc3RhcnQtLSkoW1xcU1xcc10qPykoLS1oNTRzLWRhdGEtZW5kLS0pL207XG5cdG1hdGNoZXMgPSByZXNwb25zZVRleHQubWF0Y2gocGF0dCk7XG5cblx0Y29uc3QgcGFnZSA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKTtcblx0Y29uc3QgaHRtbEJvZHlQYXR0ID0gLzxib2R5Lio+KFtcXHNcXFNdKik8XFwvYm9keT4vO1xuXHRjb25zdCBib2R5TWF0Y2hlcyA9IHBhZ2UubWF0Y2goaHRtbEJvZHlQYXR0KTtcblx0Ly9yZW1vdmUgaHRtbCB0YWdzXG5cdGxldCBkZWJ1Z1RleHQgPSBib2R5TWF0Y2hlc1sxXS5yZXBsYWNlKC88W14+XSo+L2csICcnKTtcblx0ZGVidWdUZXh0ID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZGVidWdUZXh0KTtcblxuXHRsb2dzLmFkZERlYnVnRGF0YShib2R5TWF0Y2hlc1sxXSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpO1xuXG4gIGlmIChpc1ZpeWEgJiYgdGhpcy5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3Nhc0Vycm9yJywgJ1NhcyBwcm9ncmFtIGNvbXBsZXRlZCB3aXRoIGVycm9ycycpO1xuXHR9XG5cdGlmICghbWF0Y2hlcykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0fVxuXG5cblx0Y29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKGZ1bmN0aW9uIChyZXNvbHZlLCByZWplY3QpIHtcblx0XHRsZXQganNvbk9ialxuXHRcdGlmIChpc1ZpeWEpIHtcblx0XHRcdGNvbnN0IHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdFx0Y29uc3QgYmFzZVVybCA9IGhvc3RVcmwgfHwgXCJcIjtcblx0XHRcdHhoci5vcGVuKFwiR0VUXCIsIGJhc2VVcmwgKyBtYXRjaGVzWzJdKTtcblx0XHRcdHhoci5vbmxvYWQgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGlmICh0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDApIHtcblx0XHRcdFx0XHRyZXNvbHZlKEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dC5yZXBsYWNlKC8oXFxyXFxufFxccnxcXG4pL2csICcnKSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdmZXRjaEVycm9yJywgeGhyLnN0YXR1c1RleHQsIHRoaXMuc3RhdHVzKSlcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHhoci5vbmVycm9yID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignZmV0Y2hFcnJvcicsIHhoci5zdGF0dXNUZXh0KSlcblx0XHRcdH07XG5cdFx0XHR4aHIuc2VuZCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRqc29uT2JqID0gSlNPTi5wYXJzZShyZXNwb25zZVJlcGxhY2UobWF0Y2hlc1syXSkpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsICdVbmFibGUgdG8gcGFyc2UgcmVzcG9uc2UganNvbicpKVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoanNvbk9iaiAmJiBqc29uT2JqLmg1NHNBYm9ydCkge1xuXHRcdFx0XHRyZXNvbHZlKGpzb25PYmopO1xuXHRcdFx0fSBlbHNlIGlmIChzZWxmLnBhcnNlRXJyb3JSZXNwb25zZShyZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pKSB7XG5cdFx0XHRcdHJlamVjdChuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKSlcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc29sdmUoanNvbk9iaik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8qKlxuKiBBZGQgZmFpbGVkIHJlc3BvbnNlIHRvIGxvZ3MgLSB1c2VkIG9ubHkgaWYgZGVidWc9ZmFsc2VcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlc3BvbnNlID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSB7XG4gIGNvbnN0IHBhdHQgICAgICA9IC88c2NyaXB0KFtcXHNcXFNdKilcXC9mb3JtPi87XG4gIGNvbnN0IHBhdHQyICAgICA9IC9kaXNwbGF5XFxzPzpcXHM/bm9uZTs/XFxzPy87XG4gIC8vcmVtb3ZlIHNjcmlwdCB3aXRoIGZvcm0gZm9yIHRvZ2dsaW5nIHRoZSBsb2dzIGFuZCBcImRpc3BsYXk6bm9uZVwiIGZyb20gc3R5bGVcbiAgcmVzcG9uc2VUZXh0ICA9IHJlc3BvbnNlVGV4dC5yZXBsYWNlKHBhdHQsICcnKS5yZXBsYWNlKHBhdHQyLCAnJyk7XG4gIGxldCBkZWJ1Z1RleHQgPSByZXNwb25zZVRleHQucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG4gIGRlYnVnVGV4dCA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cbiAgbG9ncy5hZGRGYWlsZWRSZXF1ZXN0KHJlc3BvbnNlVGV4dCwgZGVidWdUZXh0LCBzYXNQcm9ncmFtKTtcbn07XG5cbi8qKlxuKiBVbmVzY2FwZSBhbGwgc3RyaW5nIHZhbHVlcyBpbiByZXR1cm5lZCBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IG9ialxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuZXNjYXBlVmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIGZvciAobGV0IGtleSBpbiBvYmopIHtcbiAgICBpZiAodHlwZW9mIG9ialtrZXldID09PSAnc3RyaW5nJykge1xuICAgICAgb2JqW2tleV0gPSBkZWNvZGVVUklDb21wb25lbnQob2JqW2tleV0pO1xuICAgIH0gZWxzZSBpZih0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgICAgdGhpcy51bmVzY2FwZVZhbHVlcyhvYmpba2V5XSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvYmo7XG59O1xuXG4vKipcbiogUGFyc2UgZXJyb3IgcmVzcG9uc2UgZnJvbSBzZXJ2ZXIgYW5kIHNhdmUgZXJyb3JzIGluIG1lbW9yeVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gcmVzIC0gc2VydmVyIHJlc3BvbnNlXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gd2hpY2ggcmV0dXJuZWQgdGhlIHJlc3BvbnNlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMucGFyc2VFcnJvclJlc3BvbnNlID0gZnVuY3Rpb24ocmVzLCBzYXNQcm9ncmFtKSB7XG4gIC8vY2FwdHVyZSAnRVJST1I6IFt0ZXh0XS4nIG9yICdFUlJPUiB4eCBbdGV4dF0uJ1xuICBjb25zdCBwYXR0ICAgID0gL15FUlJPUig6XFxzfFxcc1xcZFxcZCkoLipcXC58LipcXG4uKlxcLikvZ207XG4gIGxldCBlcnJvcnMgID0gcmVzLnJlcGxhY2UoLyg8KFtePl0rKT4pL2lnLCAnJykubWF0Y2gocGF0dCk7XG4gIGlmKCFlcnJvcnMpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBsZXQgZXJyTWVzc2FnZTtcbiAgZm9yKGxldCBpID0gMCwgbiA9IGVycm9ycy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBlcnJNZXNzYWdlICA9IGVycm9yc1tpXS5yZXBsYWNlKC88W14+XSo+L2csICcnKS5yZXBsYWNlKC8oXFxufFxcc3syLH0pL2csICcgJyk7XG4gICAgZXJyTWVzc2FnZSAgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhlcnJNZXNzYWdlKTtcbiAgICBlcnJvcnNbaV0gICA9IHtcbiAgICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgICBtZXNzYWdlOiAgICBlcnJNZXNzYWdlLFxuICAgICAgdGltZTogICAgICAgbmV3IERhdGUoKVxuICAgIH07XG4gIH1cblxuICBsb2dzLmFkZFNhc0Vycm9ycyhlcnJvcnMpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuLyoqXG4qIERlY29kZSBIVE1MIGVudGl0aWVzIC0gb2xkIHV0aWxpdHkgZnVuY3Rpb25cbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmRlY29kZUhUTUxFbnRpdGllcyA9IGZ1bmN0aW9uIChodG1sKSB7XG4gIGNvbnN0IHRlbXBFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICBsZXQgc3RyXHQ9IGh0bWwucmVwbGFjZSgvJigjKD86eFswLTlhLWZdK3xcXGQrKXxbYS16XSspOy9naSxcbiAgICBmdW5jdGlvbiAoc3RyKSB7XG4gICAgICB0ZW1wRWxlbWVudC5pbm5lckhUTUwgPSBzdHI7XG4gICAgICBzdHIgPSB0ZW1wRWxlbWVudC50ZXh0Q29udGVudCB8fCB0ZW1wRWxlbWVudC5pbm5lclRleHQ7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgKTtcbiAgcmV0dXJuIHN0cjtcbn07XG5cbi8qKlxuKiBDb252ZXJ0IHNhcyB0aW1lIHRvIGphdmFzY3JpcHQgZGF0ZVxuKlxuKiBAcGFyYW0ge251bWJlcn0gc2FzRGF0ZSAtIHNhcyBUYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmZyb21TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChzYXNEYXRlKSB7XG4gIGNvbnN0IGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIGNvbnN0IGN1cnJkYXRlID0gc2FzRGF0ZTtcblxuICAvLyBvZmZzZXRzIGZvciBVVEMgYW5kIHRpbWV6b25lcyBhbmQgQlNUXG4gIGNvbnN0IGJhc2VPZmZzZXQgPSBiYXNlZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBpbiBtaW51dGVzXG5cbiAgLy8gY29udmVydCBzYXMgZGF0ZXRpbWUgdG8gYSBjdXJyZW50IHZhbGlkIGphdmFzY3JpcHQgZGF0ZVxuICBjb25zdCBiYXNlZGF0ZU1zICA9IGJhc2VkYXRlLmdldFRpbWUoKTsgLy8gaW4gbXNcbiAgY29uc3QgY3VycmRhdGVNcyAgPSBjdXJyZGF0ZSAqIDEwMDA7IC8vIHRvIG1zXG4gIGNvbnN0IHNhc0RhdGV0aW1lID0gY3VycmRhdGVNcyArIGJhc2VkYXRlTXM7XG4gIGNvbnN0IGpzRGF0ZSAgICAgID0gbmV3IERhdGUoKTtcbiAganNEYXRlLnNldFRpbWUoc2FzRGF0ZXRpbWUpOyAvLyBmaXJzdCB0aW1lIHRvIGdldCBvZmZzZXQgQlNUIGRheWxpZ2h0IHNhdmluZ3MgZXRjXG4gIGNvbnN0IGN1cnJPZmZzZXQgID0ganNEYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGFkanVzdCBmb3Igb2Zmc2V0IGluIG1pbnV0ZXNcbiAgY29uc3Qgb2Zmc2V0VmFyICAgPSAoYmFzZU9mZnNldCAtIGN1cnJPZmZzZXQpICogNjAgKiAxMDAwOyAvLyBkaWZmZXJlbmNlIGluIG1pbGxpc2Vjb25kc1xuICBjb25zdCBvZmZzZXRUaW1lICA9IHNhc0RhdGV0aW1lIC0gb2Zmc2V0VmFyOyAvLyBmaW5kaW5nIEJTVCBhbmQgZGF5bGlnaHQgc2F2aW5nc1xuICBqc0RhdGUuc2V0VGltZShvZmZzZXRUaW1lKTsgLy8gdXBkYXRlIHdpdGggb2Zmc2V0XG4gIHJldHVybiBqc0RhdGU7XG59O1xuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIHJlc3BvbnNlIG9iamVjdCBpcyBhIGxvZ2luIHJlZGlyZWN0XG4gKiBAcGFyYW0ge09iamVjdH0gcmVzcG9uc2VPYmogeGhyIHJlc3BvbnNlIHRvIGJlIGNoZWNrZWQgZm9yIGxvZ29uIHJlZGlyZWN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLm5lZWRUb0xvZ2luID0gZnVuY3Rpb24ocmVzcG9uc2VPYmopIHtcblx0Y29uc3QgaXNTQVNMb2dvbiA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMICYmIHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLmluY2x1ZGVzKCdTQVNMb2dvbicpXG5cdGlmIChpc1NBU0xvZ29uID09PSBmYWxzZSkge1xuXHRcdHJldHVybiBmYWxzZVxuXHR9XG5cbiAgY29uc3QgcGF0dCA9IC88Zm9ybS4rYWN0aW9uPVwiKC4qTG9nb25bXlwiXSopLio+LztcbiAgY29uc3QgbWF0Y2hlcyA9IHBhdHQuZXhlYyhyZXNwb25zZU9iai5yZXNwb25zZVRleHQpO1xuICBsZXQgbmV3TG9naW5Vcmw7XG5cbiAgaWYoIW1hdGNoZXMpIHtcbiAgICAvL3RoZXJlJ3Mgbm8gZm9ybSwgd2UgYXJlIGluLiBob29yYXkhXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGFjdGlvblVybCA9IG1hdGNoZXNbMV0ucmVwbGFjZSgvXFw/LiovLCAnJyk7XG4gICAgaWYoYWN0aW9uVXJsLmNoYXJBdCgwKSA9PT0gJy8nKSB7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIGFjdGlvblVybCA6IGFjdGlvblVybDtcbiAgICAgIGlmKG5ld0xvZ2luVXJsICE9PSB0aGlzLmxvZ2luVXJsKSB7XG4gICAgICAgIHRoaXMuX2xvZ2luQ2hhbmdlZCA9IHRydWU7XG4gICAgICAgIHRoaXMubG9naW5VcmwgPSBuZXdMb2dpblVybDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy9yZWxhdGl2ZSBwYXRoXG5cbiAgICAgIGNvbnN0IGxhc3RJbmRPZlNsYXNoID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwubGFzdEluZGV4T2YoJy8nKSArIDE7XG4gICAgICAvL3JlbW92ZSBldmVyeXRoaW5nIGFmdGVyIHRoZSBsYXN0IHNsYXNoLCBhbmQgZXZlcnl0aGluZyB1bnRpbCB0aGUgZmlyc3RcbiAgICAgIGNvbnN0IHJlbGF0aXZlTG9naW5VcmwgPSByZXNwb25zZU9iai5yZXNwb25zZVVSTC5zdWJzdHIoMCwgbGFzdEluZE9mU2xhc2gpLnJlcGxhY2UoLy4qXFwvezJ9W15cXC9dKi8sICcnKSArIGFjdGlvblVybDtcbiAgICAgIG5ld0xvZ2luVXJsID0gdGhpcy5ob3N0VXJsID8gdGhpcy5ob3N0VXJsICsgcmVsYXRpdmVMb2dpblVybCA6IHJlbGF0aXZlTG9naW5Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9zYXZlIHBhcmFtZXRlcnMgZnJvbSBoaWRkZW4gZm9ybSBmaWVsZHNcbiAgICBjb25zdCBwYXJzZXIgPSBuZXcgRE9NUGFyc2VyKCk7XG4gICAgY29uc3QgZG9jID0gcGFyc2VyLnBhcnNlRnJvbVN0cmluZyhyZXNwb25zZU9iai5yZXNwb25zZVRleHQsXCJ0ZXh0L2h0bWxcIik7XG4gICAgY29uc3QgcmVzID0gZG9jLnF1ZXJ5U2VsZWN0b3JBbGwoXCJpbnB1dFt0eXBlPSdoaWRkZW4nXVwiKTtcbiAgICBjb25zdCBoaWRkZW5Gb3JtUGFyYW1zID0ge307XG4gICAgaWYocmVzKSB7XG4gICAgICAvL2l0J3MgbmV3IGxvZ2luIHBhZ2UgaWYgd2UgaGF2ZSB0aGVzZSBhZGRpdGlvbmFsIHBhcmFtZXRlcnNcbiAgICAgIHRoaXMuX2lzTmV3TG9naW5QYWdlID0gdHJ1ZTtcbiAgICAgIHJlcy5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgaGlkZGVuRm9ybVBhcmFtc1tub2RlLm5hbWVdID0gbm9kZS52YWx1ZTtcbiAgICAgIH0pO1xuICAgICAgdGhpcy5fYWRpdGlvbmFsTG9naW5QYXJhbXMgPSBoaWRkZW5Gb3JtUGFyYW1zO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxufTtcblxuLyoqXG4qIEdldCBmdWxsIHByb2dyYW0gcGF0aCBmcm9tIG1ldGFkYXRhIHJvb3QgYW5kIHJlbGF0aXZlIHBhdGhcbipcbiogQHBhcmFtIHtzdHJpbmd9IG1ldGFkYXRhUm9vdCAtIE1ldGFkYXRhIHJvb3QgKHBhdGggd2hlcmUgYWxsIHByb2dyYW1zIGZvciB0aGUgcHJvamVjdCBhcmUgbG9jYXRlZClcbiogQHBhcmFtIHtzdHJpbmd9IHNhc1Byb2dyYW1QYXRoIC0gU2FzIHByb2dyYW0gcGF0aFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmdldEZ1bGxQcm9ncmFtUGF0aCA9IGZ1bmN0aW9uKG1ldGFkYXRhUm9vdCwgc2FzUHJvZ3JhbVBhdGgpIHtcbiAgcmV0dXJuIG1ldGFkYXRhUm9vdCA/IG1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBzYXNQcm9ncmFtUGF0aC5yZXBsYWNlKC9eXFwvLywgJycpIDogc2FzUHJvZ3JhbVBhdGg7XG59O1xuXG4vLyBSZXR1cm5zIG9iamVjdCB3aGVyZSB0YWJsZSByb3dzIGFyZSBncm91cHBlZCBieSBrZXlcbm1vZHVsZS5leHBvcnRzLmdldE9iak9mVGFibGUgPSBmdW5jdGlvbiAodGFibGUsIGtleSwgdmFsdWUgPSBudWxsKSB7XG5cdGNvbnN0IG9iaiA9IHt9XG5cdHRhYmxlLmZvckVhY2gocm93ID0+IHtcblx0XHRvYmpbcm93W2tleV1dID0gdmFsdWUgPyByb3dbdmFsdWVdIDogcm93XG5cdH0pXG5cdHJldHVybiBvYmpcbn1cblxuLy8gUmV0dXJucyBzZWxmIHVyaSBvdXQgb2YgbGlua3MgYXJyYXlcbm1vZHVsZS5leHBvcnRzLmdldFNlbGZVcmkgPSBmdW5jdGlvbiAobGlua3MpIHtcblx0cmV0dXJuIGxpbmtzXG5cdFx0LmZpbHRlcihlID0+IGUucmVsID09PSAnc2VsZicpXG5cdFx0Lm1hcChlID0+IGUudXJpKVxuXHRcdC5zaGlmdCgpO1xufVxuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci5qcycpO1xuY29uc3QgbG9ncyAgICAgID0gcmVxdWlyZSgnLi9sb2dzLmpzJyk7XG5jb25zdCBUYWJsZXMgICAgPSByZXF1aXJlKCcuL3RhYmxlcycpO1xuY29uc3QgRmlsZXMgICAgID0gcmVxdWlyZSgnLi9maWxlcycpO1xuY29uc3QgdG9TYXNEYXRlVGltZSA9IHJlcXVpcmUoJy4vdGFibGVzL3V0aWxzLmpzJykudG9TYXNEYXRlVGltZTtcblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBhIGdpdmVuIHRhYmxlIG5hbWUgaXMgYSB2YWxpZCBTQVMgbWFjcm8gbmFtZVxuICogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSBUaGUgU0FTIG1hY3JvIG5hbWUgdG8gYmUgZ2l2ZW4gdG8gdGhpcyB0YWJsZVxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZU1hY3JvKG1hY3JvTmFtZSkge1xuICBpZihtYWNyb05hbWUubGVuZ3RoID4gMzIpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIG5hbWUgdG9vIGxvbmcuIE1heGltdW0gaXMgMzIgY2hhcmFjdGVycycpO1xuICB9XG5cbiAgY29uc3QgY2hhckNvZGVBdDAgPSBtYWNyb05hbWUuY2hhckNvZGVBdCgwKTtcbiAgLy8gdmFsaWRhdGUgaXQgc3RhcnRzIHdpdGggQS1aLCBhLXosIG9yIF9cbiAgaWYoKGNoYXJDb2RlQXQwIDwgNjUgfHwgY2hhckNvZGVBdDAgPiA5MCkgJiYgKGNoYXJDb2RlQXQwIDwgOTcgfHwgY2hhckNvZGVBdDAgPiAxMjIpICYmIG1hY3JvTmFtZVswXSAhPT0gJ18nKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBuYW1lIHN0YXJ0aW5nIHdpdGggbnVtYmVyIG9yIHNwZWNpYWwgY2hhcmFjdGVycycpO1xuICB9XG5cbiAgZm9yKGxldCBpID0gMDsgaSA8IG1hY3JvTmFtZS5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGNoYXJDb2RlID0gbWFjcm9OYW1lLmNoYXJDb2RlQXQoaSk7XG5cbiAgICBpZigoY2hhckNvZGUgPCA0OCB8fCBjaGFyQ29kZSA+IDU3KSAmJlxuICAgICAgKGNoYXJDb2RlIDwgNjUgfHwgY2hhckNvZGUgPiA5MCkgJiZcbiAgICAgIChjaGFyQ29kZSA8IDk3IHx8IGNoYXJDb2RlID4gMTIyKSAmJlxuICAgICAgbWFjcm9OYW1lW2ldICE9PSAnXycpXG4gICAge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBuYW1lIGhhcyB1bnN1cHBvcnRlZCBjaGFyYWN0ZXJzJyk7XG4gICAgfVxuICB9XG59XG5cbi8qKlxuKiBoNTRzIFNBUyBkYXRhIG9iamVjdCBjb25zdHJ1Y3RvclxuKiBAY29uc3RydWN0b3JcbipcbiogQHBhcmFtIHthcnJheXxmaWxlfSBkYXRhIC0gVGFibGUgb3IgZmlsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qIEBwYXJhbSB7U3RyaW5nfSBtYWNyb05hbWUgVGhlIFNBUyBtYWNybyBuYW1lIHRvIGJlIGdpdmVuIHRvIHRoaXMgdGFibGVcbiogQHBhcmFtIHtudW1iZXJ9IHBhcmFtZXRlclRocmVzaG9sZCAtIHNpemUgb2YgZGF0YSBvYmplY3RzIHNlbnQgdG8gU0FTIChsZWdhY3kpXG4qXG4qL1xuZnVuY3Rpb24gU2FzRGF0YShkYXRhLCBtYWNyb05hbWUsIHNwZWNzKSB7XG4gIGlmKGRhdGEgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHRoaXMuX2ZpbGVzID0ge307XG4gICAgdGhpcy5hZGRUYWJsZShkYXRhLCBtYWNyb05hbWUsIHNwZWNzKTtcbiAgfSBlbHNlIGlmKGRhdGEgaW5zdGFuY2VvZiBGaWxlIHx8IGRhdGEgaW5zdGFuY2VvZiBCbG9iKSB7XG4gICAgRmlsZXMuY2FsbCh0aGlzLCBkYXRhLCBtYWNyb05hbWUpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRGF0YSBhcmd1bWVudCB3cm9uZyB0eXBlIG9yIG1pc3NpbmcnKTtcbiAgfVxufVxuXG4vKipcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7U3RyaW5nfSBtYWNyb05hbWUgVGhlIFNBUyBtYWNybyBuYW1lIHRvIGJlIGdpdmVuIHRvIHRoaXMgdGFibGVcbipcbiovXG5TYXNEYXRhLnByb3RvdHlwZS5hZGRUYWJsZSA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUsIHNwZWNzKSB7XG4gIGNvbnN0IGlzU3BlY3NQcm92aWRlZCA9ICEhc3BlY3M7XG4gIGlmKHRhYmxlICYmIG1hY3JvTmFtZSkge1xuICAgIGlmKCEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBhcnJheScpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG5cbiAgICB2YWxpZGF0ZU1hY3JvKG1hY3JvTmFtZSk7XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgaWYgKHR5cGVvZiB0YWJsZSAhPT0gJ29iamVjdCcgfHwgISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgYXJndW1lbnQgaXMgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICBsZXQga2V5O1xuICBpZihzcGVjcykge1xuICAgIGlmKHNwZWNzLmNvbnN0cnVjdG9yICE9PSBPYmplY3QpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU3BlY3MgZGF0YSB0eXBlIHdyb25nLiBPYmplY3QgZXhwZWN0ZWQuJyk7XG4gICAgfVxuICAgIGZvcihrZXkgaW4gdGFibGVbMF0pIHtcbiAgICAgIGlmKCFzcGVjc1trZXldKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBjb2x1bW5zIGluIHNwZWNzIGRhdGEuJyk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvcihrZXkgaW4gc3BlY3MpIHtcbiAgICAgIGlmKHNwZWNzW2tleV0uY29uc3RydWN0b3IgIT09IE9iamVjdCkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1dyb25nIGNvbHVtbiBkZXNjcmlwdG9yIGluIHNwZWNzIGRhdGEuJyk7XG4gICAgICB9XG4gICAgICBpZighc3BlY3Nba2V5XS5jb2xUeXBlIHx8ICFzcGVjc1trZXldLmNvbExlbmd0aCkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgY29sdW1ucyBpbiBzcGVjcyBkZXNjcmlwdG9yLicpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGxldCBpLCBqLCAvL2NvdW50ZXJzIHVzZWQgbGF0dGVyIGluIGNvZGVcbiAgICAgIHJvdywgdmFsLCB0eXBlLFxuICAgICAgc3BlY0tleXMgPSBbXTtcblx0Y29uc3Qgc3BlY2lhbENoYXJzID0gWydcIicsICdcXFxcJywgJy8nLCAnXFxuJywgJ1xcdCcsICdcXGYnLCAnXFxyJywgJ1xcYiddO1xuXG4gIGlmKCFzcGVjcykge1xuICAgIHNwZWNzID0ge307XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpKyspIHtcbiAgICAgIHJvdyA9IHRhYmxlW2ldO1xuXG4gICAgICBpZih0eXBlb2Ygcm93ICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIGl0ZW0gaXMgbm90IGFuIG9iamVjdCcpO1xuICAgICAgfVxuXG4gICAgICBmb3Ioa2V5IGluIHJvdykge1xuICAgICAgICBpZihyb3cuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIHZhbCAgPSByb3dba2V5XTtcbiAgICAgICAgICB0eXBlID0gdHlwZW9mIHZhbDtcblxuICAgICAgICAgIGlmKHNwZWNzW2tleV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgc3BlY0tleXMucHVzaChrZXkpO1xuICAgICAgICAgICAgc3BlY3Nba2V5XSA9IHt9O1xuXG4gICAgICAgICAgICBpZiAodHlwZSA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgICAgaWYodmFsIDwgTnVtYmVyLk1JTl9TQUZFX0lOVEVHRVIgfHwgdmFsID4gTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpIHtcbiAgICAgICAgICAgICAgICBsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdPYmplY3RbJyArIGkgKyAnXS4nICsga2V5ICsgJyAtIFRoaXMgdmFsdWUgZXhjZWVkcyBleHBlY3RlZCBudW1lcmljIHByZWNpc2lvbi4nKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdudW0nO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IDg7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnICYmICEodmFsIGluc3RhbmNlb2YgRGF0ZSkpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIHN0cmluZ1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICAgPSAnc3RyaW5nJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggID0gdmFsLmxlbmd0aDtcbiAgICAgICAgICAgIH0gZWxzZSBpZih2YWwgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ2RhdGUnO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IDg7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sVHlwZSAgID0gJ2pzb24nO1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IEpTT04uc3RyaW5naWZ5KHZhbCkubGVuZ3RoO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBzcGVjS2V5cyA9IE9iamVjdC5rZXlzKHNwZWNzKTtcbiAgfVxuXG4gIGxldCBzYXNDc3YgPSAnJztcblxuICAvLyB3ZSBuZWVkIHR3byBsb29wcyAtIHRoZSBmaXJzdCBvbmUgaXMgY3JlYXRpbmcgc3BlY3MgYW5kIHZhbGlkYXRpbmdcbiAgZm9yIChpID0gMDsgaSA8IHRhYmxlLmxlbmd0aDsgaSsrKSB7XG4gICAgcm93ID0gdGFibGVbaV07XG4gICAgZm9yKGogPSAwOyBqIDwgc3BlY0tleXMubGVuZ3RoOyBqKyspIHtcbiAgICAgIGtleSA9IHNwZWNLZXlzW2pdO1xuICAgICAgaWYocm93Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgdmFsICA9IHJvd1trZXldO1xuICAgICAgICB0eXBlID0gdHlwZW9mIHZhbDtcblxuICAgICAgICBpZih0eXBlID09PSAnbnVtYmVyJyAmJiBpc05hTih2YWwpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih2YWwgPT09IC1JbmZpbml0eSB8fCB2YWwgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgdmFsLnRvU3RyaW5nKCkgKyAnIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHZhbCA9PT0gdHJ1ZSB8fCB2YWwgPT09IGZhbHNlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Jvb2xlYW4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodHlwZSA9PT0gJ3N0cmluZycgJiYgdmFsLmluZGV4T2YoJ1xcclxcbicpICE9PSAtMSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOZXcgbGluZSBjaGFyYWN0ZXIgaXMgbm90IHN1cHBvcnRlZCcpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gY29udmVydCBudWxsIHRvICcuJyBmb3IgbnVtYmVycyBhbmQgdG8gJycgZm9yIHN0cmluZ3NcbiAgICAgICAgaWYodmFsID09PSBudWxsKSB7XG4gICAgICAgICAgaWYoc3BlY3Nba2V5XS5jb2xUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgdmFsID0gJyc7XG4gICAgICAgICAgICB0eXBlID0gJ3N0cmluZyc7XG4gICAgICAgICAgfSBlbHNlIGlmKHNwZWNzW2tleV0uY29sVHlwZSA9PT0gJ251bScpIHtcbiAgICAgICAgICAgIHZhbCA9ICcuJztcbiAgICAgICAgICAgIHR5cGUgPSAnbnVtYmVyJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Nhbm5vdCBjb252ZXJ0IG51bGwgdmFsdWUnKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuXG4gICAgICAgIGlmICgodHlwZSA9PT0gJ251bWJlcicgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnbnVtJyAmJiB2YWwgIT09ICcuJykgfHxcbiAgICAgICAgICAoKHR5cGUgPT09ICdzdHJpbmcnICYmICEodmFsIGluc3RhbmNlb2YgRGF0ZSkgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnc3RyaW5nJykgJiZcbiAgICAgICAgICAodHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xUeXBlID09ICdudW0nICYmIHZhbCAhPT0gJy4nKSkgfHxcbiAgICAgICAgICAodmFsIGluc3RhbmNlb2YgRGF0ZSAmJiBzcGVjc1trZXldLmNvbFR5cGUgIT09ICdkYXRlJykgfHxcbiAgICAgICAgICAoKHR5cGUgPT09ICdvYmplY3QnICYmIHZhbC5jb25zdHJ1Y3RvciAhPT0gRGF0ZSkgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnanNvbicpKVxuICAgICAgICB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyArXG4gICAgICAgICAgICAnIHR5cGUvY29sVHlwZS92YWwgPSAnICsgdHlwZSArJy8nICsgc3BlY3Nba2V5XS5jb2xUeXBlICsgJy8nICsgdmFsICk7XG4gICAgICAgIH0gZWxzZSBpZighaXNTcGVjc1Byb3ZpZGVkICYmIHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sTGVuZ3RoIDwgdmFsLmxlbmd0aCkge1xuICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gdmFsLmxlbmd0aDtcbiAgICAgICAgfSBlbHNlIGlmKCh0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCA8IHZhbC5sZW5ndGgpIHx8ICh0eXBlICE9PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCAhPT0gOCkpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnVGhlcmUgaXMgYSBzcGVjcyBsZW5ndGggbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicgK1xuICAgICAgICAgICAgJyB0eXBlL2NvbFR5cGUvdmFsID0gJyArIHR5cGUgKycvJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcvJyArIHZhbCApO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHZhbCBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgICB2YWwgPSB0b1Nhc0RhdGVUaW1lKHZhbCk7XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2goc3BlY3Nba2V5XS5jb2xUeXBlKSB7XG4gICAgICAgICAgY2FzZSAnbnVtJzpcbiAgICAgICAgICBjYXNlICdkYXRlJzpcbiAgICAgICAgICAgIHNhc0NzdiArPSB2YWw7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyB2YWwucmVwbGFjZSgvXCIvZywgJ1wiXCInKSArICdcIic7XG4gICAgICAgICAgICBsZXQgY29sTGVuZ3RoID0gdmFsLmxlbmd0aDtcbiAgICAgICAgICAgIGZvcihsZXQgayA9IDA7IGsgPCB2YWwubGVuZ3RoOyBrKyspIHtcbiAgICAgICAgICAgICAgaWYoc3BlY2lhbENoYXJzLmluZGV4T2YodmFsW2tdKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBjb2xMZW5ndGgrKztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsZXQgY29kZSA9IHZhbC5jaGFyQ29kZUF0KGspO1xuICAgICAgICAgICAgICAgIGlmKGNvZGUgPiAweGZmZmYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAzO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3ZmYpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAyO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZihjb2RlID4gMHg3Zikge1xuICAgICAgICAgICAgICAgICAgY29sTGVuZ3RoICs9IDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB1c2UgbWF4aW11bSB2YWx1ZSBiZXR3ZWVuIG1heCBwcmV2aW91cywgY3VycmVudCB2YWx1ZSBhbmQgMSAoZmlyc3QgdHdvIGNhbiBiZSAwIHdpY2ggaXMgbm90IHN1cHBvcnRlZClcbiAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoID0gTWF0aC5tYXgoc3BlY3Nba2V5XS5jb2xMZW5ndGgsIGNvbExlbmd0aCwgMSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICBjYXNlICdvYmplY3QnOlxuICAgICAgICAgICAgc2FzQ3N2ICs9ICdcIicgKyBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIGRvIG5vdCBpbnNlcnQgaWYgaXQncyB0aGUgbGFzdCBjb2x1bW5cbiAgICAgIGlmKGogPCBzcGVjS2V5cy5sZW5ndGggLSAxKSB7XG4gICAgICAgIHNhc0NzdiArPSAnLCc7XG4gICAgICB9XG4gICAgfVxuICAgIGlmKGkgPCB0YWJsZS5sZW5ndGggLSAxKSB7XG4gICAgICBzYXNDc3YgKz0gJ1xcclxcbic7XG4gICAgfVxuICB9XG5cbiAgLy9jb252ZXJ0IHNwZWNzIHRvIGNzdiB3aXRoIHBpcGVzXG4gIGNvbnN0IHNwZWNTdHJpbmcgPSBzcGVjS2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIGtleSArICcsJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcsJyArIHNwZWNzW2tleV0uY29sTGVuZ3RoO1xuICB9KS5qb2luKCd8Jyk7XG5cbiAgdGhpcy5fZmlsZXNbbWFjcm9OYW1lXSA9IFtcbiAgICBzcGVjU3RyaW5nLFxuICAgIG5ldyBCbG9iKFtzYXNDc3ZdLCB7dHlwZTogJ3RleHQvY3N2O2NoYXJzZXQ9VVRGLTgnfSlcbiAgXTtcbn07XG5cbi8qKlxuICogQWRkIGZpbGUgYXMgYSB2ZXJiYXRpbSBibG9iIGZpbGUgdXBsYW9kXG4gKiBAcGFyYW0ge0Jsb2J9IGZpbGUgLSB0aGUgYmxvYiB0aGF0IHdpbGwgYmUgdXBsb2FkZWQgYXMgZmlsZVxuICogQHBhcmFtIHtTdHJpbmd9IG1hY3JvTmFtZSAtIHRoZSBTQVMgd2ViaW4gbmFtZSBnaXZlbiB0byB0aGlzIGZpbGVcbiAqL1xuU2FzRGF0YS5wcm90b3R5cGUuYWRkRmlsZSAgPSBmdW5jdGlvbihmaWxlLCBtYWNyb05hbWUpIHtcbiAgRmlsZXMucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIGZpbGUsIG1hY3JvTmFtZSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFNhc0RhdGE7XG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKlxuKiBoNTRzIHRhYmxlcyBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHthcnJheX0gdGFibGUgLSBUYWJsZSBhZGRlZCB3aGVuIG9iamVjdCBpcyBjcmVhdGVkXG4qQHBhcmFtIHtzdHJpbmd9IG1hY3JvTmFtZSAtIG1hY3JvIG5hbWVcbipAcGFyYW0ge251bWJlcn0gcGFyYW1ldGVyVGhyZXNob2xkIC0gc2l6ZSBvZiBkYXRhIG9iamVjdHMgc2VudCB0byBTQVNcbipcbiovXG5mdW5jdGlvbiBUYWJsZXModGFibGUsIG1hY3JvTmFtZSwgcGFyYW1ldGVyVGhyZXNob2xkKSB7XG4gIHRoaXMuX3RhYmxlcyA9IHt9O1xuICB0aGlzLl9wYXJhbWV0ZXJUaHJlc2hvbGQgPSBwYXJhbWV0ZXJUaHJlc2hvbGQgfHwgMzAwMDA7XG5cbiAgVGFibGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCB0YWJsZSwgbWFjcm9OYW1lKTtcbn1cblxuLypcbiogQWRkIHRhYmxlIHRvIHRhYmxlcyBvYmplY3RcbiogQHBhcmFtIHthcnJheX0gdGFibGUgLSBBcnJheSBvZiB0YWJsZSBvYmplY3RzXG4qIEBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBTYXMgbWFjcm8gbmFtZVxuKlxuKi9cblRhYmxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24odGFibGUsIG1hY3JvTmFtZSkge1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuICAgIGlmKCFpc05hTihtYWNyb05hbWVbbWFjcm9OYW1lLmxlbmd0aCAtIDFdKSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNYWNybyBuYW1lIGNhbm5vdCBoYXZlIG51bWJlciBhdCB0aGUgZW5kJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdCA9IHRoaXMuX3V0aWxzLmNvbnZlcnRUYWJsZU9iamVjdCh0YWJsZSwgdGhpcy5fcGFyYW1ldGVyVGhyZXNob2xkKTtcblxuICBjb25zdCB0YWJsZUFycmF5ID0gW107XG4gIHRhYmxlQXJyYXkucHVzaChKU09OLnN0cmluZ2lmeShyZXN1bHQuc3BlYykpO1xuICBmb3IgKGxldCBudW1iZXJPZlRhYmxlcyA9IDA7IG51bWJlck9mVGFibGVzIDwgcmVzdWx0LmRhdGEubGVuZ3RoOyBudW1iZXJPZlRhYmxlcysrKSB7XG4gICAgY29uc3Qgb3V0U3RyaW5nID0gSlNPTi5zdHJpbmdpZnkocmVzdWx0LmRhdGFbbnVtYmVyT2ZUYWJsZXNdKTtcbiAgICB0YWJsZUFycmF5LnB1c2gob3V0U3RyaW5nKTtcbiAgfVxuICB0aGlzLl90YWJsZXNbbWFjcm9OYW1lXSA9IHRhYmxlQXJyYXk7XG59O1xuXG5UYWJsZXMucHJvdG90eXBlLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBUYWJsZXM7XG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuY29uc3QgbG9ncyA9IHJlcXVpcmUoJy4uL2xvZ3MuanMnKTtcblxuLypcbiogQ29udmVydCB0YWJsZSBvYmplY3QgdG8gU2FzIHJlYWRhYmxlIG9iamVjdFxuKlxuKiBAcGFyYW0ge29iamVjdH0gaW5PYmplY3QgLSBPYmplY3QgdG8gY29udmVydFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmNvbnZlcnRUYWJsZU9iamVjdCA9IGZ1bmN0aW9uKGluT2JqZWN0LCBjaHVua1RocmVzaG9sZCkge1xuICBjb25zdCBzZWxmICAgICAgICAgICAgPSB0aGlzO1xuXG4gIGlmKGNodW5rVGhyZXNob2xkID4gMzAwMDApIHtcbiAgICBjb25zb2xlLndhcm4oJ1lvdSBzaG91bGQgbm90IHNldCB0aHJlc2hvbGQgbGFyZ2VyIHRoYW4gMzBrYiBiZWNhdXNlIG9mIHRoZSBTQVMgbGltaXRhdGlvbnMnKTtcbiAgfVxuXG4gIC8vIGZpcnN0IGNoZWNrIHRoYXQgdGhlIG9iamVjdCBpcyBhbiBhcnJheVxuICBpZiAodHlwZW9mIChpbk9iamVjdCkgIT09ICdvYmplY3QnKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgaXMgbm90IGFuIG9iamVjdCcpO1xuICB9XG5cbiAgY29uc3QgYXJyYXlMZW5ndGggPSBpbk9iamVjdC5sZW5ndGg7XG4gIGlmICh0eXBlb2YgKGFycmF5TGVuZ3RoKSAhPT0gJ251bWJlcicpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RoZSBwYXJhbWV0ZXIgcGFzc2VkIHRvIGNoZWNrQW5kR2V0VHlwZU9iamVjdCBkb2VzIG5vdCBoYXZlIGEgdmFsaWQgbGVuZ3RoIGFuZCBpcyBtb3N0IGxpa2VseSBub3QgYW4gYXJyYXknKTtcbiAgfVxuXG4gIGNvbnN0IGV4aXN0aW5nQ29scyA9IHt9OyAvLyB0aGlzIGlzIGp1c3QgdG8gbWFrZSBsb29rdXAgZWFzaWVyIHJhdGhlciB0aGFuIHRyYXZlcnNpbmcgYXJyYXkgZWFjaCB0aW1lLiBXaWxsIHRyYW5zZm9ybSBhZnRlclxuXG4gIC8vIGZ1bmN0aW9uIGNoZWNrQW5kU2V0QXJyYXkgLSB0aGlzIHdpbGwgY2hlY2sgYW4gaW5PYmplY3QgY3VycmVudCBrZXkgYWdhaW5zdCB0aGUgZXhpc3RpbmcgdHlwZUFycmF5IGFuZCBlaXRoZXIgcmV0dXJuIC0xIGlmIHRoZXJlXG4gIC8vIGlzIGEgdHlwZSBtaXNtYXRjaCBvciBhZGQgYW4gZWxlbWVudCBhbmQgdXBkYXRlL2luY3JlbWVudCB0aGUgbGVuZ3RoIGlmIG5lZWRlZFxuXG4gIGZ1bmN0aW9uIGNoZWNrQW5kSW5jcmVtZW50KGNvbFNwZWMpIHtcbiAgICBpZiAodHlwZW9mIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSkgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXSAgICAgICAgICAgPSB7fTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbE5hbWUgICA9IGNvbFNwZWMuY29sTmFtZTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbFR5cGUgICA9IGNvbFNwZWMuY29sVHlwZTtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTtcbiAgICAgIHJldHVybiAwOyAvLyBhbGwgb2tcbiAgICB9XG4gICAgLy8gY2hlY2sgdHlwZSBtYXRjaFxuICAgIGlmIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICE9PSBjb2xTcGVjLmNvbFR5cGUpIHtcbiAgICAgIHJldHVybiAtMTsgLy8gdGhlcmUgaXMgYSBmdWRnZSBpbiB0aGUgdHlwaW5nXG4gICAgfVxuICAgIGlmIChleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPCBjb2xTcGVjLmNvbExlbmd0aCkge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoID0gY29sU3BlYy5jb2xMZW5ndGggPiAwID8gY29sU3BlYy5jb2xMZW5ndGggOiAxOyAvLyBpbmNyZW1lbnQgdGhlIG1heCBsZW5ndGggb2YgdGhpcyBjb2x1bW5cbiAgICAgIHJldHVybiAwO1xuICAgIH1cbiAgfVxuICBsZXQgY2h1bmtBcnJheUNvdW50ICAgICAgICAgPSAwOyAvLyB0aGlzIGlzIGZvciBrZWVwaW5nIHRhYnMgb24gaG93IGxvbmcgdGhlIGN1cnJlbnQgYXJyYXkgc3RyaW5nIHdvdWxkIGJlXG4gIGNvbnN0IHRhcmdldEFycmF5ICAgICAgICAgICA9IFtdOyAvLyB0aGlzIGlzIHRoZSBhcnJheSBvZiB0YXJnZXQgYXJyYXlzXG4gIGxldCBjdXJyZW50VGFyZ2V0ICAgICAgICAgICA9IDA7XG4gIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdICA9IFtdO1xuICBsZXQgaiAgICAgICAgICAgICAgICAgICAgICAgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGluT2JqZWN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal0gPSB7fTtcbiAgICBsZXQgY2h1bmtSb3dDb3VudCAgICAgICAgICAgICA9IDA7XG5cbiAgICBmb3IgKGxldCBrZXkgaW4gaW5PYmplY3RbaV0pIHtcbiAgICAgIGNvbnN0IHRoaXNTcGVjICA9IHt9O1xuICAgICAgY29uc3QgdGhpc1ZhbHVlID0gaW5PYmplY3RbaV1ba2V5XTtcblxuICAgICAgLy9za2lwIHVuZGVmaW5lZCB2YWx1ZXNcbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHRoaXNWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy90aHJvdyBhbiBlcnJvciBpZiB0aGVyZSdzIE5hTiB2YWx1ZVxuICAgICAgaWYodHlwZW9mIHRoaXNWYWx1ZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odGhpc1ZhbHVlKSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmFOIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICBpZih0aGlzVmFsdWUgPT09IC1JbmZpbml0eSB8fCB0aGlzVmFsdWUgPT09IEluZmluaXR5KSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHRoaXNWYWx1ZS50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSB0cnVlIHx8IHRoaXNWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0Jvb2xlYW4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIC8vIGdldCB0eXBlLi4uIGlmIGl0IGlzIGFuIG9iamVjdCB0aGVuIGNvbnZlcnQgaXQgdG8ganNvbiBhbmQgc3RvcmUgYXMgYSBzdHJpbmdcbiAgICAgIGNvbnN0IHRoaXNUeXBlICA9IHR5cGVvZiAodGhpc1ZhbHVlKTtcblxuICAgICAgaWYgKHRoaXNUeXBlID09PSAnbnVtYmVyJykgeyAvLyBzdHJhaWdodGZvcndhcmQgbnVtYmVyXG4gICAgICAgIGlmKHRoaXNWYWx1ZSA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHRoaXNWYWx1ZSA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG4gICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnT2JqZWN0WycgKyBpICsgJ10uJyArIGtleSArICcgLSBUaGlzIHZhbHVlIGV4Y2VlZHMgZXhwZWN0ZWQgbnVtZXJpYyBwcmVjaXNpb24uJyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ251bSc7XG4gICAgICAgIHRoaXNTcGVjLmNvbExlbmd0aCAgICAgICAgICAgICAgICAgID0gODtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0aGlzVmFsdWUudG9TdHJpbmcoKS5sZW5ndGg7XG4gICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gID0gdGhpc1ZhbHVlO1xuICAgICAgfSBlbHNlIGlmICh0aGlzVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICA9IGtleTtcbiAgICAgICAgdGhpc1NwZWMuY29sVHlwZSAgICA9ICdzdHJpbmcnO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggID0gdGhpc1ZhbHVlLmxlbmd0aDtcblxuICAgICAgICBpZiAodGhpc1ZhbHVlID09PSBcIlwiKSB7XG4gICAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSA9IFwiIFwiO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBlbmNvZGVVUklDb21wb25lbnQodGhpc1ZhbHVlKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYodGhpc1ZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgXHRjb25zb2xlLmxvZyhcIkVSUk9SIFZBTFVFIFwiLCB0aGlzVmFsdWUpXG4gICAgICBcdGNvbnNvbGUubG9nKFwiVFlQRU9GIFZBTFVFIFwiLCB0eXBlb2YgdGhpc1ZhbHVlKVxuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnRGF0ZSB0eXBlIG5vdCBzdXBwb3J0ZWQuIFBsZWFzZSB1c2UgaDU0cy50b1Nhc0RhdGVUaW1lIGZ1bmN0aW9uIHRvIGNvbnZlcnQgaXQnKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhpc1NwZWMuY29sTmFtZSAgICAgICAgICAgICAgICAgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgICAgICAgICAgICAgICAgID0gJ2pzb24nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IEpTT04uc3RyaW5naWZ5KHRoaXNWYWx1ZSkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IGVuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpKS5yZXBsYWNlKC8nL2csICclMjcnKTtcbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCAgICAgICAgICAgICAgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldLmxlbmd0aDtcbiAgICAgIH1cblxuICAgICAgY2h1bmtSb3dDb3VudCA9IGNodW5rUm93Q291bnQgKyA2ICsga2V5Lmxlbmd0aCArIHRoaXNTcGVjLmVuY29kZWRMZW5ndGg7XG5cbiAgICAgIGlmIChjaGVja0FuZEluY3JlbWVudCh0aGlzU3BlYykgPT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgdHlwZSBtaXNtYXRjaCBpbiB0aGUgYXJyYXkgYmV0d2VlbiB2YWx1ZXMgKGNvbHVtbnMpIG9mIHRoZSBzYW1lIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy9yZW1vdmUgbGFzdCBhZGRlZCByb3cgaWYgaXQncyBlbXB0eVxuICAgIGlmKE9iamVjdC5rZXlzKHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdKS5sZW5ndGggPT09IDApIHtcbiAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnNwbGljZShqLCAxKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnUm93ICcgKyBqICsgJyBleGNlZWRzIHNpemUgbGltaXQgb2YgMzJrYicpO1xuICAgIH0gZWxzZSBpZihjaHVua0FycmF5Q291bnQgKyBjaHVua1Jvd0NvdW50ID4gY2h1bmtUaHJlc2hvbGQpIHtcbiAgICAgIC8vY3JlYXRlIG5ldyBhcnJheSBpZiB0aGlzIG9uZSBpcyBmdWxsIGFuZCBtb3ZlIHRoZSBsYXN0IGl0ZW0gdG8gdGhlIG5ldyBhcnJheVxuICAgICAgY29uc3QgbGFzdFJvdyA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdLnBvcCgpOyAvLyBnZXQgcmlkIG9mIHRoYXQgbGFzdCByb3dcbiAgICAgIGN1cnJlbnRUYXJnZXQrKzsgLy8gbW92ZSBvbnRvIHRoZSBuZXh0IGFycmF5XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbbGFzdFJvd107IC8vIG1ha2UgaXQgYW4gYXJyYXlcbiAgICAgIGogICAgICAgICAgICAgICAgICAgICAgICAgICA9IDA7IC8vIGluaXRpYWxpc2UgbmV3IHJvdyBjb3VudGVyIGZvciBuZXcgYXJyYXkgLSBpdCB3aWxsIGJlIGluY3JlbWVudGVkIGF0IHRoZSBlbmQgb2YgdGhlIGZ1bmN0aW9uXG4gICAgICBjaHVua0FycmF5Q291bnQgICAgICAgICAgICAgPSBjaHVua1Jvd0NvdW50OyAvLyB0aGlzIGlzIHRoZSBuZXcgY2h1bmsgbWF4IHNpemVcbiAgICB9IGVsc2Uge1xuICAgICAgY2h1bmtBcnJheUNvdW50ID0gY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudDtcbiAgICB9XG4gICAgaisrO1xuICB9XG5cbiAgLy8gcmVmb3JtYXQgZXhpc3RpbmdDb2xzIGludG8gYW4gYXJyYXkgc28gc2FzIGNhbiBwYXJzZSBpdDtcbiAgY29uc3Qgc3BlY0FycmF5ID0gW107XG4gIGZvciAobGV0IGsgaW4gZXhpc3RpbmdDb2xzKSB7XG4gICAgc3BlY0FycmF5LnB1c2goZXhpc3RpbmdDb2xzW2tdKTtcbiAgfVxuICByZXR1cm4ge1xuICAgIHNwZWM6ICAgICAgIHNwZWNBcnJheSxcbiAgICBkYXRhOiAgICAgICB0YXJnZXRBcnJheSxcbiAgICBqc29uTGVuZ3RoOiBjaHVua0FycmF5Q291bnRcbiAgfTsgLy8gdGhlIHNwZWMgd2lsbCBiZSB0aGUgbWFjcm9bMF0sIHdpdGggdGhlIGRhdGEgc3BsaXQgaW50byBhcnJheXMgb2YgbWFjcm9bMS1uXVxuICAvLyBtZWFucyBpbiB0ZXJtcyBvZiBkb2pvIHhociBvYmplY3QgYXQgbGVhc3QgdGhleSBuZWVkIHRvIGdvIGludG8gdGhlIHNhbWUgYXJyYXlcbn07XG5cbi8qXG4qIENvbnZlcnQgamF2YXNjcmlwdCBkYXRlIHRvIHNhcyB0aW1lXG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBqc0RhdGUgLSBqYXZhc2NyaXB0IERhdGUgb2JqZWN0XG4qXG4qL1xubW9kdWxlLmV4cG9ydHMudG9TYXNEYXRlVGltZSA9IGZ1bmN0aW9uIChqc0RhdGUpIHtcbiAgY29uc3QgYmFzZWRhdGUgPSBuZXcgRGF0ZShcIkphbnVhcnkgMSwgMTk2MCAwMDowMDowMFwiKTtcbiAgY29uc3QgY3VycmRhdGUgPSBqc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICBjb25zdCBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuICBjb25zdCBjdXJyT2Zmc2V0ID0gY3VycmRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgY3VycmRhdGUgdG8gYSBzYXMgZGF0ZXRpbWVcbiAgY29uc3Qgb2Zmc2V0U2VjcyAgICA9IChjdXJyT2Zmc2V0IC0gYmFzZU9mZnNldCkgKiA2MDsgLy8gb2Zmc2V0RGlmZiBpcyBpbiBtaW51dGVzIHRvIHN0YXJ0IHdpdGhcbiAgY29uc3QgYmFzZURhdGVTZWNzICA9IGJhc2VkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgY29uc3QgY3VycmRhdGVTZWNzICA9IGN1cnJkYXRlLmdldFRpbWUoKSAvIDEwMDA7IC8vIGdldCByaWQgb2YgbXNcbiAgY29uc3Qgc2FzRGF0ZXRpbWUgICA9IE1hdGgucm91bmQoY3VycmRhdGVTZWNzIC0gYmFzZURhdGVTZWNzIC0gb2Zmc2V0U2Vjcyk7IC8vIGFkanVzdFxuXG4gIHJldHVybiBzYXNEYXRldGltZTtcbn07XG4iXX0=
