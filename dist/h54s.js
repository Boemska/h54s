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
h54s.version = '2.0.0';


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
		if (res.status == 449 || (res.status == 403 && (res.responseText.includes('_csrf') || res.getResponseHeader('X-Forbidden-Reason') === 'CSRF') && (_csrf = res.getResponseHeader(res.getResponseHeader('X-CSRF-HEADER'))))) {
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

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvZXJyb3IuanMiLCJzcmMvZmlsZXMvaW5kZXguanMiLCJzcmMvaDU0cy5qcyIsInNyYy9pZV9wb2x5ZmlsbHMuanMiLCJzcmMvbG9ncy5qcyIsInNyYy9tZXRob2RzL2FqYXguanMiLCJzcmMvbWV0aG9kcy9pbmRleC5qcyIsInNyYy9tZXRob2RzL3V0aWxzLmpzIiwic3JjL3Nhc0RhdGEuanMiLCJzcmMvdGFibGVzL2luZGV4LmpzIiwic3JjL3RhYmxlcy91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0MkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIi8qXG4qIGg1NHMgZXJyb3IgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qQHBhcmFtIHtzdHJpbmd9IHR5cGUgLSBFcnJvciB0eXBlXG4qQHBhcmFtIHtzdHJpbmd9IG1lc3NhZ2UgLSBFcnJvciBtZXNzYWdlXG4qQHBhcmFtIHtzdHJpbmd9IHN0YXR1cyAtIEVycm9yIHN0YXR1cyByZXR1cm5lZCBmcm9tIFNBU1xuKlxuKi9cbmZ1bmN0aW9uIGg1NHNFcnJvcih0eXBlLCBtZXNzYWdlLCBzdGF0dXMpIHtcbiAgaWYoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzKTtcbiAgfVxuICB0aGlzLm1lc3NhZ2UgPSBtZXNzYWdlO1xuICB0aGlzLnR5cGUgICAgPSB0eXBlO1xuICB0aGlzLnN0YXR1cyAgPSBzdGF0dXM7XG59XG5cbmg1NHNFcnJvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKEVycm9yLnByb3RvdHlwZSwge1xuICBjb25zdHJ1Y3Rvcjoge1xuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiBoNTRzRXJyb3JcbiAgfSxcbiAgbmFtZToge1xuICAgIGNvbmZpZ3VyYWJsZTogZmFsc2UsXG4gICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgd3JpdGFibGU6IGZhbHNlLFxuICAgIHZhbHVlOiAnaDU0c0Vycm9yJ1xuICB9XG59KTtcblxubW9kdWxlLmV4cG9ydHMgPSBoNTRzRXJyb3I7XG4iLCJjb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG4vKipcbiogaDU0cyBTQVMgRmlsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7ZmlsZX0gZmlsZSAtIEZpbGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxuKkBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBtYWNybyBuYW1lXG4qXG4qL1xuZnVuY3Rpb24gRmlsZXMoZmlsZSwgbWFjcm9OYW1lKSB7XG4gIHRoaXMuX2ZpbGVzID0ge307XG5cbiAgRmlsZXMucHJvdG90eXBlLmFkZC5jYWxsKHRoaXMsIGZpbGUsIG1hY3JvTmFtZSk7XG59XG5cbi8qKlxuKiBBZGQgZmlsZSB0byBmaWxlcyBvYmplY3RcbiogQHBhcmFtIHtmaWxlfSBmaWxlIC0gSW5zdGFuY2Ugb2YgSmF2YVNjcmlwdCBGaWxlIG9iamVjdFxuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5GaWxlcy5wcm90b3R5cGUuYWRkID0gZnVuY3Rpb24oZmlsZSwgbWFjcm9OYW1lKSB7XG4gIGlmKGZpbGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoIShmaWxlIGluc3RhbmNlb2YgRmlsZSB8fCBmaWxlIGluc3RhbmNlb2YgQmxvYikpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnRmlyc3QgYXJndW1lbnQgbXVzdCBiZSBpbnN0YW5jZSBvZiBGaWxlIG9iamVjdCcpO1xuICAgIH1cbiAgICBpZih0eXBlb2YgbWFjcm9OYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdTZWNvbmQgYXJndW1lbnQgbXVzdCBiZSBzdHJpbmcnKTtcbiAgICB9XG4gICAgaWYoIWlzTmFOKG1hY3JvTmFtZVttYWNyb05hbWUubGVuZ3RoIC0gMV0pKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01hY3JvIG5hbWUgY2Fubm90IGhhdmUgbnVtYmVyIGF0IHRoZSBlbmQnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGFyZ3VtZW50cycpO1xuICB9XG5cbiAgdGhpcy5fZmlsZXNbbWFjcm9OYW1lXSA9IFtcbiAgICAnRklMRScsXG4gICAgZmlsZVxuICBdO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGaWxlcztcbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4vZXJyb3IuanMnKTtcblxuY29uc3Qgc2FzVmVyc2lvbk1hcCA9IHtcblx0djk6IHtcbiAgICB1cmw6ICcvU0FTU3RvcmVkUHJvY2Vzcy9kbycsXG4gICAgbG9naW5Vcmw6ICcvU0FTTG9nb24vbG9naW4nLFxuXHRcdGxvZ291dFVybDogJy9TQVNTdG9yZWRQcm9jZXNzL2RvP19hY3Rpb249bG9nb2ZmJyxcbiAgICBSRVNUQXV0aExvZ2luVXJsOiAnL1NBU0xvZ29uL3YxL3RpY2tldHMnXG5cdH0sXG5cdHZpeWE6IHtcblx0XHR1cmw6ICcvU0FTSm9iRXhlY3V0aW9uLycsXG4gICAgbG9naW5Vcmw6ICcvU0FTTG9nb24vbG9naW4uZG8nLFxuXHRcdGxvZ291dFVybDogJy9TQVNMb2dvbi9sb2dvdXQuZG8/JyxcbiAgICBSRVNUQXV0aExvZ2luVXJsOiAnJ1xuXHR9XG59XG5cbi8qKlxuKlxuKiBAY29uc3RydWN0b3JcbiogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyAtIENvbmZpZ3VyYXRpb24gb2JqZWN0IGZvciB0aGUgSDU0UyBTQVMgQWRhcHRlclxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLnNhc1ZlcnNpb24gLSBWZXJzaW9uIG9mIFNBUywgZWl0aGVyICd2OScgb3IgJ3ZpeWEnXG4qIEBwYXJhbSB7Qm9vbGVhbn0gY29uZmlnLmRlYnVnIC0gV2hldGhlciBkZWJ1ZyBtb2RlIGlzIGVuYWJsZWQsIHNldHMgX2RlYnVnPTEzMVxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLm1ldGFkYXRhUm9vdCAtIEJhc2UgcGF0aCBvZiBhbGwgcHJvamVjdCBzZXJ2aWNlcyB0byBiZSBwcmVwZW5kZWQgdG8gX3Byb2dyYW0gcGF0aFxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLnVybCAtIFVSSSBvZiB0aGUgam9iIGV4ZWN1dG9yIC0gU1BXQSBvciBKRVNcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5sb2dpblVybCAtIFVSSSBvZiB0aGUgU0FTTG9nb24gd2ViIGxvZ2luIHBhdGggLSBvdmVycmlkZGVuIGJ5IGZvcm0gYWN0aW9uXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcubG9nb3V0VXJsIC0gVVJJIG9mIHRoZSBsb2dvdXQgYWN0aW9uXG4qIEBwYXJhbSB7U3RyaW5nfSBjb25maWcuUkVTVGF1dGggLSBCb29sZWFuIHRvIHRvZ2dsZSB1c2Ugb2YgUkVTVCBhdXRoZW50aWNhdGlvbiBpbiBTQVMgdjlcbiogQHBhcmFtIHtTdHJpbmd9IGNvbmZpZy5SRVNUYXV0aExvZ2luVXJsIC0gQWRkcmVzcyBvZiBTQVNMb2dvbiB0aWNrZXRzIGVuZHBvaW50IGZvciBSRVNUIGF1dGhcbiogQHBhcmFtIHtCb29sZWFufSBjb25maWcucmV0cnlBZnRlckxvZ2luIC0gV2hldGhlciB0byByZXN1bWUgcmVxdWVzdHMgd2hpY2ggd2VyZSBwYXJrZWQgd2l0aCBsb2dpbiByZWRpcmVjdCBhZnRlciBhIHN1Y2Nlc3NmdWwgcmUtbG9naW5cbiogQHBhcmFtIHtOdW1iZXJ9IGNvbmZpZy5tYXhYaHJSZXRyaWVzIC0gSWYgYSBwcm9ncmFtIGNhbGwgZmFpbHMsIGF0dGVtcHQgdG8gY2FsbCBpdCBhZ2FpbiBOIHRpbWVzIHVudGlsIGl0IHN1Y2NlZWRzXG4qIEBwYXJhbSB7TnVtYmVyfSBjb25maWcuYWpheFRpbWVvdXQgLSBOdW1iZXIgb2YgbWlsbGlzZWNvbmRzIHRvIHdhaXQgZm9yIGEgcmVzcG9uc2UgYmVmb3JlIGNsb3NpbmcgdGhlIHJlcXVlc3RcbiogQHBhcmFtIHtCb29sZWFufSBjb25maWcudXNlTXVsdGlwYXJ0Rm9ybURhdGEgLSBXaGV0aGVyIHRvIHVzZSBtdWx0aXBhcnQgZm9yIFBPU1QgLSBmb3IgbGVnYWN5IGJhY2tlbmQgc3VwcG9ydFxuKiBAcGFyYW0ge1N0cmluZ30gY29uZmlnLmNzcmYgLSBDU1JGIHRva2VuIGZvciBKRVNcbiogQFxuKlxuKi9cbmNvbnN0IGg1NHMgPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGNvbmZpZykge1xuICAvLyBEZWZhdWx0IGNvbmZpZyB2YWx1ZXMsIG92ZXJyaWRkZW4gYnkgYW55dGhpbmcgaW4gdGhlIGNvbmZpZyBvYmplY3Rcblx0dGhpcy5zYXNWZXJzaW9uICAgICAgICAgICA9IChjb25maWcgJiYgY29uZmlnLnNhc1ZlcnNpb24pIHx8ICd2OScgLy91c2UgdjkgYXMgZGVmYXVsdD1cbiAgdGhpcy5kZWJ1ZyAgICAgICAgICAgICAgICA9IChjb25maWcgJiYgY29uZmlnLmRlYnVnKSB8fCBmYWxzZTtcbiAgdGhpcy5tZXRhZGF0YVJvb3RcdFx0XHRcdFx0PSAoY29uZmlnICYmIGNvbmZpZy5tZXRhZGF0YVJvb3QpIHx8ICcnO1xuICB0aGlzLnVybCAgICAgICAgICAgICAgICAgID0gc2FzVmVyc2lvbk1hcFt0aGlzLnNhc1ZlcnNpb25dLnVybDtcbiAgdGhpcy5sb2dpblVybCAgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5sb2dpblVybDtcbiAgdGhpcy5sb2dvdXRVcmwgICAgICAgICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5sb2dvdXRVcmw7XG4gIHRoaXMuUkVTVGF1dGggICAgICAgICAgICAgPSBmYWxzZTtcbiAgdGhpcy5SRVNUYXV0aExvZ2luVXJsICAgICA9IHNhc1ZlcnNpb25NYXBbdGhpcy5zYXNWZXJzaW9uXS5SRVNUQXV0aExvZ2luVXJsO1xuICB0aGlzLnJldHJ5QWZ0ZXJMb2dpbiAgICAgID0gdHJ1ZTtcbiAgdGhpcy5tYXhYaHJSZXRyaWVzICAgICAgICA9IDU7XG4gIHRoaXMuYWpheFRpbWVvdXQgICAgICAgICAgPSAoY29uZmlnICYmIGNvbmZpZy5hamF4VGltZW91dCkgfHwgMzAwMDAwO1xuICB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhID0gKGNvbmZpZyAmJiBjb25maWcudXNlTXVsdGlwYXJ0Rm9ybURhdGEpIHx8IHRydWU7XG4gIHRoaXMuY3NyZiAgICAgICAgICAgICAgICAgPSAnJ1xuICB0aGlzLmlzVml5YVx0XHRcdFx0XHRcdFx0XHQ9IHRoaXMuc2FzVmVyc2lvbiA9PT0gJ3ZpeWEnO1xuXG4gIC8vIEluaXRpYWxpc2luZyBjYWxsYmFjayBzdGFja3MgZm9yIHdoZW4gYXV0aGVudGljYXRpb24gaXMgcGF1c2VkXG4gIHRoaXMucmVtb3RlQ29uZmlnVXBkYXRlQ2FsbGJhY2tzID0gW107XG4gIHRoaXMuX3BlbmRpbmdDYWxscyA9IFtdO1xuICB0aGlzLl9jdXN0b21QZW5kaW5nQ2FsbHMgPSBbXTtcbiAgdGhpcy5fZGlzYWJsZUNhbGxzID0gZmFsc2VcbiAgdGhpcy5fYWpheCA9IHJlcXVpcmUoJy4vbWV0aG9kcy9hamF4LmpzJykoKTtcblxuICBfc2V0Q29uZmlnLmNhbGwodGhpcywgY29uZmlnKTtcblxuICAvLyBJZiB0aGlzIGluc3RhbmNlIHdhcyBkZXBsb3llZCB3aXRoIGEgc3RhbmRhbG9uZSBjb25maWcgZXh0ZXJuYWwgdG8gdGhlIGJ1aWxkIHVzZSB0aGF0XG4gIGlmKGNvbmZpZyAmJiBjb25maWcuaXNSZW1vdGVDb25maWcpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcblxuICAgIHRoaXMuX2Rpc2FibGVDYWxscyA9IHRydWU7XG5cbiAgICAvLyAnaDU0c0NvbmZpZy5qc29uJyBpcyBmb3IgdGhlIHRlc3Rpbmcgd2l0aCBrYXJtYVxuICAgIC8vcmVwbGFjZWQgYnkgZ3VscCBpbiBkZXYgYnVpbGQgKGRlZmluZWQgaW4gZ3VscGZpbGUgdW5kZXIgcHJveGllcylcbiAgICB0aGlzLl9hamF4LmdldCgnaDU0c0NvbmZpZy5qc29uJykuc3VjY2VzcyhmdW5jdGlvbihyZXMpIHtcbiAgICAgIGNvbnN0IHJlbW90ZUNvbmZpZyA9IEpTT04ucGFyc2UocmVzLnJlc3BvbnNlVGV4dClcblxuXHRcdFx0Ly8gU2F2ZSBsb2NhbCBjb25maWcgYmVmb3JlIHVwZGF0aW5nIGl0IHdpdGggcmVtb3RlIGNvbmZpZ1xuXHRcdFx0Y29uc3QgbG9jYWxDb25maWcgPSBPYmplY3QuYXNzaWduKHt9LCBjb25maWcpXG5cdFx0XHRjb25zdCBvbGRNZXRhZGF0YVJvb3QgPSBsb2NhbENvbmZpZy5tZXRhZGF0YVJvb3Q7XG5cbiAgICAgIGZvcihsZXQga2V5IGluIHJlbW90ZUNvbmZpZykge1xuICAgICAgICBpZihyZW1vdGVDb25maWcuaGFzT3duUHJvcGVydHkoa2V5KSAmJiBrZXkgIT09ICdpc1JlbW90ZUNvbmZpZycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9IHJlbW90ZUNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIF9zZXRDb25maWcuY2FsbChzZWxmLCBjb25maWcpO1xuXG4gICAgICAvLyBFeGVjdXRlIGNhbGxiYWNrcyB3aGVuIG92ZXJyaWRlcyBmcm9tIHJlbW90ZSBjb25maWcgYXJlIGFwcGxpZWRcbiAgICAgIGZvcihsZXQgaSA9IDAsIG4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgY29uc3QgZm4gPSBzZWxmLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrc1tpXTtcbiAgICAgICAgZm4oKTtcbiAgICAgIH1cblxuICAgICAgLy8gRXhlY3V0ZSBzYXMgY2FsbHMgZGlzYWJsZWQgd2hpbGUgd2FpdGluZyBmb3IgdGhlIGNvbmZpZ1xuICAgICAgc2VsZi5fZGlzYWJsZUNhbGxzID0gZmFsc2U7XG4gICAgICB3aGlsZShzZWxmLl9wZW5kaW5nQ2FsbHMubGVuZ3RoID4gMCkge1xuICAgICAgICBjb25zdCBwZW5kaW5nQ2FsbCA9IHNlbGYuX3BlbmRpbmdDYWxscy5zaGlmdCgpO1xuXHRcdFx0XHRjb25zdCBzYXNQcm9ncmFtID0gcGVuZGluZ0NhbGwub3B0aW9ucy5zYXNQcm9ncmFtO1xuXHRcdFx0XHRjb25zdCBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cdFx0XHRcdC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0cGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBwcm9ncmFtIHBhdGggd2l0aCBtZXRhZGF0YVJvb3QgaWYgaXQncyBub3Qgc2V0XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIHBhcmFtcy5fcHJvZ3JhbS5pbmRleE9mKHNlbGYubWV0YWRhdGFSb290KSA9PT0gLTEpIHtcbiAgICAgICAgICBwYXJhbXMuX3Byb2dyYW0gPSBzZWxmLm1ldGFkYXRhUm9vdC5yZXBsYWNlKC9cXC8/JC8sICcvJykgKyBwYXJhbXMuX3Byb2dyYW0ucmVwbGFjZShvbGRNZXRhZGF0YVJvb3QsICcnKS5yZXBsYWNlKC9eXFwvLywgJycpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gVXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcbiAgICAgICAgcGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXG4gICAgICAgIHNlbGYuY2FsbChzYXNQcm9ncmFtLCBudWxsLCBjYWxsYmFja1BlbmRpbmcsIHBhcmFtcyk7XG4gICAgICB9XG5cbiAgICAgIC8vIEV4ZWN1dGUgY3VzdG9tIGNhbGxzIHRoYXQgd2UgbWFkZSB3aGlsZSB3YWl0aW5mIGZvciB0aGUgY29uZmlnXG4gICAgICAgd2hpbGUoc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcbiAgICAgIFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9jdXN0b21QZW5kaW5nQ2FsbHMuc2hpZnQoKVxuXHRcdFx0XHRjb25zdCBjYWxsTWV0aG9kID0gcGVuZGluZ0NhbGwuY2FsbE1ldGhvZFxuXHRcdFx0XHRjb25zdCBfdXJsID0gcGVuZGluZ0NhbGwuX3VybFxuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gcGVuZGluZ0NhbGwub3B0aW9ucztcbiAgICAgICAgLy8vdXBkYXRlIHByb2dyYW0gd2l0aCBtZXRhZGF0YVJvb3QgaWYgaXQncyBub3Qgc2V0XG4gICAgICAgIGlmKHNlbGYubWV0YWRhdGFSb290ICYmIG9wdGlvbnMucGFyYW1zICYmIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtLmluZGV4T2Yoc2VsZi5tZXRhZGF0YVJvb3QpID09PSAtMSkge1xuICAgICAgICAgIG9wdGlvbnMucGFyYW1zLl9wcm9ncmFtID0gc2VsZi5tZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgb3B0aW9ucy5wYXJhbXMuX3Byb2dyYW0ucmVwbGFjZShvbGRNZXRhZGF0YVJvb3QsICcnKS5yZXBsYWNlKC9eXFwvLywgJycpO1xuICAgICAgICB9XG4gICAgICAgIC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgYWxzbyBtYXkgaGF2ZSBjaGFuZ2VkIGZyb20gcmVtb3RlQ29uZmlnXG5cdFx0XHRcdGlmIChvcHRpb25zLnBhcmFtcykge1xuXHRcdFx0XHRcdG9wdGlvbnMucGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNlbGYubWFuYWdlZFJlcXVlc3QoY2FsbE1ldGhvZCwgX3VybCwgb3B0aW9ucyk7XG4gICAgICB9XG4gICAgfSkuZXJyb3IoZnVuY3Rpb24gKGVycikge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYWpheEVycm9yJywgJ1JlbW90ZSBjb25maWcgZmlsZSBjYW5ub3QgYmUgbG9hZGVkLiBIdHRwIHN0YXR1cyBjb2RlOiAnICsgZXJyLnN0YXR1cyk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBwcml2YXRlIGZ1bmN0aW9uIHRvIHNldCBoNTRzIGluc3RhbmNlIHByb3BlcnRpZXNcbiAgZnVuY3Rpb24gX3NldENvbmZpZyhjb25maWcpIHtcbiAgICBpZighY29uZmlnKSB7XG4gICAgICB0aGlzLl9hamF4LnNldFRpbWVvdXQodGhpcy5hamF4VGltZW91dCk7XG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIGlmKHR5cGVvZiBjb25maWcgIT09ICdvYmplY3QnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgY29uZmlnIG9iamVjdCcpO1xuICAgIH1cblxuICAgIC8vbWVyZ2UgY29uZmlnIG9iamVjdCBmcm9tIHBhcmFtZXRlciB3aXRoIHRoaXNcbiAgICBmb3IobGV0IGtleSBpbiBjb25maWcpIHtcbiAgICAgIGlmKGNvbmZpZy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIGlmKChrZXkgPT09ICd1cmwnIHx8IGtleSA9PT0gJ2xvZ2luVXJsJykgJiYgY29uZmlnW2tleV0uY2hhckF0KDApICE9PSAnLycpIHtcbiAgICAgICAgICBjb25maWdba2V5XSA9ICcvJyArIGNvbmZpZ1trZXldO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNba2V5XSA9IGNvbmZpZ1trZXldO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vaWYgc2VydmVyIGlzIHJlbW90ZSB1c2UgdGhlIGZ1bGwgc2VydmVyIHVybFxuICAgIC8vTk9URTogVGhpcyByZXF1aXJlcyBDT1JTIGFuZCBpcyBoZXJlIGZvciBsZWdhY3kgc3VwcG9ydFxuICAgIGlmKGNvbmZpZy5ob3N0VXJsKSB7XG4gICAgICBpZihjb25maWcuaG9zdFVybC5jaGFyQXQoY29uZmlnLmhvc3RVcmwubGVuZ3RoIC0gMSkgPT09ICcvJykge1xuICAgICAgICBjb25maWcuaG9zdFVybCA9IGNvbmZpZy5ob3N0VXJsLnNsaWNlKDAsIC0xKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuaG9zdFVybCA9IGNvbmZpZy5ob3N0VXJsO1xuICAgICAgaWYgKCF0aGlzLnVybC5pbmNsdWRlcyh0aGlzLmhvc3RVcmwpKSB7XG5cdFx0XHRcdHRoaXMudXJsID0gY29uZmlnLmhvc3RVcmwgKyB0aGlzLnVybDtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5sb2dpblVybC5pbmNsdWRlcyh0aGlzLmhvc3RVcmwpKSB7XG5cdFx0XHRcdHRoaXMubG9naW5VcmwgPSBjb25maWcuaG9zdFVybCArIHRoaXMubG9naW5Vcmw7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuUkVTVGF1dGhMb2dpblVybC5pbmNsdWRlcyh0aGlzLmhvc3RVcmwpKSB7XG5cdFx0XHRcdHRoaXMuUkVTVGF1dGhMb2dpblVybCA9IGNvbmZpZy5ob3N0VXJsICsgdGhpcy5SRVNUYXV0aExvZ2luVXJsO1xuXHRcdFx0fVxuICAgIH1cblxuICAgIHRoaXMuX2FqYXguc2V0VGltZW91dCh0aGlzLmFqYXhUaW1lb3V0KTtcbiAgfVxufTtcblxuLy8gcmVwbGFjZWQgYnkgZ3VscCB3aXRoIHJlYWwgdmVyc2lvbiBhdCBidWlsZCB0aW1lXG5oNTRzLnZlcnNpb24gPSAnX192ZXJzaW9uX18nO1xuXG5cbmg1NHMucHJvdG90eXBlID0gcmVxdWlyZSgnLi9tZXRob2RzJyk7XG5cbmg1NHMuVGFibGVzID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcbmg1NHMuRmlsZXMgPSByZXF1aXJlKCcuL2ZpbGVzJyk7XG5oNTRzLlNhc0RhdGEgPSByZXF1aXJlKCcuL3Nhc0RhdGEuanMnKTtcblxuaDU0cy5mcm9tU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL21ldGhvZHMvdXRpbHMuanMnKS5mcm9tU2FzRGF0ZVRpbWU7XG5oNTRzLnRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XG5cbi8vc2VsZiBpbnZva2VkIGZ1bmN0aW9uIG1vZHVsZVxucmVxdWlyZSgnLi9pZV9wb2x5ZmlsbHMuanMnKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gIGlmICghT2JqZWN0LmNyZWF0ZSkge1xuICAgIE9iamVjdC5jcmVhdGUgPSBmdW5jdGlvbihwcm90bywgcHJvcHMpIHtcbiAgICAgIGlmICh0eXBlb2YgcHJvcHMgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICAgICAgdGhyb3cgXCJUaGUgbXVsdGlwbGUtYXJndW1lbnQgdmVyc2lvbiBvZiBPYmplY3QuY3JlYXRlIGlzIG5vdCBwcm92aWRlZCBieSB0aGlzIGJyb3dzZXIgYW5kIGNhbm5vdCBiZSBzaGltbWVkLlwiO1xuICAgICAgfVxuICAgICAgZnVuY3Rpb24gY3RvcigpIHsgfVxuICAgICAgY3Rvci5wcm90b3R5cGUgPSBwcm90bztcbiAgICAgIHJldHVybiBuZXcgY3RvcigpO1xuICAgIH07XG4gIH1cblxuXG4gIC8vIEZyb20gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2tleXNcbiAgaWYgKCFPYmplY3Qua2V5cykge1xuICAgIE9iamVjdC5rZXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcbiAgICAgIHZhciBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksXG4gICAgICAgICAgaGFzRG9udEVudW1CdWcgPSAhKHt0b1N0cmluZzogbnVsbH0pLnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpLFxuICAgICAgICAgIGRvbnRFbnVtcyA9IFtcbiAgICAgICAgICAgICd0b1N0cmluZycsXG4gICAgICAgICAgICAndG9Mb2NhbGVTdHJpbmcnLFxuICAgICAgICAgICAgJ3ZhbHVlT2YnLFxuICAgICAgICAgICAgJ2hhc093blByb3BlcnR5JyxcbiAgICAgICAgICAgICdpc1Byb3RvdHlwZU9mJyxcbiAgICAgICAgICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZScsXG4gICAgICAgICAgICAnY29uc3RydWN0b3InXG4gICAgICAgICAgXSxcbiAgICAgICAgICBkb250RW51bXNMZW5ndGggPSBkb250RW51bXMubGVuZ3RoO1xuXG4gICAgICByZXR1cm4gZnVuY3Rpb24gKG9iaikge1xuICAgICAgICBpZiAodHlwZW9mIG9iaiAhPT0gJ29iamVjdCcgJiYgKHR5cGVvZiBvYmogIT09ICdmdW5jdGlvbicgfHwgb2JqID09PSBudWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ09iamVjdC5rZXlzIGNhbGxlZCBvbiBub24tb2JqZWN0Jyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcmVzdWx0ID0gW10sIHByb3AsIGk7XG5cbiAgICAgICAgZm9yIChwcm9wIGluIG9iaikge1xuICAgICAgICAgIGlmIChoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCkpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKHByb3ApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChoYXNEb250RW51bUJ1Zykge1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBkb250RW51bXNMZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwob2JqLCBkb250RW51bXNbaV0pKSB7XG4gICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGRvbnRFbnVtc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICB9O1xuICAgIH0oKSk7XG4gIH1cblxuICAvLyBGcm9tIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0FycmF5L2xhc3RJbmRleE9mXG4gIGlmICghQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mKSB7XG4gICAgQXJyYXkucHJvdG90eXBlLmxhc3RJbmRleE9mID0gZnVuY3Rpb24oc2VhcmNoRWxlbWVudCAvKiwgZnJvbUluZGV4Ki8pIHtcbiAgICAgICd1c2Ugc3RyaWN0JztcblxuICAgICAgaWYgKHRoaXMgPT09IHZvaWQgMCB8fCB0aGlzID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoKTtcbiAgICAgIH1cblxuICAgICAgdmFyIG4sIGssXG4gICAgICAgIHQgPSBPYmplY3QodGhpcyksXG4gICAgICAgIGxlbiA9IHQubGVuZ3RoID4+PiAwO1xuICAgICAgaWYgKGxlbiA9PT0gMCkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgICB9XG5cbiAgICAgIG4gPSBsZW4gLSAxO1xuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAxKSB7XG4gICAgICAgIG4gPSBOdW1iZXIoYXJndW1lbnRzWzFdKTtcbiAgICAgICAgaWYgKG4gIT0gbikge1xuICAgICAgICAgIG4gPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG4gIT09IDAgJiYgbiAhPSAoMSAvIDApICYmIG4gIT0gLSgxIC8gMCkpIHtcbiAgICAgICAgICBuID0gKG4gPiAwIHx8IC0xKSAqIE1hdGguZmxvb3IoTWF0aC5hYnMobikpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZvciAoayA9IG4gPj0gMCA/IE1hdGgubWluKG4sIGxlbiAtIDEpIDogbGVuIC0gTWF0aC5hYnMobik7IGsgPj0gMDsgay0tKSB7XG4gICAgICAgIGlmIChrIGluIHQgJiYgdFtrXSA9PT0gc2VhcmNoRWxlbWVudCkge1xuICAgICAgICAgIHJldHVybiBrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxufSgpO1xuIiwiY29uc3QgbG9ncyA9IHtcbiAgYXBwbGljYXRpb25Mb2dzOiBbXSxcbiAgZGVidWdEYXRhOiBbXSxcbiAgc2FzRXJyb3JzOiBbXSxcbiAgZmFpbGVkUmVxdWVzdHM6IFtdXG59O1xuXG5jb25zdCBsaW1pdHMgPSB7XG4gIGFwcGxpY2F0aW9uTG9nczogMTAwLFxuICBkZWJ1Z0RhdGE6IDIwLFxuICBmYWlsZWRSZXF1ZXN0czogMjAsXG4gIHNhc0Vycm9yczogMTAwXG59O1xuXG5tb2R1bGUuZXhwb3J0cy5nZXQgPSB7XG4gIGdldFNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGxvZ3Muc2FzRXJyb3JzO1xuICB9LFxuICBnZXRBcHBsaWNhdGlvbkxvZ3M6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBsb2dzLmFwcGxpY2F0aW9uTG9ncztcbiAgfSxcbiAgZ2V0RGVidWdEYXRhOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5kZWJ1Z0RhdGE7XG4gIH0sXG4gIGdldEZhaWxlZFJlcXVlc3RzOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbG9ncy5mYWlsZWRSZXF1ZXN0cztcbiAgfSxcbiAgZ2V0QWxsTG9nczogZnVuY3Rpb24gKCkge1xuICAgIHJldHVybiB7XG4gICAgICBzYXNFcnJvcnM6IGxvZ3Muc2FzRXJyb3JzLFxuICAgICAgYXBwbGljYXRpb25Mb2dzOiBsb2dzLmFwcGxpY2F0aW9uTG9ncyxcbiAgICAgIGRlYnVnRGF0YTogbG9ncy5kZWJ1Z0RhdGEsXG4gICAgICBmYWlsZWRSZXF1ZXN0czogbG9ncy5mYWlsZWRSZXF1ZXN0c1xuICAgIH1cbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMuY2xlYXIgPSB7XG4gIGNsZWFyQXBwbGljYXRpb25Mb2dzOiBmdW5jdGlvbigpIHtcbiAgICBsb2dzLmFwcGxpY2F0aW9uTG9ncy5zcGxpY2UoMCwgbG9ncy5hcHBsaWNhdGlvbkxvZ3MubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJEZWJ1Z0RhdGE6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNwbGljZSgwLCBsb2dzLmRlYnVnRGF0YS5sZW5ndGgpO1xuICB9LFxuICBjbGVhclNhc0Vycm9yczogZnVuY3Rpb24oKSB7XG4gICAgbG9ncy5zYXNFcnJvcnMuc3BsaWNlKDAsIGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCk7XG4gIH0sXG4gIGNsZWFyRmFpbGVkUmVxdWVzdHM6IGZ1bmN0aW9uKCkge1xuICAgIGxvZ3MuZmFpbGVkUmVxdWVzdHMuc3BsaWNlKDAsIGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoKTtcbiAgfSxcbiAgY2xlYXJBbGxMb2dzOiBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmNsZWFyQXBwbGljYXRpb25Mb2dzKCk7XG4gICAgdGhpcy5jbGVhckRlYnVnRGF0YSgpO1xuICAgIHRoaXMuY2xlYXJTYXNFcnJvcnMoKTtcbiAgICB0aGlzLmNsZWFyRmFpbGVkUmVxdWVzdHMoKTtcbiAgfVxufTtcblxuLyoqXG4qICBBZGRzIGFwcGxpY2F0aW9uIGxvZ3MgdG8gYW4gYXJyYXkgb2YgbG9nc1xuKlxuKiBAcGFyYW0ge1N0cmluZ30gbWVzc2FnZSAtIE1lc3NhZ2UgdG8gYWRkIHRvIGFwcGxpY2F0aW9uTG9nc1xuKiBAcGFyYW0ge1N0cmluZ30gc2FzUHJvZ3JhbSAtIEhlYWRlciAtIHdoaWNoIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuYWRkQXBwbGljYXRpb25Mb2cgPSBmdW5jdGlvbihtZXNzYWdlLCBzYXNQcm9ncmFtKSB7XG4gIGlmKG1lc3NhZ2UgPT09ICdibGFuaycpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY29uc3QgbG9nID0ge1xuICAgIG1lc3NhZ2U6ICAgIG1lc3NhZ2UsXG4gICAgdGltZTogICAgICAgbmV3IERhdGUoKSxcbiAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtXG4gIH07XG4gIGxvZ3MuYXBwbGljYXRpb25Mb2dzLnB1c2gobG9nKTtcblxuICBpZihsb2dzLmFwcGxpY2F0aW9uTG9ncy5sZW5ndGggPiBsaW1pdHMuYXBwbGljYXRpb25Mb2dzKSB7XG4gICAgbG9ncy5hcHBsaWNhdGlvbkxvZ3Muc2hpZnQoKTtcbiAgfVxufTtcblxuLyoqXG4qIEFkZHMgZGVidWcgZGF0YSB0byBhbiBhcnJheSBvZiBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSBodG1sRGF0YSAtIEZ1bGwgaHRtbCBsb2cgZnJvbSBleGVjdXRvclxuKiBAcGFyYW0ge1N0cmluZ30gZGVidWdUZXh0IC0gRGVidWcgdGV4dCB0aGF0IGNhbWUgYWZ0ZXIgZGF0YSBvdXRwdXRcbiogQHBhcmFtIHtTdHJpbmd9IHNhc1Byb2dyYW0gLSBXaGljaCBwcm9ncmFtIHJlcXVlc3QgZGlkIG1lc3NhZ2UgY29tZSBmcm9tXG4qIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMgLSBXZWIgYXBwIHBhcmFtcyB0aGF0IHdlcmUgcmVjZWl2ZWRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGREZWJ1Z0RhdGEgPSBmdW5jdGlvbihodG1sRGF0YSwgZGVidWdUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgbG9ncy5kZWJ1Z0RhdGEucHVzaCh7XG4gICAgZGVidWdIdG1sOiAgaHRtbERhdGEsXG4gICAgZGVidWdUZXh0OiAgZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06IHNhc1Byb2dyYW0sXG4gICAgcGFyYW1zOiAgICAgcGFyYW1zLFxuICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgaWYobG9ncy5kZWJ1Z0RhdGEubGVuZ3RoID4gbGltaXRzLmRlYnVnRGF0YSkge1xuICAgIGxvZ3MuZGVidWdEYXRhLnNoaWZ0KCk7XG4gIH1cbn07XG5cbi8qKlxuKiBBZGRzIGZhaWxlZCByZXF1ZXN0cyB0byBhbiBhcnJheSBvZiBmYWlsZWQgcmVxdWVzdCBsb2dzXG4qXG4qIEBwYXJhbSB7U3RyaW5nfSByZXNwb25zZVRleHQgLSBGdWxsIGh0bWwgb3V0cHV0IGZyb20gZXhlY3V0b3JcbiogQHBhcmFtIHtTdHJpbmd9IGRlYnVnVGV4dCAtIERlYnVnIHRleHQgdGhhdCBjYW1lIGFmdGVyIGRhdGEgb3V0cHV0XG4qIEBwYXJhbSB7U3RyaW5nfSBzYXNQcm9ncmFtIC0gV2hpY2ggcHJvZ3JhbSByZXF1ZXN0IGRpZCBtZXNzYWdlIGNvbWUgZnJvbVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZEZhaWxlZFJlcXVlc3QgPSBmdW5jdGlvbihyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBsb2dzLmZhaWxlZFJlcXVlc3RzLnB1c2goe1xuICAgIHJlc3BvbnNlSHRtbDogcmVzcG9uc2VUZXh0LFxuICAgIHJlc3BvbnNlVGV4dDogZGVidWdUZXh0LFxuICAgIHNhc1Byb2dyYW06ICAgc2FzUHJvZ3JhbSxcbiAgICB0aW1lOiAgICAgICAgIG5ldyBEYXRlKClcbiAgfSk7XG5cbiAgLy9tYXggMjAgZmFpbGVkIHJlcXVlc3RzXG4gIGlmKGxvZ3MuZmFpbGVkUmVxdWVzdHMubGVuZ3RoID4gbGltaXRzLmZhaWxlZFJlcXVlc3RzKSB7XG4gICAgbG9ncy5mYWlsZWRSZXF1ZXN0cy5zaGlmdCgpO1xuICB9XG59O1xuXG4vKipcbiogQWRkcyBTQVMgZXJyb3JzIHRvIGFuIGFycmF5IG9mIGxvZ3NcbipcbiogQHBhcmFtIHtBcnJheX0gZXJyb3JzIC0gQXJyYXkgb2YgZXJyb3JzIHRvIGNvbmNhdCB0byBtYWluIGxvZ1xuKlxuKi9cbm1vZHVsZS5leHBvcnRzLmFkZFNhc0Vycm9ycyA9IGZ1bmN0aW9uKGVycm9ycykge1xuICBsb2dzLnNhc0Vycm9ycyA9IGxvZ3Muc2FzRXJyb3JzLmNvbmNhdChlcnJvcnMpO1xuXG4gIHdoaWxlKGxvZ3Muc2FzRXJyb3JzLmxlbmd0aCA+IGxpbWl0cy5zYXNFcnJvcnMpIHtcbiAgICBsb2dzLnNhc0Vycm9ycy5zaGlmdCgpO1xuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoKSB7XG4gIGxldCB0aW1lb3V0ID0gMzAwMDA7XG4gIGxldCB0aW1lb3V0SGFuZGxlO1xuXG4gIGNvbnN0IHhociA9IGZ1bmN0aW9uICh0eXBlLCB1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzID0ge30pIHtcbiAgICBjb25zdCBtZXRob2RzID0ge1xuICAgICAgc3VjY2VzczogZnVuY3Rpb24gKCkge1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoKSB7XG4gICAgICB9XG4gICAgfTtcblxuICAgIGNvbnN0IFhIUiA9IFhNTEh0dHBSZXF1ZXN0O1xuICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgWEhSKCdNU1hNTDIuWE1MSFRUUC4zLjAnKTtcblxuICAgIHJlcXVlc3Qub3Blbih0eXBlLCB1cmwsIHRydWUpO1xuXG4gICAgLy9tdWx0aXBhcnQvZm9ybS1kYXRhIGlzIHNldCBhdXRvbWF0aWNhbGx5IHNvIG5vIG5lZWQgZm9yIGVsc2UgYmxvY2tcbiAgICAvLyBDb250ZW50LVR5cGUgaGVhZGVyIGhhcyB0byBiZSBleHBsaWNpdGx5IHNldCB1cFxuICAgIGlmICghbXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgIGlmIChoZWFkZXJzWydDb250ZW50LVR5cGUnXSkge1xuICAgICAgICByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoJ0NvbnRlbnQtVHlwZScsIGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddKVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKCdDb250ZW50LVR5cGUnLCAnYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkJyk7XG4gICAgICB9XG4gICAgfVxuICAgIE9iamVjdC5rZXlzKGhlYWRlcnMpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgIT09ICdDb250ZW50LVR5cGUnKSB7XG4gICAgICAgIHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrZXksIGhlYWRlcnNba2V5XSlcbiAgICAgIH1cbiAgICB9KVxuICAgIHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKHJlcXVlc3QucmVhZHlTdGF0ZSA9PT0gNCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dEhhbmRsZSk7XG4gICAgICAgIGlmIChyZXF1ZXN0LnN0YXR1cyA+PSAyMDAgJiYgcmVxdWVzdC5zdGF0dXMgPCAzMDApIHtcbiAgICAgICAgICBtZXRob2RzLnN1Y2Nlc3MuY2FsbChtZXRob2RzLCByZXF1ZXN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBtZXRob2RzLmVycm9yLmNhbGwobWV0aG9kcywgcmVxdWVzdCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgaWYgKHRpbWVvdXQgPiAwKSB7XG4gICAgICB0aW1lb3V0SGFuZGxlID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlcXVlc3QuYWJvcnQoKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH1cblxuICAgIHJlcXVlc3Quc2VuZChkYXRhKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdWNjZXNzOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5zdWNjZXNzID0gY2FsbGJhY2s7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfSxcbiAgICAgIGVycm9yOiBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgbWV0aG9kcy5lcnJvciA9IGNhbGxiYWNrO1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIGNvbnN0IHNlcmlhbGl6ZSA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBjb25zdCBzdHIgPSBbXTtcbiAgICBmb3IgKGxldCBwIGluIG9iaikge1xuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBpZiAob2JqW3BdIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIHN0ci5wdXNoKGVuY29kZVVSSUNvbXBvbmVudChwKSArIFwiPVwiICsgZW5jb2RlVVJJQ29tcG9uZW50KG9ialtwXVtpXSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9O1xuXG4gIGNvbnN0IGNyZWF0ZU11bHRpcGFydEZvcm1EYXRhUGF5bG9hZCA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBsZXQgZGF0YSA9IG5ldyBGb3JtRGF0YSgpO1xuICAgIGZvciAobGV0IHAgaW4gb2JqKSB7XG4gICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KHApKSB7XG4gICAgICAgIGlmIChvYmpbcF0gaW5zdGFuY2VvZiBBcnJheSAmJiBwICE9PSAnZmlsZScpIHtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMCwgbiA9IG9ialtwXS5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVtpXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHAgPT09ICdmaWxlJykge1xuICAgICAgICAgIGRhdGEuYXBwZW5kKHAsIG9ialtwXVswXSwgb2JqW3BdWzFdKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkYXRhLmFwcGVuZChwLCBvYmpbcF0pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBkYXRhO1xuICB9O1xuXG4gIHJldHVybiB7XG4gICAgZ2V0OiBmdW5jdGlvbiAodXJsLCBkYXRhLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgICAgbGV0IGRhdGFTdHI7XG4gICAgICBpZiAodHlwZW9mIGRhdGEgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGRhdGFTdHIgPSBzZXJpYWxpemUoZGF0YSk7XG4gICAgICB9XG4gICAgICBjb25zdCB1cmxXaXRoUGFyYW1zID0gZGF0YVN0ciA/ICh1cmwgKyAnPycgKyBkYXRhU3RyKSA6IHVybDtcbiAgICAgIHJldHVybiB4aHIoJ0dFVCcsIHVybFdpdGhQYXJhbXMsIG51bGwsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcbiAgICB9LFxuXHRcdHBvc3Q6IGZ1bmN0aW9uKHVybCwgZGF0YSwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpIHtcbiAgICAgIGxldCBwYXlsb2FkID0gZGF0YTtcbiAgICAgIGlmKHR5cGVvZiBkYXRhID09PSAnb2JqZWN0Jykge1xuICAgICAgICBpZihtdWx0aXBhcnRGb3JtRGF0YSkge1xuICAgICAgICAgIHBheWxvYWQgPSBjcmVhdGVNdWx0aXBhcnRGb3JtRGF0YVBheWxvYWQoZGF0YSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGF5bG9hZCA9IHNlcmlhbGl6ZShkYXRhKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIHhocignUE9TVCcsIHVybCwgcGF5bG9hZCwgbXVsdGlwYXJ0Rm9ybURhdGEsIGhlYWRlcnMpO1xuICAgIH0sXG4gICAgcHV0OiBmdW5jdGlvbih1cmwsIGRhdGEsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKSB7XG4gICAgICBsZXQgcGF5bG9hZCA9IGRhdGE7XG4gICAgICBpZih0eXBlb2YgZGF0YSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgaWYobXVsdGlwYXJ0Rm9ybURhdGEpIHtcbiAgICAgICAgICBwYXlsb2FkID0gY3JlYXRlTXVsdGlwYXJ0Rm9ybURhdGFQYXlsb2FkKGRhdGEpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4geGhyKCdQVVQnLCB1cmwsIHBheWxvYWQsIG11bHRpcGFydEZvcm1EYXRhLCBoZWFkZXJzKTtcbiAgICB9LFxuXHRcdGRlbGV0ZTogZnVuY3Rpb24odXJsLCBwYXlsb2FkLCBtdWx0aXBhcnRGb3JtRGF0YSwgaGVhZGVycykge1xuICAgIFx0cmV0dXJuIHhocignREVMRVRFJywgdXJsLCBwYXlsb2FkLCBudWxsLCBoZWFkZXJzKTtcblx0XHR9LFxuICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uICh0KSB7XG4gICAgICB0aW1lb3V0ID0gdDtcbiAgICB9LFxuICAgIHNlcmlhbGl6ZVxuICB9O1xufTtcbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yLmpzJyk7XG5jb25zdCBsb2dzID0gcmVxdWlyZSgnLi4vbG9ncy5qcycpO1xuY29uc3QgVGFibGVzID0gcmVxdWlyZSgnLi4vdGFibGVzJyk7XG5jb25zdCBTYXNEYXRhID0gcmVxdWlyZSgnLi4vc2FzRGF0YS5qcycpO1xuY29uc3QgRmlsZXMgPSByZXF1aXJlKCcuLi9maWxlcycpO1xuXG4vKipcbiogQ2FsbCBTYXMgcHJvZ3JhbVxuKlxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIFBhdGggb2YgdGhlIHNhcyBwcm9ncmFtXG4qIEBwYXJhbSB7T2JqZWN0fSBkYXRhT2JqIC0gSW5zdGFuY2Ugb2YgVGFibGVzIG9iamVjdCB3aXRoIGRhdGEgYWRkZWRcbiogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSBDYWxsYmFjayBmdW5jdGlvbiBjYWxsZWQgd2hlbiBhamF4IGNhbGwgaXMgZmluaXNoZWRcbiogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyAtIG9iamVjdCBjb250YWluaW5nIGFkZGl0aW9uYWwgcHJvZ3JhbSBwYXJhbWV0ZXJzXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuY2FsbCA9IGZ1bmN0aW9uIChzYXNQcm9ncmFtLCBkYXRhT2JqLCBjYWxsYmFjaywgcGFyYW1zKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRsZXQgcmV0cnlDb3VudCA9IDA7XG5cdGNvbnN0IGRiZyA9IHRoaXMuZGVidWdcblx0Y29uc3QgY3NyZiA9IHRoaXMuY3NyZjtcblxuXHRpZiAoIWNhbGxiYWNrIHx8IHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBhIGNhbGxiYWNrJyk7XG5cdH1cblx0aWYgKCFzYXNQcm9ncmFtKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdZb3UgbXVzdCBwcm92aWRlIFNhcyBwcm9ncmFtIGZpbGUgcGF0aCcpO1xuXHR9XG5cdGlmICh0eXBlb2Ygc2FzUHJvZ3JhbSAhPT0gJ3N0cmluZycpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgc3RyaW5nJyk7XG5cdH1cblx0aWYgKHRoaXMudXNlTXVsdGlwYXJ0Rm9ybURhdGEgPT09IGZhbHNlICYmICEoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0Nhbm5vdCBzZW5kIGZpbGVzIHVzaW5nIGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZC4gUGxlYXNlIHVzZSBUYWJsZXMgb3IgZGVmYXVsdCB2YWx1ZSBmb3IgdXNlTXVsdGlwYXJ0Rm9ybURhdGEnKTtcblx0fVxuXG5cdGlmICghcGFyYW1zKSB7XG5cdFx0cGFyYW1zID0ge1xuXHRcdFx0X3Byb2dyYW06IHRoaXMuX3V0aWxzLmdldEZ1bGxQcm9ncmFtUGF0aCh0aGlzLm1ldGFkYXRhUm9vdCwgc2FzUHJvZ3JhbSksXG5cdFx0XHRfZGVidWc6IHRoaXMuZGVidWcgPyAxMzEgOiAwLFxuXHRcdFx0X3NlcnZpY2U6ICdkZWZhdWx0Jyxcblx0XHRcdF9jc3JmOiBjc3JmXG5cdFx0fTtcblx0fSBlbHNlIHtcblx0XHRwYXJhbXMgPSBPYmplY3QuYXNzaWduKHt9LCBwYXJhbXMsIHtfY3NyZjogY3NyZn0pXG5cdH1cblxuXHRpZiAoZGF0YU9iaikge1xuXHRcdGxldCBrZXksIGRhdGFQcm92aWRlcjtcblx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0ZGF0YVByb3ZpZGVyID0gZGF0YU9iai5fdGFibGVzO1xuXHRcdH0gZWxzZSBpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIEZpbGVzIHx8IGRhdGFPYmogaW5zdGFuY2VvZiBTYXNEYXRhKSB7XG5cdFx0XHRkYXRhUHJvdmlkZXIgPSBkYXRhT2JqLl9maWxlcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc29sZS5sb2cobmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyB0eXBlIG9mIHRhYmxlcyBvYmplY3QnKSlcblx0XHR9XG5cdFx0Zm9yIChrZXkgaW4gZGF0YVByb3ZpZGVyKSB7XG5cdFx0XHRpZiAoZGF0YVByb3ZpZGVyLmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRcdFx0cGFyYW1zW2tleV0gPSBkYXRhUHJvdmlkZXJba2V5XTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAodGhpcy5fZGlzYWJsZUNhbGxzKSB7XG5cdFx0dGhpcy5fcGVuZGluZ0NhbGxzLnB1c2goe1xuXHRcdFx0cGFyYW1zLFxuXHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRzYXNQcm9ncmFtLFxuXHRcdFx0XHRkYXRhT2JqLFxuXHRcdFx0XHRjYWxsYmFja1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLnVybCwgcGFyYW1zLCB0aGlzLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKGFzeW5jIGZ1bmN0aW9uIChyZXMpIHtcblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG5cdFx0XHQvL3JlbWVtYmVyIHRoZSBjYWxsIGZvciBsYXR0ZXIgdXNlXG5cdFx0XHRzZWxmLl9wZW5kaW5nQ2FsbHMucHVzaCh7XG5cdFx0XHRcdHBhcmFtcyxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNhc1Byb2dyYW0sXG5cdFx0XHRcdFx0ZGF0YU9iaixcblx0XHRcdFx0XHRjYWxsYmFja1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly90aGVyZSdzIG5vIG5lZWQgdG8gY29udGludWUgaWYgcHJldmlvdXMgY2FsbCByZXR1cm5lZCBsb2dpbiBlcnJvclxuXHRcdFx0aWYgKHNlbGYuX2Rpc2FibGVDYWxscykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHJlc09iaiwgdW5lc2NhcGVkUmVzT2JqLCBlcnI7XG5cdFx0XHRsZXQgZG9uZSA9IGZhbHNlO1xuXG5cdFx0XHRpZiAoIWRiZykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJlc09iaiA9IHNlbGYuX3V0aWxzLnBhcnNlUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcyk7XG5cdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cblx0XHRcdFx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuXHRcdFx0XHRcdFx0aWYgKHJldHJ5Q291bnQgPCBzZWxmLm1heFhoclJldHJpZXMpIHtcblx0XHRcdFx0XHRcdFx0ZG9uZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgc2VsZi51c2VNdWx0aXBhcnRGb3JtRGF0YSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuXHRcdFx0XHRcdFx0XHRyZXRyeUNvdW50Kys7XG5cdFx0XHRcdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0XHRcdFx0XHRcdFx0ZG9uZSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChlIGluc3RhbmNlb2YgaDU0c0Vycm9yKSB7XG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5wYXJzZUVycm9yUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRzZWxmLl91dGlscy5hZGRGYWlsZWRSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0XHRcdGVyciA9IGU7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMucGFyc2VFcnJvclJlc3BvbnNlKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdFx0XHRlcnIgPSBuZXcgaDU0c0Vycm9yKCd1bmtub3duRXJyb3InLCBlLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0ZXJyLnN0YWNrID0gZS5zdGFjaztcblx0XHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2soZXJyLCB1bmVzY2FwZWRSZXNPYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRyZXNPYmogPSBhd2FpdCBzZWxmLl91dGlscy5wYXJzZURlYnVnUmVzKHJlcy5yZXNwb25zZVRleHQsIHNhc1Byb2dyYW0sIHBhcmFtcywgc2VsZi5ob3N0VXJsLCBzZWxmLmlzVml5YSk7XG5cdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhyZXNPYmoubG9nbWVzc2FnZSwgc2FzUHJvZ3JhbSk7XG5cblx0XHRcdFx0XHRpZiAoZGF0YU9iaiBpbnN0YW5jZW9mIFRhYmxlcykge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gc2VsZi5fdXRpbHMudW5lc2NhcGVWYWx1ZXMocmVzT2JqKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dW5lc2NhcGVkUmVzT2JqID0gcmVzT2JqO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChyZXNPYmouc3RhdHVzICE9PSAnc3VjY2VzcycpIHtcblx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1FcnJvcicsIHJlc09iai5lcnJvcm1lc3NhZ2UsIHJlc09iai5zdGF0dXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigncGFyc2VFcnJvcicsIGUubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdGlmIChlLnR5cGUgPT09ICdwYXJzZUVycm9yJyAmJiByZXRyeUNvdW50IDwgMSkge1xuXHRcdFx0XHRcdFx0XHRkb25lID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdHNlbGYuX2FqYXgucG9zdChzZWxmLnVybCwgcGFyYW1zLCBzZWxmLnVzZU11bHRpcGFydEZvcm1EYXRhKS5zdWNjZXNzKHRoaXMuc3VjY2VzcykuZXJyb3IodGhpcy5lcnJvcik7XG5cdFx0XHRcdFx0XHRcdHJldHJ5Q291bnQrKztcblx0XHRcdFx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZyhcIlJldHJ5aW5nICNcIiArIHJldHJ5Q291bnQsIHNhc1Byb2dyYW0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBoNTRzRXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0XHRlcnIgPSBlO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZXJyID0gbmV3IGg1NHNFcnJvcigndW5rbm93bkVycm9yJywgZS5tZXNzYWdlKTtcblx0XHRcdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XG5cdFx0XHRcdFx0XHRkb25lID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0aWYgKGRvbmUpIHtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgdW5lc2NhcGVkUmVzT2JqKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRsZXQgX2NzcmZcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkgfHwgKHJlcy5zdGF0dXMgPT0gNDAzICYmIChyZXMucmVzcG9uc2VUZXh0LmluY2x1ZGVzKCdfY3NyZicpIHx8IHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1Gb3JiaWRkZW4tUmVhc29uJykgPT09ICdDU1JGJykgJiYgKF9jc3JmID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKHJlcy5nZXRSZXNwb25zZUhlYWRlcignWC1DU1JGLUhFQURFUicpKSkpKSB7XG5cdFx0XHRwYXJhbXNbJ19jc3JmJ10gPSBfY3NyZjtcblx0XHRcdHNlbGYuY3NyZiA9IF9jc3JmXG5cdFx0XHRpZiAocmV0cnlDb3VudCA8IHNlbGYubWF4WGhyUmV0cmllcykge1xuXHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi51cmwsIHBhcmFtcywgdHJ1ZSkuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuXHRcdFx0XHRyZXRyeUNvdW50Kys7XG5cdFx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coXCJSZXRyeWluZyAjXCIgKyByZXRyeUNvdW50LCBzYXNQcm9ncmFtKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlbGYuX3V0aWxzLnBhcnNlRXJyb3JSZXNwb25zZShyZXMucmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKTtcblx0XHRcdFx0c2VsZi5fdXRpbHMuYWRkRmFpbGVkUmVzcG9uc2UocmVzLnJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSk7XG5cdFx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ1JlcXVlc3QgZmFpbGVkIHdpdGggc3RhdHVzOiAnICsgcmVzLnN0YXR1cywgc2FzUHJvZ3JhbSk7XG5cdFx0XHQvLyBpZiByZXF1ZXN0IGhhcyBlcnJvciB0ZXh0IGVsc2UgY2FsbGJhY2tcblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5zdGF0dXNUZXh0KSk7XG5cdFx0fVxuXHR9KTtcbn07XG5cbi8qKlxuKiBMb2dpbiBtZXRob2RcbipcbiogQHBhcmFtIHtzdHJpbmd9IHVzZXIgLSBMb2dpbiB1c2VybmFtZVxuKiBAcGFyYW0ge3N0cmluZ30gcGFzcyAtIExvZ2luIHBhc3N3b3JkXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qIE9SXG4qXG4qIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gQ2FsbGJhY2sgZnVuY3Rpb24gY2FsbGVkIHdoZW4gYWpheCBjYWxsIGlzIGZpbmlzaGVkXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMubG9naW4gPSBmdW5jdGlvbiAodXNlciwgcGFzcywgY2FsbGJhY2spIHtcblx0aWYgKCF1c2VyIHx8ICFwYXNzKSB7XG5cdFx0dGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDcmVkZW50aWFscyBub3Qgc2V0Jyk7XG5cdH1cblx0aWYgKHR5cGVvZiB1c2VyICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFzcyAhPT0gJ3N0cmluZycpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1VzZXIgYW5kIHBhc3MgcGFyYW1ldGVycyBtdXN0IGJlIHN0cmluZ3MnKTtcblx0fVxuXHQvL05PVEU6IGNhbGxiYWNrIG9wdGlvbmFsP1xuXHRpZiAoIWNhbGxiYWNrIHx8IHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJykge1xuXHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnWW91IG11c3QgcHJvdmlkZSBjYWxsYmFjaycpO1xuXHR9XG5cblx0aWYgKCF0aGlzLlJFU1RhdXRoKSB7XG5cdFx0aGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCBjYWxsYmFjayk7XG5cdH0gZWxzZSB7XG5cdFx0aGFuZGxlUmVzdExvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgY2FsbGJhY2spO1xuXHR9XG59O1xuXG4vKipcbiogTWFuYWdlZFJlcXVlc3QgbWV0aG9kXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBjYWxsTWV0aG9kIC0gZ2V0LCBwb3N0LFxuKiBAcGFyYW0ge3N0cmluZ30gX3VybCAtIFVSTCB0byBtYWtlIHJlcXVlc3QgdG9cbiogQHBhcmFtIHtvYmplY3R9IG9wdGlvbnMgLSBjYWxsYmFjayBmdW5jdGlvbiBhcyBjYWxsYmFjayBwYXJhbXRlciBpbiBvcHRpb25zIG9iamVjdCBpcyByZXF1aXJlZFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLm1hbmFnZWRSZXF1ZXN0ID0gZnVuY3Rpb24gKGNhbGxNZXRob2QgPSAnZ2V0JywgX3VybCwgb3B0aW9ucyA9IHtcblx0Y2FsbGJhY2s6ICgpID0+IGNvbnNvbGUubG9nKCdNaXNzaW5nIGNhbGxiYWNrIGZ1bmN0aW9uJylcbn0pIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdGNvbnN0IGNzcmYgPSB0aGlzLmNzcmY7XG5cdGxldCByZXRyeUNvdW50ID0gMDtcblx0Y29uc3Qge3VzZU11bHRpcGFydEZvcm1EYXRhLCBzYXNQcm9ncmFtLCBkYXRhT2JqLCBwYXJhbXMsIGNhbGxiYWNrLCBoZWFkZXJzfSA9IG9wdGlvbnNcblxuXHRpZiAoc2FzUHJvZ3JhbSkge1xuXHRcdHJldHVybiBzZWxmLmNhbGwoc2FzUHJvZ3JhbSwgZGF0YU9iaiwgY2FsbGJhY2ssIHBhcmFtcylcblx0fVxuXG5cdGxldCB1cmwgPSBfdXJsXG5cdGlmICghX3VybC5zdGFydHNXaXRoKCdodHRwJykpIHtcblx0XHR1cmwgPSBzZWxmLmhvc3RVcmwgKyBfdXJsXG5cdH1cblxuXHRjb25zdCBfaGVhZGVycyA9IE9iamVjdC5hc3NpZ24oe30sIGhlYWRlcnMsIHtcblx0XHQnWC1DU1JGLVRPS0VOJzogY3NyZlxuXHR9KVxuXHRjb25zdCBfb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRoZWFkZXJzOiBfaGVhZGVyc1xuXHR9KVxuXG5cdGlmICh0aGlzLl9kaXNhYmxlQ2FsbHMpIHtcblx0XHR0aGlzLl9jdXN0b21QZW5kaW5nQ2FsbHMucHVzaCh7XG5cdFx0XHRjYWxsTWV0aG9kLFxuXHRcdFx0X3VybCxcblx0XHRcdG9wdGlvbnM6IF9vcHRpb25zXG5cdFx0fSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0c2VsZi5fYWpheFtjYWxsTWV0aG9kXSh1cmwsIHBhcmFtcywgdXNlTXVsdGlwYXJ0Rm9ybURhdGEsIF9oZWFkZXJzKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG5cdFx0XHQvL3JlbWVtYmVyIHRoZSBjYWxsIGZvciBsYXR0ZXIgdXNlXG5cdFx0XHRzZWxmLl9jdXN0b21QZW5kaW5nQ2FsbHMucHVzaCh7XG5cdFx0XHRcdGNhbGxNZXRob2QsXG5cdFx0XHRcdF91cmwsXG5cdFx0XHRcdG9wdGlvbnM6IF9vcHRpb25zXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly90aGVyZSdzIG5vIG5lZWQgdG8gY29udGludWUgaWYgcHJldmlvdXMgY2FsbCByZXR1cm5lZCBsb2dpbiBlcnJvclxuXHRcdFx0aWYgKHNlbGYuX2Rpc2FibGVDYWxscykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZWxmLl9kaXNhYmxlQ2FsbHMgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdub3RMb2dnZWRpbkVycm9yJywgJ1lvdSBhcmUgbm90IGxvZ2dlZCBpbicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHJlc09iaiwgZXJyO1xuXHRcdFx0bGV0IGRvbmUgPSBmYWxzZTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYXJyID0gcmVzLmdldEFsbFJlc3BvbnNlSGVhZGVycygpLnNwbGl0KCdcXHJcXG4nKTtcblx0XHRcdFx0Y29uc3QgcmVzSGVhZGVycyA9IGFyci5yZWR1Y2UoZnVuY3Rpb24gKGFjYywgY3VycmVudCwgaSkge1xuXHRcdFx0XHRcdGxldCBwYXJ0cyA9IGN1cnJlbnQuc3BsaXQoJzogJyk7XG5cdFx0XHRcdFx0YWNjW3BhcnRzWzBdXSA9IHBhcnRzWzFdO1xuXHRcdFx0XHRcdHJldHVybiBhY2M7XG5cdFx0XHRcdH0sIHt9KTtcblx0XHRcdFx0bGV0IGJvZHkgPSByZXMucmVzcG9uc2VUZXh0XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ym9keSA9IEpTT04ucGFyc2UoYm9keSlcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdGNvbnNvbGUubG9nKCdyZXNwb25zZSBpcyBub3QgSlNPTiBzdHJpbmcnKVxuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHJlc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIHtcblx0XHRcdFx0XHRcdGhlYWRlcnM6IHJlc0hlYWRlcnMsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IHJlcy5zdGF0dXMsXG5cdFx0XHRcdFx0XHRzdGF0dXNUZXh0OiByZXMuc3RhdHVzVGV4dCxcblx0XHRcdFx0XHRcdGJvZHlcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdGRvbmUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGVyciA9IG5ldyBoNTRzRXJyb3IoJ3Vua25vd25FcnJvcicsIGUubWVzc2FnZSk7XG5cdFx0XHRcdGVyci5zdGFjayA9IGUuc3RhY2s7XG5cdFx0XHRcdGRvbmUgPSB0cnVlO1xuXG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRpZiAoZG9uZSkge1xuXHRcdFx0XHRcdGNhbGxiYWNrKGVyciwgcmVzT2JqKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0bGV0IF9jc3JmXG5cdFx0aWYgKHJlcy5zdGF0dXMgPT0gNDQ5IHx8IChyZXMuc3RhdHVzID09IDQwMyAmJiAocmVzLnJlc3BvbnNlVGV4dC5pbmNsdWRlcygnX2NzcmYnKSB8fCByZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtRm9yYmlkZGVuLVJlYXNvbicpID09PSAnQ1NSRicpICYmIChfY3NyZiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcihyZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtQ1NSRi1IRUFERVInKSkpKSkge1xuXHRcdFx0c2VsZi5jc3JmID0gX2NzcmZcblx0XHRcdGNvbnN0IF9oZWFkZXJzID0gT2JqZWN0LmFzc2lnbih7fSwgaGVhZGVycywge1tyZXMuZ2V0UmVzcG9uc2VIZWFkZXIoJ1gtQ1NSRi1IRUFERVInKV06IF9jc3JmfSlcblx0XHRcdGlmIChyZXRyeUNvdW50IDwgc2VsZi5tYXhYaHJSZXRyaWVzKSB7XG5cdFx0XHRcdHNlbGYuX2FqYXhbY2FsbE1ldGhvZF0odXJsLCBwYXJhbXMsIHVzZU11bHRpcGFydEZvcm1EYXRhLCBfaGVhZGVycykuc3VjY2Vzcyh0aGlzLnN1Y2Nlc3MpLmVycm9yKHRoaXMuZXJyb3IpO1xuXHRcdFx0XHRyZXRyeUNvdW50Kys7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjYWxsYmFjayhuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJykpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdNYW5hZ2VkIHJlcXVlc3QgZmFpbGVkIHdpdGggc3RhdHVzOiAnICsgcmVzLnN0YXR1cywgX3VybCk7XG5cdFx0XHQvLyBpZiByZXF1ZXN0IGhhcyBlcnJvciB0ZXh0IGVsc2UgY2FsbGJhY2tcblx0XHRcdGNhbGxiYWNrKG5ldyBoNTRzRXJyb3IoJ2h0dHBFcnJvcicsIHJlcy5yZXNwb25zZVRleHQsIHJlcy5zdGF0dXMpKTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiAqIExvZyBvbiB0byBTQVMgaWYgd2UgYXJlIGFza2VkIHRvXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lIG9mIHVzZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmQgb2YgdXNlclxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sgLSB3aGF0IHRvIGRvIGFmdGVyXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZVNhc0xvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXG5cdGNvbnN0IGxvZ2luUGFyYW1zID0ge1xuXHRcdF9zZXJ2aWNlOiAnZGVmYXVsdCcsXG5cdFx0Ly9mb3IgU0FTIDkuNCxcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdGZvciAobGV0IGtleSBpbiB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtcykge1xuXHRcdGxvZ2luUGFyYW1zW2tleV0gPSB0aGlzLl9hZGl0aW9uYWxMb2dpblBhcmFtc1trZXldO1xuXHR9XG5cblx0dGhpcy5fbG9naW5BdHRlbXB0cyA9IDA7XG5cblx0dGhpcy5fYWpheC5wb3N0KHRoaXMubG9naW5VcmwsIGxvZ2luUGFyYW1zKVxuXHRcdC5zdWNjZXNzKGhhbmRsZVNhc0xvZ29uU3VjY2Vzcylcblx0XHQuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25FcnJvcihyZXMpIHtcblx0XHRpZiAocmVzLnN0YXR1cyA9PSA0NDkpIHtcblx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcyhyZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdH1cblxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvblN1Y2Nlc3MocmVzKSB7XG5cdFx0aWYgKCsrc2VsZi5fbG9naW5BdHRlbXB0cyA9PT0gMykge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKC0yKTtcblx0XHR9XG5cdFx0aWYgKHNlbGYuX3V0aWxzLm5lZWRUb0xvZ2luLmNhbGwoc2VsZiwgcmVzKSkge1xuXHRcdFx0Ly93ZSBhcmUgZ2V0dGluZyBmb3JtIGFnYWluIGFmdGVyIHJlZGlyZWN0XG5cdFx0XHQvL2FuZCBuZWVkIHRvIGxvZ2luIGFnYWluIHVzaW5nIHRoZSBuZXcgdXJsXG5cdFx0XHQvL19sb2dpbkNoYW5nZWQgaXMgc2V0IGluIG5lZWRUb0xvZ2luIGZ1bmN0aW9uXG5cdFx0XHQvL2J1dCBpZiBsb2dpbiB1cmwgaXMgbm90IGRpZmZlcmVudCwgd2UgYXJlIGNoZWNraW5nIGlmIHRoZXJlIGFyZSBhZGl0aW9uYWwgcGFyYW1ldGVyc1xuXHRcdFx0aWYgKHNlbGYuX2xvZ2luQ2hhbmdlZCB8fCAoc2VsZi5faXNOZXdMb2dpblBhZ2UgJiYgIXNlbGYuX2FkaXRpb25hbExvZ2luUGFyYW1zKSkge1xuXHRcdFx0XHRkZWxldGUgc2VsZi5fbG9naW5DaGFuZ2VkO1xuXHRcdFx0XHRjb25zdCBpbnB1dHMgPSByZXMucmVzcG9uc2VUZXh0Lm1hdGNoKC88aW5wdXQuKlwiaGlkZGVuXCJbXj5dKj4vZyk7XG5cdFx0XHRcdGlmIChpbnB1dHMpIHtcblx0XHRcdFx0XHRpbnB1dHMuZm9yRWFjaChmdW5jdGlvbiAoaW5wdXRTdHIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlTWF0Y2ggPSBpbnB1dFN0ci5tYXRjaCgvbmFtZT1cIihbXlwiXSopXCJcXHN2YWx1ZT1cIihbXlwiXSopLyk7XG5cdFx0XHRcdFx0XHRsb2dpblBhcmFtc1t2YWx1ZU1hdGNoWzFdXSA9IHZhbHVlTWF0Y2hbMl07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c2VsZi5fYWpheC5wb3N0KHNlbGYubG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0XHQvL3dlIG5lZWQgdGhpcyBnZXQgcmVxdWVzdCBiZWNhdXNlIG9mIHRoZSBzYXMgOS40IHNlY3VyaXR5IGNoZWNrc1xuXHRcdFx0XHRcdHNlbGYuX2FqYXguZ2V0KHNlbGYudXJsKS5zdWNjZXNzKGhhbmRsZVNhc0xvZ29uU3VjY2VzcykuZXJyb3IoaGFuZGxlU2FzTG9nb25FcnJvcik7XG5cdFx0XHRcdH0pLmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vZ2V0dGluZyBmb3JtIGFnYWluLCBidXQgaXQgd2Fzbid0IGEgcmVkaXJlY3Rcblx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcblx0XHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0XHR3aGlsZSAoc2VsZi5fcGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9wZW5kaW5nQ2FsbHMuc2hpZnQoKTtcblx0XHRcdFx0Y29uc3QgbWV0aG9kID0gcGVuZGluZ0NhbGwubWV0aG9kIHx8IHNlbGYuY2FsbC5iaW5kKHNlbGYpO1xuXHRcdFx0XHRjb25zdCBzYXNQcm9ncmFtID0gcGVuZGluZ0NhbGwub3B0aW9ucy5zYXNQcm9ncmFtO1xuXHRcdFx0XHRjb25zdCBjYWxsYmFja1BlbmRpbmcgPSBwZW5kaW5nQ2FsbC5vcHRpb25zLmNhbGxiYWNrO1xuXHRcdFx0XHRjb25zdCBwYXJhbXMgPSBwZW5kaW5nQ2FsbC5wYXJhbXM7XG5cdFx0XHRcdC8vdXBkYXRlIGRlYnVnIGJlY2F1c2UgaXQgbWF5IGNoYW5nZSBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdFx0cGFyYW1zLl9kZWJ1ZyA9IHNlbGYuZGVidWcgPyAxMzEgOiAwO1xuXHRcdFx0XHRpZiAoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcblx0XHRcdFx0XHRtZXRob2Qoc2FzUHJvZ3JhbSwgbnVsbCwgY2FsbGJhY2tQZW5kaW5nLCBwYXJhbXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4vKipcbiAqIFJFU1QgbG9nb24gZm9yIDkuNCB2MSB0aWNrZXQgYmFzZWQgYXV0aFxuICogQHBhcmFtIHtTdHJpbmd9IHVzZXIgLVxuICogQHBhcmFtIHtTdHJpbmd9IHBhc3NcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrXG4gKi9cbmZ1bmN0aW9uIGhhbmRsZVJlc3RMb2dvbih1c2VyLCBwYXNzLCBjYWxsYmFjaykge1xuXHRjb25zdCBzZWxmID0gdGhpcztcblxuXHRjb25zdCBsb2dpblBhcmFtcyA9IHtcblx0XHR1c2VybmFtZTogdXNlcixcblx0XHRwYXNzd29yZDogcGFzc1xuXHR9O1xuXG5cdHRoaXMuX2FqYXgucG9zdCh0aGlzLlJFU1RhdXRoTG9naW5VcmwsIGxvZ2luUGFyYW1zKS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHJlcy5nZXRSZXNwb25zZUhlYWRlcignTG9jYXRpb24nKTtcblxuXHRcdHNlbGYuX2FqYXgucG9zdChsb2NhdGlvbiwge1xuXHRcdFx0c2VydmljZTogc2VsZi51cmxcblx0XHR9KS5zdWNjZXNzKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRcdGlmIChzZWxmLnVybC5pbmRleE9mKCc/JykgPT09IC0xKSB7XG5cdFx0XHRcdHNlbGYudXJsICs9ICc/dGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHNlbGYudXJsLmluZGV4T2YoJ3RpY2tldCcpICE9PSAtMSkge1xuXHRcdFx0XHRcdHNlbGYudXJsID0gc2VsZi51cmwucmVwbGFjZSgvdGlja2V0PVteJl0rLywgJ3RpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2VsZi51cmwgKz0gJyZ0aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fSkuZXJyb3IoZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH0pO1xuXHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0aWYgKHJlcy5yZXNwb25zZVRleHQgPT09ICdlcnJvci5hdXRoZW50aWNhdGlvbi5jcmVkZW50aWFscy5iYWQnKSB7XG5cdFx0XHRjYWxsYmFjaygtMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ0xvZ2luIGZhaWxlZCB3aXRoIHN0YXR1cyBjb2RlOiAnICsgcmVzLnN0YXR1cyk7XG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9XG5cdH0pO1xufVxuXG4vKipcbiogTG9nb3V0IG1ldGhvZFxuKlxuKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIENhbGxiYWNrIGZ1bmN0aW9uIGNhbGxlZCB3aGVuIGxvZ291dCBpcyBkb25lXG4qXG4qL1xuXG5tb2R1bGUuZXhwb3J0cy5sb2dvdXQgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcblx0Y29uc3QgYmFzZVVybCA9IHRoaXMuaG9zdFVybCB8fCAnJztcblx0Y29uc3QgdXJsID0gYmFzZVVybCArIHRoaXMubG9nb3V0VXJsO1xuXG5cdHRoaXMuX2FqYXguZ2V0KHVybCkuc3VjY2VzcyhmdW5jdGlvbiAocmVzKSB7XG5cdFx0dGhpcy5fZGlzYWJsZUNhbGxzID0gdHJ1ZVxuXHRcdGNhbGxiYWNrKCk7XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dvdXQgZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0fSk7XG59O1xuXG4vKlxuKiBFbnRlciBkZWJ1ZyBtb2RlXG4qXG4qL1xubW9kdWxlLmV4cG9ydHMuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLmRlYnVnID0gdHJ1ZTtcbn07XG5cbi8qXG4qIEV4aXQgZGVidWcgbW9kZSBhbmQgY2xlYXIgbG9nc1xuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnVuc2V0RGVidWdNb2RlID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLmRlYnVnID0gZmFsc2U7XG59O1xuXG5mb3IgKGxldCBrZXkgaW4gbG9ncy5nZXQpIHtcblx0aWYgKGxvZ3MuZ2V0Lmhhc093blByb3BlcnR5KGtleSkpIHtcblx0XHRtb2R1bGUuZXhwb3J0c1trZXldID0gbG9ncy5nZXRba2V5XTtcblx0fVxufVxuXG5mb3IgKGxldCBrZXkgaW4gbG9ncy5jbGVhcikge1xuXHRpZiAobG9ncy5jbGVhci5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0bW9kdWxlLmV4cG9ydHNba2V5XSA9IGxvZ3MuY2xlYXJba2V5XTtcblx0fVxufVxuXG4vKlxuKiBBZGQgY2FsbGJhY2sgZnVuY3Rpb25zIGV4ZWN1dGVkIHdoZW4gcHJvcGVydGllcyBhcmUgdXBkYXRlZCB3aXRoIHJlbW90ZSBjb25maWdcbipcbipAY2FsbGJhY2sgLSBjYWxsYmFjayBwdXNoZWQgdG8gYXJyYXlcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5vblJlbW90ZUNvbmZpZ1VwZGF0ZSA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXHR0aGlzLnJlbW90ZUNvbmZpZ1VwZGF0ZUNhbGxiYWNrcy5wdXNoKGNhbGxiYWNrKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzLl91dGlscyA9IHJlcXVpcmUoJy4vdXRpbHMuanMnKTtcblxuLyoqXG4gKiBMb2dpbiBjYWxsIHdoaWNoIHJldHVybnMgYSBwcm9taXNlXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkXG4gKi9cbm1vZHVsZS5leHBvcnRzLnByb21pc2VMb2dpbiA9IGZ1bmN0aW9uICh1c2VyLCBwYXNzKSB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0aWYgKCF1c2VyIHx8ICFwYXNzKSB7XG5cdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdDcmVkZW50aWFscyBub3Qgc2V0JykpXG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgdXNlciAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHBhc3MgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdVc2VyIGFuZCBwYXNzIHBhcmFtZXRlcnMgbXVzdCBiZSBzdHJpbmdzJykpXG5cdFx0fVxuXHRcdGlmICghdGhpcy5SRVNUYXV0aCkge1xuXHRcdFx0Y3VzdG9tSGFuZGxlU2FzTG9nb24uY2FsbCh0aGlzLCB1c2VyLCBwYXNzLCByZXNvbHZlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y3VzdG9tSGFuZGxlUmVzdExvZ29uLmNhbGwodGhpcywgdXNlciwgcGFzcywgcmVzb2x2ZSk7XG5cdFx0fVxuXHR9KVxufVxuXG4vKipcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gdXNlciAtIFVzZXJuYW1lXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFzcyAtIFBhc3N3b3JkXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjYWxsYmFjayAtIGZ1bmN0aW9uIHRvIGNhbGwgd2hlbiBzdWNjZXNzZnVsXG4gKi9cbmZ1bmN0aW9uIGN1c3RvbUhhbmRsZVNhc0xvZ29uKHVzZXIsIHBhc3MsIGNhbGxiYWNrKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXHRsZXQgbG9naW5QYXJhbXMgPSB7XG5cdFx0X3NlcnZpY2U6ICdkZWZhdWx0Jyxcblx0XHQvL2ZvciBTQVMgOS40LFxuXHRcdHVzZXJuYW1lOiB1c2VyLFxuXHRcdHBhc3N3b3JkOiBwYXNzXG5cdH07XG5cblx0Zm9yIChsZXQga2V5IGluIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zKSB7XG5cdFx0bG9naW5QYXJhbXNba2V5XSA9IHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zW2tleV07XG5cdH1cblxuXHR0aGlzLl9sb2dpbkF0dGVtcHRzID0gMDtcblx0bG9naW5QYXJhbXMgPSB0aGlzLl9hamF4LnNlcmlhbGl6ZShsb2dpblBhcmFtcylcblxuXHR0aGlzLl9hamF4LnBvc3QodGhpcy5sb2dpblVybCwgbG9naW5QYXJhbXMpXG5cdFx0LnN1Y2Nlc3MoaGFuZGxlU2FzTG9nb25TdWNjZXNzKVxuXHRcdC5lcnJvcihoYW5kbGVTYXNMb2dvbkVycm9yKTtcblxuXHRmdW5jdGlvbiBoYW5kbGVTYXNMb2dvbkVycm9yKHJlcykge1xuXHRcdGlmIChyZXMuc3RhdHVzID09IDQ0OSkge1xuXHRcdFx0aGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcyk7XG5cdFx0XHQvLyByZXNvbHZlKHJlcy5zdGF0dXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gaGFuZGxlU2FzTG9nb25TdWNjZXNzKHJlcykge1xuXHRcdGlmICgrK3NlbGYuX2xvZ2luQXR0ZW1wdHMgPT09IDMpIHtcblx0XHRcdGNhbGxiYWNrKC0yKTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZi5fdXRpbHMubmVlZFRvTG9naW4uY2FsbChzZWxmLCByZXMpKSB7XG5cdFx0XHQvL3dlIGFyZSBnZXR0aW5nIGZvcm0gYWdhaW4gYWZ0ZXIgcmVkaXJlY3Rcblx0XHRcdC8vYW5kIG5lZWQgdG8gbG9naW4gYWdhaW4gdXNpbmcgdGhlIG5ldyB1cmxcblx0XHRcdC8vX2xvZ2luQ2hhbmdlZCBpcyBzZXQgaW4gbmVlZFRvTG9naW4gZnVuY3Rpb25cblx0XHRcdC8vYnV0IGlmIGxvZ2luIHVybCBpcyBub3QgZGlmZmVyZW50LCB3ZSBhcmUgY2hlY2tpbmcgaWYgdGhlcmUgYXJlIGFkaXRpb25hbCBwYXJhbWV0ZXJzXG5cdFx0XHRpZiAoc2VsZi5fbG9naW5DaGFuZ2VkIHx8IChzZWxmLl9pc05ld0xvZ2luUGFnZSAmJiAhc2VsZi5fYWRpdGlvbmFsTG9naW5QYXJhbXMpKSB7XG5cdFx0XHRcdGRlbGV0ZSBzZWxmLl9sb2dpbkNoYW5nZWQ7XG5cdFx0XHRcdGNvbnN0IGlucHV0cyA9IHJlcy5yZXNwb25zZVRleHQubWF0Y2goLzxpbnB1dC4qXCJoaWRkZW5cIltePl0qPi9nKTtcblx0XHRcdFx0aWYgKGlucHV0cykge1xuXHRcdFx0XHRcdGlucHV0cy5mb3JFYWNoKGZ1bmN0aW9uIChpbnB1dFN0cikge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWVNYXRjaCA9IGlucHV0U3RyLm1hdGNoKC9uYW1lPVwiKFteXCJdKilcIlxcc3ZhbHVlPVwiKFteXCJdKikvKTtcblx0XHRcdFx0XHRcdGxvZ2luUGFyYW1zW3ZhbHVlTWF0Y2hbMV1dID0gdmFsdWVNYXRjaFsyXTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxmLl9hamF4LnBvc3Qoc2VsZi5sb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRcdGhhbmRsZVNhc0xvZ29uU3VjY2VzcygpXG5cdFx0XHRcdH0pLmVycm9yKGhhbmRsZVNhc0xvZ29uRXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdC8vZ2V0dGluZyBmb3JtIGFnYWluLCBidXQgaXQgd2Fzbid0IGEgcmVkaXJlY3Rcblx0XHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnV3JvbmcgdXNlcm5hbWUgb3IgcGFzc3dvcmQnKTtcblx0XHRcdFx0Y2FsbGJhY2soLTEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdHNlbGYuX2Rpc2FibGVDYWxscyA9IGZhbHNlO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0XHR3aGlsZSAoc2VsZi5fY3VzdG9tUGVuZGluZ0NhbGxzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgcGVuZGluZ0NhbGwgPSBzZWxmLl9jdXN0b21QZW5kaW5nQ2FsbHMuc2hpZnQoKVxuXHRcdFx0XHRjb25zdCBtZXRob2QgPSBwZW5kaW5nQ2FsbC5tZXRob2QgfHwgc2VsZi5tYW5hZ2VkUmVxdWVzdC5iaW5kKHNlbGYpO1xuXHRcdFx0XHRjb25zdCBjYWxsTWV0aG9kID0gcGVuZGluZ0NhbGwuY2FsbE1ldGhvZFxuXHRcdFx0XHRjb25zdCBfdXJsID0gcGVuZGluZ0NhbGwuX3VybFxuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gcGVuZGluZ0NhbGwub3B0aW9ucztcblx0XHRcdFx0Ly91cGRhdGUgZGVidWcgYmVjYXVzZSBpdCBtYXkgY2hhbmdlIGluIHRoZSBtZWFudGltZVxuXHRcdFx0XHRpZiAob3B0aW9ucy5wYXJhbXMpIHtcblx0XHRcdFx0XHRvcHRpb25zLnBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VsZi5yZXRyeUFmdGVyTG9naW4pIHtcblx0XHRcdFx0XHRtZXRob2QoY2FsbE1ldGhvZCwgX3VybCwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0d2hpbGUgKHNlbGYuX3BlbmRpbmdDYWxscy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDYWxsID0gc2VsZi5fcGVuZGluZ0NhbGxzLnNoaWZ0KCk7XG5cdFx0XHRcdGNvbnN0IG1ldGhvZCA9IHBlbmRpbmdDYWxsLm1ldGhvZCB8fCBzZWxmLmNhbGwuYmluZChzZWxmKTtcblx0XHRcdFx0Y29uc3Qgc2FzUHJvZ3JhbSA9IHBlbmRpbmdDYWxsLm9wdGlvbnMuc2FzUHJvZ3JhbTtcblx0XHRcdFx0Y29uc3QgY2FsbGJhY2tQZW5kaW5nID0gcGVuZGluZ0NhbGwub3B0aW9ucy5jYWxsYmFjaztcblx0XHRcdFx0Y29uc3QgcGFyYW1zID0gcGVuZGluZ0NhbGwucGFyYW1zO1xuXHRcdFx0XHQvL3VwZGF0ZSBkZWJ1ZyBiZWNhdXNlIGl0IG1heSBjaGFuZ2UgaW4gdGhlIG1lYW50aW1lXG5cdFx0XHRcdHBhcmFtcy5fZGVidWcgPSBzZWxmLmRlYnVnID8gMTMxIDogMDtcblx0XHRcdFx0aWYgKHNlbGYucmV0cnlBZnRlckxvZ2luKSB7XG5cdFx0XHRcdFx0bWV0aG9kKHNhc1Byb2dyYW0sIG51bGwsIGNhbGxiYWNrUGVuZGluZywgcGFyYW1zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcbn1cblxuLyoqXG4gKiBUbyBiZSB1c2VkIHdpdGggZnV0dXJlIG1hbmFnZWQgbWV0YWRhdGEgY2FsbHNcbiAqIEBwYXJhbSB7U3RyaW5nfSB1c2VyIC0gVXNlcm5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBwYXNzIC0gUGFzc3dvcmRcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrIC0gd2hhdCB0byBjYWxsIGFmdGVyXG4gKiBAcGFyYW0ge1N0cmluZ30gY2FsbGJhY2tVcmwgLSB3aGVyZSB0byBuYXZpZ2F0ZSBhZnRlciBnZXR0aW5nIHRpY2tldFxuICovXG5mdW5jdGlvbiBjdXN0b21IYW5kbGVSZXN0TG9nb24odXNlciwgcGFzcywgY2FsbGJhY2ssIGNhbGxiYWNrVXJsKSB7XG5cdGNvbnN0IHNlbGYgPSB0aGlzO1xuXG5cdGNvbnN0IGxvZ2luUGFyYW1zID0ge1xuXHRcdHVzZXJuYW1lOiB1c2VyLFxuXHRcdHBhc3N3b3JkOiBwYXNzXG5cdH07XG5cblx0dGhpcy5fYWpheC5wb3N0KHRoaXMuUkVTVGF1dGhMb2dpblVybCwgbG9naW5QYXJhbXMpLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gcmVzLmdldFJlc3BvbnNlSGVhZGVyKCdMb2NhdGlvbicpO1xuXG5cdFx0c2VsZi5fYWpheC5wb3N0KGxvY2F0aW9uLCB7XG5cdFx0XHRzZXJ2aWNlOiBjYWxsYmFja1VybFxuXHRcdH0pLnN1Y2Nlc3MoZnVuY3Rpb24gKHJlcykge1xuXHRcdFx0aWYgKGNhbGxiYWNrVXJsLmluZGV4T2YoJz8nKSA9PT0gLTEpIHtcblx0XHRcdFx0Y2FsbGJhY2tVcmwgKz0gJz90aWNrZXQ9JyArIHJlcy5yZXNwb25zZVRleHQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoY2FsbGJhY2tVcmwuaW5kZXhPZigndGlja2V0JykgIT09IC0xKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2tVcmwgPSBjYWxsYmFja1VybC5yZXBsYWNlKC90aWNrZXQ9W14mXSsvLCAndGlja2V0PScgKyByZXMucmVzcG9uc2VUZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjYWxsYmFja1VybCArPSAnJnRpY2tldD0nICsgcmVzLnJlc3BvbnNlVGV4dDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjYWxsYmFjayhyZXMuc3RhdHVzKTtcblx0XHR9KS5lcnJvcihmdW5jdGlvbiAocmVzKSB7XG5cdFx0XHRsb2dzLmFkZEFwcGxpY2F0aW9uTG9nKCdMb2dpbiBmYWlsZWQgd2l0aCBzdGF0dXMgY29kZTogJyArIHJlcy5zdGF0dXMpO1xuXHRcdFx0Y2FsbGJhY2socmVzLnN0YXR1cyk7XG5cdFx0fSk7XG5cdH0pLmVycm9yKGZ1bmN0aW9uIChyZXMpIHtcblx0XHRpZiAocmVzLnJlc3BvbnNlVGV4dCA9PT0gJ2Vycm9yLmF1dGhlbnRpY2F0aW9uLmNyZWRlbnRpYWxzLmJhZCcpIHtcblx0XHRcdGNhbGxiYWNrKC0xKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnTG9naW4gZmFpbGVkIHdpdGggc3RhdHVzIGNvZGU6ICcgKyByZXMuc3RhdHVzKTtcblx0XHRcdGNhbGxiYWNrKHJlcy5zdGF0dXMpO1xuXHRcdH1cblx0fSk7XG59XG5cblxuLy8gVXRpbGlsaXR5IGZ1bmN0aW9ucyBmb3IgaGFuZGxpbmcgZmlsZXMgYW5kIGZvbGRlcnMgb24gVklZQVxuLyoqXG4gKiBSZXR1cm5zIHRoZSBkZXRhaWxzIG9mIGEgZm9sZGVyIGZyb20gZm9sZGVyIHNlcnZpY2VcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJOYW1lIC0gRnVsbCBwYXRoIG9mIGZvbGRlciB0byBiZSBmb3VuZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3RcbiAqL1xubW9kdWxlLmV4cG9ydHMuZ2V0Rm9sZGVyRGV0YWlscyA9IGZ1bmN0aW9uIChmb2xkZXJOYW1lLCBvcHRpb25zKSB7XG5cdC8vIEZpcnN0IGNhbGwgdG8gZ2V0IGZvbGRlcidzIGlkXG5cdGxldCB1cmwgPSBcIi9mb2xkZXJzL2ZvbGRlcnMvQGl0ZW0/cGF0aD1cIiArIGZvbGRlck5hbWVcblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIHVybCwgb3B0aW9ucyk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZGV0YWlscyBvZiBhIGZpbGUgZnJvbSBmaWxlcyBzZXJ2aWNlXG4gKiBAcGFyYW0ge1N0cmluZ30gZmlsZVVyaSAtIEZ1bGwgcGF0aCBvZiBmaWxlIHRvIGJlIGZvdW5kXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdDogY2FjaGVCdXN0IGZvcmNlcyBicm93c2VyIHRvIGZldGNoIG5ldyBmaWxlXG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldEZpbGVEZXRhaWxzID0gZnVuY3Rpb24gKGZpbGVVcmksIG9wdGlvbnMpIHtcblx0Y29uc3QgY2FjaGVCdXN0ID0gb3B0aW9ucy5jYWNoZUJ1c3Rcblx0aWYgKGNhY2hlQnVzdCkge1xuXHRcdGZpbGVVcmkgKz0gJz9jYWNoZUJ1c3Q9JyArIG5ldyBEYXRlKCkuZ2V0VGltZSgpXG5cdH1cblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIGZpbGVVcmksIG9wdGlvbnMpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGNvbnRlbnRzIG9mIGEgZmlsZSBmcm9tIGZpbGVzIHNlcnZpY2VcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlVXJpIC0gRnVsbCBwYXRoIG9mIGZpbGUgdG8gYmUgZG93bmxvYWRlZFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgLSBPcHRpb25zIG9iamVjdCBmb3IgbWFuYWdlZFJlcXVlc3Q6IGNhY2hlQnVzdCBmb3JjZXMgYnJvd3NlciB0byBmZXRjaCBuZXcgZmlsZVxuICovXG5tb2R1bGUuZXhwb3J0cy5nZXRGaWxlQ29udGVudCA9IGZ1bmN0aW9uIChmaWxlVXJpLCBvcHRpb25zKSB7XG5cdGNvbnN0IGNhY2hlQnVzdCA9IG9wdGlvbnMuY2FjaGVCdXN0XG5cdGxldCB1cmkgPSBmaWxlVXJpICsgJy9jb250ZW50J1xuXHRpZiAoY2FjaGVCdXN0KSB7XG5cdFx0dXJpICs9ICc/Y2FjaGVCdXN0PScgKyBuZXcgRGF0ZSgpLmdldFRpbWUoKVxuXHR9XG5cdHJldHVybiB0aGlzLm1hbmFnZWRSZXF1ZXN0KCdnZXQnLCB1cmksIG9wdGlvbnMpO1xufVxuXG5cbi8vIFV0aWwgZnVuY3Rpb25zIGZvciB3b3JraW5nIHdpdGggZmlsZXMgYW5kIGZvbGRlcnNcbi8qKlxuICogUmV0dXJucyBkZXRhaWxzIGFib3V0IGZvbGRlciBpdCBzZWxmIGFuZCBpdCdzIG1lbWJlcnMgd2l0aCBkZXRhaWxzXG4gKiBAcGFyYW0ge1N0cmluZ30gZm9sZGVyTmFtZSAtIEZ1bGwgcGF0aCBvZiBmb2xkZXIgdG8gYmUgZm91bmRcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLmdldEZvbGRlckNvbnRlbnRzID0gYXN5bmMgZnVuY3Rpb24gKGZvbGRlck5hbWUsIG9wdGlvbnMpIHtcblx0Y29uc3Qgc2VsZiA9IHRoaXNcblx0Y29uc3Qge2NhbGxiYWNrfSA9IG9wdGlvbnNcblxuXHQvLyBTZWNvbmQgY2FsbCB0byBnZXQgZm9sZGVyJ3MgbWVtZWJlcnNcblx0Y29uc3QgX2NhbGxiYWNrID0gKGVyciwgZGF0YSkgPT4ge1xuXHRcdGxldCBpZCA9IGRhdGEuYm9keS5pZFxuXHRcdGxldCBtZW1iZXJzVXJsID0gJy9mb2xkZXJzL2ZvbGRlcnMvJyArIGlkICsgJy9tZW1iZXJzJyArICcvP2xpbWl0PTEwMDAwMDAwJztcblx0XHRyZXR1cm4gc2VsZi5tYW5hZ2VkUmVxdWVzdCgnZ2V0JywgbWVtYmVyc1VybCwge2NhbGxiYWNrfSlcblx0fVxuXG5cdC8vIEZpcnN0IGNhbGwgdG8gZ2V0IGZvbGRlcidzIGlkXG5cdGxldCB1cmwgPSBcIi9mb2xkZXJzL2ZvbGRlcnMvQGl0ZW0/cGF0aD1cIiArIGZvbGRlck5hbWVcblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRjYWxsYmFjazogX2NhbGxiYWNrXG5cdH0pXG5cdHRoaXMubWFuYWdlZFJlcXVlc3QoJ2dldCcsIHVybCwgb3B0aW9uc09iailcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgZm9sZGVyXG4gKiBAcGFyYW0ge1N0cmluZ30gcGFyZW50VXJpIC0gVGhlIHVyaSBvZiB0aGUgZm9sZGVyIHdoZXJlIHRoZSBuZXcgY2hpbGQgaXMgYmVpbmcgY3JlYXRlZFxuICogQHBhcmFtIHtTdHJpbmd9IGZvbGRlck5hbWUgLSBGdWxsIHBhdGggb2YgZm9sZGVyIHRvIGJlIGZvdW5kXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5jcmVhdGVOZXdGb2xkZXIgPSBmdW5jdGlvbiAocGFyZW50VXJpLCBmb2xkZXJOYW1lLCBvcHRpb25zKSB7XG5cdGNvbnN0IGhlYWRlcnMgPSB7XG5cdFx0J0FjY2VwdCc6ICdhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L2phdmFzY3JpcHQsICovKjsgcT0wLjAxJyxcblx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHR9XG5cblx0Y29uc3QgdXJsID0gJy9mb2xkZXJzL2ZvbGRlcnM/cGFyZW50Rm9sZGVyVXJpPScgKyBwYXJlbnRVcmk7XG5cdGNvbnN0IGRhdGEgPSB7XG5cdFx0J25hbWUnOiBmb2xkZXJOYW1lLFxuXHRcdCd0eXBlJzogXCJmb2xkZXJcIlxuXHR9XG5cblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRwYXJhbXM6IEpTT04uc3RyaW5naWZ5KGRhdGEpLFxuXHRcdGhlYWRlcnMsXG5cdFx0dXNlTXVsdGlwYXJ0Rm9ybURhdGE6IGZhbHNlXG5cdH0pXG5cblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ3Bvc3QnLCB1cmwsIG9wdGlvbnNPYmopO1xufVxuXG4vKipcbiAqIERlbGV0ZXMgYSBmb2xkZXJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmb2xkZXJJZCAtIEZ1bGwgVVJJIG9mIGZvbGRlciB0byBiZSBkZWxldGVkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5kZWxldGVGb2xkZXJCeUlkID0gZnVuY3Rpb24gKGZvbGRlcklkLCBvcHRpb25zKSB7XG5cdGNvbnN0IHVybCA9ICcvZm9sZGVycy9mb2xkZXJzLycgKyBmb2xkZXJJZDtcblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2RlbGV0ZScsIHVybCwgb3B0aW9ucylcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlTmFtZSAtIE5hbWUgb2YgdGhlIGZpbGUgYmVpbmcgY3JlYXRlZFxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVCbG9iIC0gQ29udGVudCBvZiB0aGUgZmlsZVxuICogQHBhcmFtIHtTdHJpbmd9IHBhcmVudEZPbGRlclVyaSAtIFVSSSBvZiB0aGUgcGFyZW50IGZvbGRlciB3aGVyZSB0aGUgZmlsZSBpcyB0byBiZSBjcmVhdGVkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5jcmVhdGVOZXdGaWxlID0gZnVuY3Rpb24gKGZpbGVOYW1lLCBmaWxlQmxvYiwgcGFyZW50Rm9sZGVyVXJpLCBvcHRpb25zKSB7XG5cdGxldCB1cmwgPSBcIi9maWxlcy9maWxlcyNtdWx0aXBhcnRVcGxvYWRcIjtcblx0bGV0IGRhdGFPYmogPSB7XG5cdFx0ZmlsZTogW2ZpbGVCbG9iLCBmaWxlTmFtZV0sXG5cdFx0cGFyZW50Rm9sZGVyVXJpXG5cdH1cblxuXHRjb25zdCBvcHRpb25zT2JqID0gT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywge1xuXHRcdHBhcmFtczogZGF0YU9iaixcblx0XHR1c2VNdWx0aXBhcnRGb3JtRGF0YTogdHJ1ZSxcblx0fSlcblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ3Bvc3QnLCB1cmwsIG9wdGlvbnNPYmopO1xufVxuXG4vKipcbiAqIEdlbmVyaWMgZGVsZXRlIGZ1bmN0aW9uIHRoYXQgZGVsZXRlcyBieSBVUklcbiAqIEBwYXJhbSB7U3RyaW5nfSBpdGVtVXJpIC0gTmFtZSBvZiB0aGUgaXRlbSBiZWluZyBkZWxldGVkXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyAtIE9wdGlvbnMgb2JqZWN0IGZvciBtYW5hZ2VkUmVxdWVzdFxuICovXG5tb2R1bGUuZXhwb3J0cy5kZWxldGVJdGVtID0gZnVuY3Rpb24gKGl0ZW1VcmksIG9wdGlvbnMpIHtcblx0cmV0dXJuIHRoaXMubWFuYWdlZFJlcXVlc3QoJ2RlbGV0ZScsIGl0ZW1VcmksIG9wdGlvbnMpXG59XG5cblxuLyoqXG4gKiBVcGRhdGVzIGNvbnRlbnRzIG9mIGEgZmlsZVxuICogQHBhcmFtIHtTdHJpbmd9IGZpbGVOYW1lIC0gTmFtZSBvZiB0aGUgZmlsZSBiZWluZyB1cGRhdGVkXG4gKiBAcGFyYW0ge09iamVjdCB8IEJsb2J9IGRhdGFPYmogLSBOZXcgY29udGVudCBvZiB0aGUgZmlsZSAoT2JqZWN0IG11c3QgY29udGFpbiBmaWxlIGtleSlcbiAqIE9iamVjdCBleGFtcGxlIHtcbiAqICAgZmlsZTogWzxibG9iPiwgPGZpbGVOYW1lPl1cbiAqIH1cbiAqIEBwYXJhbSB7U3RyaW5nfSBsYXN0TW9kaWZpZWQgLSB0aGUgbGFzdC1tb2RpZmllZCBoZWFkZXIgc3RyaW5nIHRoYXQgbWF0Y2hlcyB0aGF0IG9mIGZpbGUgYmVpbmcgb3ZlcndyaXR0ZW5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIC0gT3B0aW9ucyBvYmplY3QgZm9yIG1hbmFnZWRSZXF1ZXN0XG4gKi9cbm1vZHVsZS5leHBvcnRzLnVwZGF0ZUZpbGUgPSBmdW5jdGlvbiAoaXRlbVVyaSwgZGF0YU9iaiwgbGFzdE1vZGlmaWVkLCBvcHRpb25zKSB7XG5cdGNvbnN0IHVybCA9IGl0ZW1VcmkgKyAnL2NvbnRlbnQnXG5cdGNvbnNvbGUubG9nKCdVUkwnLCB1cmwpXG5cdGxldCBoZWFkZXJzID0ge1xuXHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vdm5kLnNhcy5maWxlJyxcblx0XHQnSWYtVW5tb2RpZmllZC1TaW5jZSc6IGxhc3RNb2RpZmllZFxuXHR9XG5cdGNvbnN0IGlzQmxvYiA9IGRhdGFPYmogaW5zdGFuY2VvZiBCbG9iXG5cdGNvbnN0IHVzZU11bHRpcGFydEZvcm1EYXRhID0gIWlzQmxvYiAvLyBzZXQgdXNlTXVsdGlwYXJ0Rm9ybURhdGEgdG8gdHJ1ZSBpZiBkYXRhT2JqIGlzIG5vdCBCbG9iXG5cblx0Y29uc3Qgb3B0aW9uc09iaiA9IE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIHtcblx0XHRwYXJhbXM6IGRhdGFPYmosXG5cdFx0aGVhZGVycyxcblx0XHR1c2VNdWx0aXBhcnRGb3JtRGF0YVxuXHR9KVxuXHRyZXR1cm4gdGhpcy5tYW5hZ2VkUmVxdWVzdCgncHV0JywgdXJsLCBvcHRpb25zT2JqKTtcbn1cbiIsImNvbnN0IGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG5jb25zdCBoNTRzRXJyb3IgPSByZXF1aXJlKCcuLi9lcnJvci5qcycpO1xuXG5jb25zdCBwcm9ncmFtTm90Rm91bmRQYXR0ID0gLzx0aXRsZT4oU3RvcmVkIFByb2Nlc3MgRXJyb3J8U0FTU3RvcmVkUHJvY2Vzcyk8XFwvdGl0bGU+W1xcc1xcU10qPGgyPihTdG9yZWQgcHJvY2VzcyBub3QgZm91bmQ6Lip8Lipub3QgYSB2YWxpZCBzdG9yZWQgcHJvY2VzcyBwYXRoLik8XFwvaDI+LztcbmNvbnN0IGJhZEpvYkRlZmluaXRpb24gPSBcIjxoMj5QYXJhbWV0ZXIgRXJyb3IgPGJyLz5VbmFibGUgdG8gZ2V0IGpvYiBkZWZpbml0aW9uLjwvaDI+XCI7XG5cbmNvbnN0IHJlc3BvbnNlUmVwbGFjZSA9IGZ1bmN0aW9uKHJlcykge1xuICByZXR1cm4gcmVzXG59O1xuXG4vKipcbiogUGFyc2UgcmVzcG9uc2UgZnJvbSBzZXJ2ZXJcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlUmVzID0gZnVuY3Rpb24ocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMpIHtcbiAgY29uc3QgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcbiAgaWYobWF0Y2hlcykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdZb3UgaGF2ZSBub3QgYmVlbiBncmFudGVkIHBlcm1pc3Npb24gdG8gcGVyZm9ybSB0aGlzIGFjdGlvbiwgb3IgdGhlIFNUUCBpcyBtaXNzaW5nLicpO1xuICB9XG4gIC8vcmVtb3ZlIG5ldyBsaW5lcyBpbiBqc29uIHJlc3BvbnNlXG4gIC8vcmVwbGFjZSBcXFxcKGQpIHdpdGggXFwoZCkgLSBTQVMganNvbiBwYXJzZXIgaXMgZXNjYXBpbmcgaXRcbiAgcmV0dXJuIEpTT04ucGFyc2UocmVzcG9uc2VSZXBsYWNlKHJlc3BvbnNlVGV4dCkpO1xufTtcblxuLyoqXG4qIFBhcnNlIHJlc3BvbnNlIGZyb20gc2VydmVyIGluIGRlYnVnIG1vZGVcbipcbiogQHBhcmFtIHtvYmplY3R9IHJlc3BvbnNlVGV4dCAtIHJlc3BvbnNlIGh0bWwgZnJvbSB0aGUgc2VydmVyXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtIC0gc2FzIHByb2dyYW0gcGF0aFxuKiBAcGFyYW0ge29iamVjdH0gcGFyYW1zIC0gcGFyYW1zIHNlbnQgdG8gc2FzIHByb2dyYW0gd2l0aCBhZGRUYWJsZVxuKiBAcGFyYW0ge3N0cmluZ30gaG9zdFVybCAtIHNhbWUgYXMgaW4gaDU0cyBjb25zdHJ1Y3RvclxuKiBAcGFyYW0ge2Jvb2x9IGlzVml5YSAtIHNhbWUgYXMgaW4gaDU0cyBjb25zdHJ1Y3RvclxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRGVidWdSZXMgPSBmdW5jdGlvbiAocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtLCBwYXJhbXMsIGhvc3RVcmwsIGlzVml5YSkge1xuXHRjb25zdCBzZWxmID0gdGhpc1xuXHRsZXQgbWF0Y2hlcyA9IHJlc3BvbnNlVGV4dC5tYXRjaChwcm9ncmFtTm90Rm91bmRQYXR0KTtcblx0aWYgKG1hdGNoZXMpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdwcm9ncmFtTm90Rm91bmQnLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJyk7XG5cdH1cblxuXHRpZiAoaXNWaXlhKSB7XG5cdFx0Y29uc3QgbWF0Y2hlc1dyb25nSm9iID0gcmVzcG9uc2VUZXh0Lm1hdGNoKGJhZEpvYkRlZmluaXRpb24pO1xuXHRcdGlmIChtYXRjaGVzV3JvbmdKb2IpIHtcblx0XHRcdHRocm93IG5ldyBoNTRzRXJyb3IoJ3Byb2dyYW1Ob3RGb3VuZCcsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMuIFVuYWJsZSB0byBnZXQgam9iIGRlZmluaXRpb24uJyk7XG5cdFx0fVxuXHR9XG5cblx0Ly9maW5kIGpzb25cblx0bGV0IHBhdHQgPSBpc1ZpeWEgPyAvXiguPzxpZnJhbWUuKnNyYz1cIikoW15cIl0rKSguKmlmcmFtZT4pL20gOiAvXiguPy0taDU0cy1kYXRhLXN0YXJ0LS0pKFtcXFNcXHNdKj8pKC0taDU0cy1kYXRhLWVuZC0tKS9tO1xuXHRtYXRjaGVzID0gcmVzcG9uc2VUZXh0Lm1hdGNoKHBhdHQpO1xuXG5cdGNvbnN0IHBhZ2UgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJyk7XG5cdGNvbnN0IGh0bWxCb2R5UGF0dCA9IC88Ym9keS4qPihbXFxzXFxTXSopPFxcL2JvZHk+Lztcblx0Y29uc3QgYm9keU1hdGNoZXMgPSBwYWdlLm1hdGNoKGh0bWxCb2R5UGF0dCk7XG5cdC8vcmVtb3ZlIGh0bWwgdGFnc1xuXHRsZXQgZGVidWdUZXh0ID0gYm9keU1hdGNoZXNbMV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJyk7XG5cdGRlYnVnVGV4dCA9IHRoaXMuZGVjb2RlSFRNTEVudGl0aWVzKGRlYnVnVGV4dCk7XG5cblx0bG9ncy5hZGREZWJ1Z0RhdGEoYm9keU1hdGNoZXNbMV0sIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSwgcGFyYW1zKTtcblxuICBpZiAoaXNWaXlhICYmIHRoaXMucGFyc2VFcnJvclJlc3BvbnNlKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdzYXNFcnJvcicsICdTYXMgcHJvZ3JhbSBjb21wbGV0ZWQgd2l0aCBlcnJvcnMnKTtcblx0fVxuXHRpZiAoIW1hdGNoZXMpIHtcblx0XHR0aHJvdyBuZXcgaDU0c0Vycm9yKCdwYXJzZUVycm9yJywgJ1VuYWJsZSB0byBwYXJzZSByZXNwb25zZSBqc29uJyk7XG5cdH1cblxuXG5cdGNvbnN0IHByb21pc2UgPSBuZXcgUHJvbWlzZShmdW5jdGlvbiAocmVzb2x2ZSwgcmVqZWN0KSB7XG5cdFx0bGV0IGpzb25PYmpcblx0XHRpZiAoaXNWaXlhKSB7XG5cdFx0XHRjb25zdCB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0XHRcdGNvbnN0IGJhc2VVcmwgPSBob3N0VXJsIHx8IFwiXCI7XG5cdFx0XHR4aHIub3BlbihcIkdFVFwiLCBiYXNlVXJsICsgbWF0Y2hlc1syXSk7XG5cdFx0XHR4aHIub25sb2FkID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRpZiAodGhpcy5zdGF0dXMgPj0gMjAwICYmIHRoaXMuc3RhdHVzIDwgMzAwKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQucmVwbGFjZSgvKFxcclxcbnxcXHJ8XFxuKS9nLCAnJykpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignZmV0Y2hFcnJvcicsIHhoci5zdGF0dXNUZXh0LCB0aGlzLnN0YXR1cykpXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR4aHIub25lcnJvciA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ2ZldGNoRXJyb3InLCB4aHIuc3RhdHVzVGV4dCkpXG5cdFx0XHR9O1xuXHRcdFx0eGhyLnNlbmQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0anNvbk9iaiA9IEpTT04ucGFyc2UocmVzcG9uc2VSZXBsYWNlKG1hdGNoZXNbMl0pKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBoNTRzRXJyb3IoJ3BhcnNlRXJyb3InLCAnVW5hYmxlIHRvIHBhcnNlIHJlc3BvbnNlIGpzb24nKSlcblx0XHRcdH1cblxuXHRcdFx0aWYgKGpzb25PYmogJiYganNvbk9iai5oNTRzQWJvcnQpIHtcblx0XHRcdFx0cmVzb2x2ZShqc29uT2JqKTtcblx0XHRcdH0gZWxzZSBpZiAoc2VsZi5wYXJzZUVycm9yUmVzcG9uc2UocmVzcG9uc2VUZXh0LCBzYXNQcm9ncmFtKSkge1xuXHRcdFx0XHRyZWplY3QobmV3IGg1NHNFcnJvcignc2FzRXJyb3InLCAnU2FzIHByb2dyYW0gY29tcGxldGVkIHdpdGggZXJyb3JzJykpXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvbHZlKGpzb25PYmopO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIHByb21pc2U7XG59O1xuXG4vKipcbiogQWRkIGZhaWxlZCByZXNwb25zZSB0byBsb2dzIC0gdXNlZCBvbmx5IGlmIGRlYnVnPWZhbHNlXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXNwb25zZVRleHQgLSByZXNwb25zZSBodG1sIGZyb20gdGhlIHNlcnZlclxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHBhdGhcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5hZGRGYWlsZWRSZXNwb25zZSA9IGZ1bmN0aW9uKHJlc3BvbnNlVGV4dCwgc2FzUHJvZ3JhbSkge1xuICBjb25zdCBwYXR0ICAgICAgPSAvPHNjcmlwdChbXFxzXFxTXSopXFwvZm9ybT4vO1xuICBjb25zdCBwYXR0MiAgICAgPSAvZGlzcGxheVxccz86XFxzP25vbmU7P1xccz8vO1xuICAvL3JlbW92ZSBzY3JpcHQgd2l0aCBmb3JtIGZvciB0b2dnbGluZyB0aGUgbG9ncyBhbmQgXCJkaXNwbGF5Om5vbmVcIiBmcm9tIHN0eWxlXG4gIHJlc3BvbnNlVGV4dCAgPSByZXNwb25zZVRleHQucmVwbGFjZShwYXR0LCAnJykucmVwbGFjZShwYXR0MiwgJycpO1xuICBsZXQgZGVidWdUZXh0ID0gcmVzcG9uc2VUZXh0LnJlcGxhY2UoLzxbXj5dKj4vZywgJycpO1xuICBkZWJ1Z1RleHQgPSB0aGlzLmRlY29kZUhUTUxFbnRpdGllcyhkZWJ1Z1RleHQpO1xuXG4gIGxvZ3MuYWRkRmFpbGVkUmVxdWVzdChyZXNwb25zZVRleHQsIGRlYnVnVGV4dCwgc2FzUHJvZ3JhbSk7XG59O1xuXG4vKipcbiogVW5lc2NhcGUgYWxsIHN0cmluZyB2YWx1ZXMgaW4gcmV0dXJuZWQgb2JqZWN0XG4qXG4qIEBwYXJhbSB7b2JqZWN0fSBvYmpcbipcbiovXG5tb2R1bGUuZXhwb3J0cy51bmVzY2FwZVZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICBmb3IgKGxldCBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKHR5cGVvZiBvYmpba2V5XSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9ialtrZXldID0gZGVjb2RlVVJJQ29tcG9uZW50KG9ialtrZXldKTtcbiAgICB9IGVsc2UgaWYodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHRoaXMudW5lc2NhcGVWYWx1ZXMob2JqW2tleV0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gb2JqO1xufTtcblxuLyoqXG4qIFBhcnNlIGVycm9yIHJlc3BvbnNlIGZyb20gc2VydmVyIGFuZCBzYXZlIGVycm9ycyBpbiBtZW1vcnlcbipcbiogQHBhcmFtIHtzdHJpbmd9IHJlcyAtIHNlcnZlciByZXNwb25zZVxuKiBAcGFyYW0ge3N0cmluZ30gc2FzUHJvZ3JhbSAtIHNhcyBwcm9ncmFtIHdoaWNoIHJldHVybmVkIHRoZSByZXNwb25zZVxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnBhcnNlRXJyb3JSZXNwb25zZSA9IGZ1bmN0aW9uKHJlcywgc2FzUHJvZ3JhbSkge1xuICAvL2NhcHR1cmUgJ0VSUk9SOiBbdGV4dF0uJyBvciAnRVJST1IgeHggW3RleHRdLidcbiAgY29uc3QgcGF0dCAgICA9IC9eRVJST1IoOlxcc3xcXHNcXGRcXGQpKC4qXFwufC4qXFxuLipcXC4pL2dtO1xuICBsZXQgZXJyb3JzICA9IHJlcy5yZXBsYWNlKC8oPChbXj5dKyk+KS9pZywgJycpLm1hdGNoKHBhdHQpO1xuICBpZighZXJyb3JzKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgbGV0IGVyck1lc3NhZ2U7XG4gIGZvcihsZXQgaSA9IDAsIG4gPSBlcnJvcnMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG4gICAgZXJyTWVzc2FnZSAgPSBlcnJvcnNbaV0ucmVwbGFjZSgvPFtePl0qPi9nLCAnJykucmVwbGFjZSgvKFxcbnxcXHN7Mix9KS9nLCAnICcpO1xuICAgIGVyck1lc3NhZ2UgID0gdGhpcy5kZWNvZGVIVE1MRW50aXRpZXMoZXJyTWVzc2FnZSk7XG4gICAgZXJyb3JzW2ldICAgPSB7XG4gICAgICBzYXNQcm9ncmFtOiBzYXNQcm9ncmFtLFxuICAgICAgbWVzc2FnZTogICAgZXJyTWVzc2FnZSxcbiAgICAgIHRpbWU6ICAgICAgIG5ldyBEYXRlKClcbiAgICB9O1xuICB9XG5cbiAgbG9ncy5hZGRTYXNFcnJvcnMoZXJyb3JzKTtcblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8qKlxuKiBEZWNvZGUgSFRNTCBlbnRpdGllcyAtIG9sZCB1dGlsaXR5IGZ1bmN0aW9uXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSByZXMgLSBzZXJ2ZXIgcmVzcG9uc2VcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5kZWNvZGVIVE1MRW50aXRpZXMgPSBmdW5jdGlvbiAoaHRtbCkge1xuICBjb25zdCB0ZW1wRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcbiAgbGV0IHN0clx0PSBodG1sLnJlcGxhY2UoLyYoIyg/OnhbMC05YS1mXSt8XFxkKyl8W2Etel0rKTsvZ2ksXG4gICAgZnVuY3Rpb24gKHN0cikge1xuICAgICAgdGVtcEVsZW1lbnQuaW5uZXJIVE1MID0gc3RyO1xuICAgICAgc3RyID0gdGVtcEVsZW1lbnQudGV4dENvbnRlbnQgfHwgdGVtcEVsZW1lbnQuaW5uZXJUZXh0O1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICk7XG4gIHJldHVybiBzdHI7XG59O1xuXG4vKipcbiogQ29udmVydCBzYXMgdGltZSB0byBqYXZhc2NyaXB0IGRhdGVcbipcbiogQHBhcmFtIHtudW1iZXJ9IHNhc0RhdGUgLSBzYXMgVGF0ZSBvYmplY3RcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5mcm9tU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoc2FzRGF0ZSkge1xuICBjb25zdCBiYXNlZGF0ZSA9IG5ldyBEYXRlKFwiSmFudWFyeSAxLCAxOTYwIDAwOjAwOjAwXCIpO1xuICBjb25zdCBjdXJyZGF0ZSA9IHNhc0RhdGU7XG5cbiAgLy8gb2Zmc2V0cyBmb3IgVVRDIGFuZCB0aW1lem9uZXMgYW5kIEJTVFxuICBjb25zdCBiYXNlT2Zmc2V0ID0gYmFzZWRhdGUuZ2V0VGltZXpvbmVPZmZzZXQoKTsgLy8gaW4gbWludXRlc1xuXG4gIC8vIGNvbnZlcnQgc2FzIGRhdGV0aW1lIHRvIGEgY3VycmVudCB2YWxpZCBqYXZhc2NyaXB0IGRhdGVcbiAgY29uc3QgYmFzZWRhdGVNcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCk7IC8vIGluIG1zXG4gIGNvbnN0IGN1cnJkYXRlTXMgID0gY3VycmRhdGUgKiAxMDAwOyAvLyB0byBtc1xuICBjb25zdCBzYXNEYXRldGltZSA9IGN1cnJkYXRlTXMgKyBiYXNlZGF0ZU1zO1xuICBjb25zdCBqc0RhdGUgICAgICA9IG5ldyBEYXRlKCk7XG4gIGpzRGF0ZS5zZXRUaW1lKHNhc0RhdGV0aW1lKTsgLy8gZmlyc3QgdGltZSB0byBnZXQgb2Zmc2V0IEJTVCBkYXlsaWdodCBzYXZpbmdzIGV0Y1xuICBjb25zdCBjdXJyT2Zmc2V0ICA9IGpzRGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpOyAvLyBhZGp1c3QgZm9yIG9mZnNldCBpbiBtaW51dGVzXG4gIGNvbnN0IG9mZnNldFZhciAgID0gKGJhc2VPZmZzZXQgLSBjdXJyT2Zmc2V0KSAqIDYwICogMTAwMDsgLy8gZGlmZmVyZW5jZSBpbiBtaWxsaXNlY29uZHNcbiAgY29uc3Qgb2Zmc2V0VGltZSAgPSBzYXNEYXRldGltZSAtIG9mZnNldFZhcjsgLy8gZmluZGluZyBCU1QgYW5kIGRheWxpZ2h0IHNhdmluZ3NcbiAganNEYXRlLnNldFRpbWUob2Zmc2V0VGltZSk7IC8vIHVwZGF0ZSB3aXRoIG9mZnNldFxuICByZXR1cm4ganNEYXRlO1xufTtcblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciByZXNwb25zZSBvYmplY3QgaXMgYSBsb2dpbiByZWRpcmVjdFxuICogQHBhcmFtIHtPYmplY3R9IHJlc3BvbnNlT2JqIHhociByZXNwb25zZSB0byBiZSBjaGVja2VkIGZvciBsb2dvbiByZWRpcmVjdFxuICovXG5tb2R1bGUuZXhwb3J0cy5uZWVkVG9Mb2dpbiA9IGZ1bmN0aW9uKHJlc3BvbnNlT2JqKSB7XG5cdGNvbnN0IGlzU0FTTG9nb24gPSByZXNwb25zZU9iai5yZXNwb25zZVVSTCAmJiByZXNwb25zZU9iai5yZXNwb25zZVVSTC5pbmNsdWRlcygnU0FTTG9nb24nKVxuXHRpZiAoaXNTQVNMb2dvbiA9PT0gZmFsc2UpIHtcblx0XHRyZXR1cm4gZmFsc2Vcblx0fVxuXG4gIGNvbnN0IHBhdHQgPSAvPGZvcm0uK2FjdGlvbj1cIiguKkxvZ29uW15cIl0qKS4qPi87XG4gIGNvbnN0IG1hdGNoZXMgPSBwYXR0LmV4ZWMocmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0KTtcbiAgbGV0IG5ld0xvZ2luVXJsO1xuXG4gIGlmKCFtYXRjaGVzKSB7XG4gICAgLy90aGVyZSdzIG5vIGZvcm0sIHdlIGFyZSBpbi4gaG9vcmF5IVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBhY3Rpb25VcmwgPSBtYXRjaGVzWzFdLnJlcGxhY2UoL1xcPy4qLywgJycpO1xuICAgIGlmKGFjdGlvblVybC5jaGFyQXQoMCkgPT09ICcvJykge1xuICAgICAgbmV3TG9naW5VcmwgPSB0aGlzLmhvc3RVcmwgPyB0aGlzLmhvc3RVcmwgKyBhY3Rpb25VcmwgOiBhY3Rpb25Vcmw7XG4gICAgICBpZihuZXdMb2dpblVybCAhPT0gdGhpcy5sb2dpblVybCkge1xuICAgICAgICB0aGlzLl9sb2dpbkNoYW5nZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvZ2luVXJsID0gbmV3TG9naW5Vcmw7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vcmVsYXRpdmUgcGF0aFxuXG4gICAgICBjb25zdCBsYXN0SW5kT2ZTbGFzaCA9IHJlc3BvbnNlT2JqLnJlc3BvbnNlVVJMLmxhc3RJbmRleE9mKCcvJykgKyAxO1xuICAgICAgLy9yZW1vdmUgZXZlcnl0aGluZyBhZnRlciB0aGUgbGFzdCBzbGFzaCwgYW5kIGV2ZXJ5dGhpbmcgdW50aWwgdGhlIGZpcnN0XG4gICAgICBjb25zdCByZWxhdGl2ZUxvZ2luVXJsID0gcmVzcG9uc2VPYmoucmVzcG9uc2VVUkwuc3Vic3RyKDAsIGxhc3RJbmRPZlNsYXNoKS5yZXBsYWNlKC8uKlxcL3syfVteXFwvXSovLCAnJykgKyBhY3Rpb25Vcmw7XG4gICAgICBuZXdMb2dpblVybCA9IHRoaXMuaG9zdFVybCA/IHRoaXMuaG9zdFVybCArIHJlbGF0aXZlTG9naW5VcmwgOiByZWxhdGl2ZUxvZ2luVXJsO1xuICAgICAgaWYobmV3TG9naW5VcmwgIT09IHRoaXMubG9naW5VcmwpIHtcbiAgICAgICAgdGhpcy5fbG9naW5DaGFuZ2VkID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5sb2dpblVybCA9IG5ld0xvZ2luVXJsO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vc2F2ZSBwYXJhbWV0ZXJzIGZyb20gaGlkZGVuIGZvcm0gZmllbGRzXG4gICAgY29uc3QgcGFyc2VyID0gbmV3IERPTVBhcnNlcigpO1xuICAgIGNvbnN0IGRvYyA9IHBhcnNlci5wYXJzZUZyb21TdHJpbmcocmVzcG9uc2VPYmoucmVzcG9uc2VUZXh0LFwidGV4dC9odG1sXCIpO1xuICAgIGNvbnN0IHJlcyA9IGRvYy5xdWVyeVNlbGVjdG9yQWxsKFwiaW5wdXRbdHlwZT0naGlkZGVuJ11cIik7XG4gICAgY29uc3QgaGlkZGVuRm9ybVBhcmFtcyA9IHt9O1xuICAgIGlmKHJlcykge1xuICAgICAgLy9pdCdzIG5ldyBsb2dpbiBwYWdlIGlmIHdlIGhhdmUgdGhlc2UgYWRkaXRpb25hbCBwYXJhbWV0ZXJzXG4gICAgICB0aGlzLl9pc05ld0xvZ2luUGFnZSA9IHRydWU7XG4gICAgICByZXMuZm9yRWFjaChmdW5jdGlvbihub2RlKSB7XG4gICAgICAgIGhpZGRlbkZvcm1QYXJhbXNbbm9kZS5uYW1lXSA9IG5vZGUudmFsdWU7XG4gICAgICB9KTtcbiAgICAgIHRoaXMuX2FkaXRpb25hbExvZ2luUGFyYW1zID0gaGlkZGVuRm9ybVBhcmFtcztcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbn07XG5cbi8qKlxuKiBHZXQgZnVsbCBwcm9ncmFtIHBhdGggZnJvbSBtZXRhZGF0YSByb290IGFuZCByZWxhdGl2ZSBwYXRoXG4qXG4qIEBwYXJhbSB7c3RyaW5nfSBtZXRhZGF0YVJvb3QgLSBNZXRhZGF0YSByb290IChwYXRoIHdoZXJlIGFsbCBwcm9ncmFtcyBmb3IgdGhlIHByb2plY3QgYXJlIGxvY2F0ZWQpXG4qIEBwYXJhbSB7c3RyaW5nfSBzYXNQcm9ncmFtUGF0aCAtIFNhcyBwcm9ncmFtIHBhdGhcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5nZXRGdWxsUHJvZ3JhbVBhdGggPSBmdW5jdGlvbihtZXRhZGF0YVJvb3QsIHNhc1Byb2dyYW1QYXRoKSB7XG4gIHJldHVybiBtZXRhZGF0YVJvb3QgPyBtZXRhZGF0YVJvb3QucmVwbGFjZSgvXFwvPyQvLCAnLycpICsgc2FzUHJvZ3JhbVBhdGgucmVwbGFjZSgvXlxcLy8sICcnKSA6IHNhc1Byb2dyYW1QYXRoO1xufTtcblxuLy8gUmV0dXJucyBvYmplY3Qgd2hlcmUgdGFibGUgcm93cyBhcmUgZ3JvdXBwZWQgYnkga2V5XG5tb2R1bGUuZXhwb3J0cy5nZXRPYmpPZlRhYmxlID0gZnVuY3Rpb24gKHRhYmxlLCBrZXksIHZhbHVlID0gbnVsbCkge1xuXHRjb25zdCBvYmogPSB7fVxuXHR0YWJsZS5mb3JFYWNoKHJvdyA9PiB7XG5cdFx0b2JqW3Jvd1trZXldXSA9IHZhbHVlID8gcm93W3ZhbHVlXSA6IHJvd1xuXHR9KVxuXHRyZXR1cm4gb2JqXG59XG5cbi8vIFJldHVybnMgc2VsZiB1cmkgb3V0IG9mIGxpbmtzIGFycmF5XG5tb2R1bGUuZXhwb3J0cy5nZXRTZWxmVXJpID0gZnVuY3Rpb24gKGxpbmtzKSB7XG5cdHJldHVybiBsaW5rc1xuXHRcdC5maWx0ZXIoZSA9PiBlLnJlbCA9PT0gJ3NlbGYnKVxuXHRcdC5tYXAoZSA9PiBlLnVyaSlcblx0XHQuc2hpZnQoKTtcbn1cbiIsImNvbnN0IGg1NHNFcnJvciA9IHJlcXVpcmUoJy4vZXJyb3IuanMnKTtcbmNvbnN0IGxvZ3MgICAgICA9IHJlcXVpcmUoJy4vbG9ncy5qcycpO1xuY29uc3QgVGFibGVzICAgID0gcmVxdWlyZSgnLi90YWJsZXMnKTtcbmNvbnN0IEZpbGVzICAgICA9IHJlcXVpcmUoJy4vZmlsZXMnKTtcbmNvbnN0IHRvU2FzRGF0ZVRpbWUgPSByZXF1aXJlKCcuL3RhYmxlcy91dGlscy5qcycpLnRvU2FzRGF0ZVRpbWU7XG5cbi8qKlxuICogQ2hlY2tzIHdoZXRoZXIgYSBnaXZlbiB0YWJsZSBuYW1lIGlzIGEgdmFsaWQgU0FTIG1hY3JvIG5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBtYWNyb05hbWUgVGhlIFNBUyBtYWNybyBuYW1lIHRvIGJlIGdpdmVuIHRvIHRoaXMgdGFibGVcbiAqL1xuZnVuY3Rpb24gdmFsaWRhdGVNYWNybyhtYWNyb05hbWUpIHtcbiAgaWYobWFjcm9OYW1lLmxlbmd0aCA+IDMyKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBuYW1lIHRvbyBsb25nLiBNYXhpbXVtIGlzIDMyIGNoYXJhY3RlcnMnKTtcbiAgfVxuXG4gIGNvbnN0IGNoYXJDb2RlQXQwID0gbWFjcm9OYW1lLmNoYXJDb2RlQXQoMCk7XG4gIC8vIHZhbGlkYXRlIGl0IHN0YXJ0cyB3aXRoIEEtWiwgYS16LCBvciBfXG4gIGlmKChjaGFyQ29kZUF0MCA8IDY1IHx8IGNoYXJDb2RlQXQwID4gOTApICYmIChjaGFyQ29kZUF0MCA8IDk3IHx8IGNoYXJDb2RlQXQwID4gMTIyKSAmJiBtYWNyb05hbWVbMF0gIT09ICdfJykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSBzdGFydGluZyB3aXRoIG51bWJlciBvciBzcGVjaWFsIGNoYXJhY3RlcnMnKTtcbiAgfVxuXG4gIGZvcihsZXQgaSA9IDA7IGkgPCBtYWNyb05hbWUubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBjaGFyQ29kZSA9IG1hY3JvTmFtZS5jaGFyQ29kZUF0KGkpO1xuXG4gICAgaWYoKGNoYXJDb2RlIDwgNDggfHwgY2hhckNvZGUgPiA1NykgJiZcbiAgICAgIChjaGFyQ29kZSA8IDY1IHx8IGNoYXJDb2RlID4gOTApICYmXG4gICAgICAoY2hhckNvZGUgPCA5NyB8fCBjaGFyQ29kZSA+IDEyMikgJiZcbiAgICAgIG1hY3JvTmFtZVtpXSAhPT0gJ18nKVxuICAgIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGFibGUgbmFtZSBoYXMgdW5zdXBwb3J0ZWQgY2hhcmFjdGVycycpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiogaDU0cyBTQVMgZGF0YSBvYmplY3QgY29uc3RydWN0b3JcbiogQGNvbnN0cnVjdG9yXG4qXG4qIEBwYXJhbSB7YXJyYXl8ZmlsZX0gZGF0YSAtIFRhYmxlIG9yIGZpbGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxuKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIFRoZSBTQVMgbWFjcm8gbmFtZSB0byBiZSBnaXZlbiB0byB0aGlzIHRhYmxlXG4qIEBwYXJhbSB7bnVtYmVyfSBwYXJhbWV0ZXJUaHJlc2hvbGQgLSBzaXplIG9mIGRhdGEgb2JqZWN0cyBzZW50IHRvIFNBUyAobGVnYWN5KVxuKlxuKi9cbmZ1bmN0aW9uIFNhc0RhdGEoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcykge1xuICBpZihkYXRhIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB0aGlzLl9maWxlcyA9IHt9O1xuICAgIHRoaXMuYWRkVGFibGUoZGF0YSwgbWFjcm9OYW1lLCBzcGVjcyk7XG4gIH0gZWxzZSBpZihkYXRhIGluc3RhbmNlb2YgRmlsZSB8fCBkYXRhIGluc3RhbmNlb2YgQmxvYikge1xuICAgIEZpbGVzLmNhbGwodGhpcywgZGF0YSwgbWFjcm9OYW1lKTtcbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0RhdGEgYXJndW1lbnQgd3JvbmcgdHlwZSBvciBtaXNzaW5nJyk7XG4gIH1cbn1cblxuLyoqXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge1N0cmluZ30gbWFjcm9OYW1lIFRoZSBTQVMgbWFjcm8gbmFtZSB0byBiZSBnaXZlbiB0byB0aGlzIHRhYmxlXG4qXG4qL1xuU2FzRGF0YS5wcm90b3R5cGUuYWRkVGFibGUgPSBmdW5jdGlvbih0YWJsZSwgbWFjcm9OYW1lLCBzcGVjcykge1xuICBjb25zdCBpc1NwZWNzUHJvdmlkZWQgPSAhIXNwZWNzO1xuICBpZih0YWJsZSAmJiBtYWNyb05hbWUpIHtcbiAgICBpZighKHRhYmxlIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ0ZpcnN0IGFyZ3VtZW50IG11c3QgYmUgYXJyYXknKTtcbiAgICB9XG4gICAgaWYodHlwZW9mIG1hY3JvTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnU2Vjb25kIGFyZ3VtZW50IG11c3QgYmUgc3RyaW5nJyk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVNYWNybyhtYWNyb05hbWUpO1xuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWlzc2luZyBhcmd1bWVudHMnKTtcbiAgfVxuXG4gIGlmICh0eXBlb2YgdGFibGUgIT09ICdvYmplY3QnIHx8ICEodGFibGUgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1RhYmxlIGFyZ3VtZW50IGlzIG5vdCBhbiBhcnJheScpO1xuICB9XG5cbiAgbGV0IGtleTtcbiAgaWYoc3BlY3MpIHtcbiAgICBpZihzcGVjcy5jb25zdHJ1Y3RvciAhPT0gT2JqZWN0KSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NwZWNzIGRhdGEgdHlwZSB3cm9uZy4gT2JqZWN0IGV4cGVjdGVkLicpO1xuICAgIH1cbiAgICBmb3Ioa2V5IGluIHRhYmxlWzBdKSB7XG4gICAgICBpZighc3BlY3Nba2V5XSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgY29sdW1ucyBpbiBzcGVjcyBkYXRhLicpO1xuICAgICAgfVxuICAgIH1cbiAgICBmb3Ioa2V5IGluIHNwZWNzKSB7XG4gICAgICBpZihzcGVjc1trZXldLmNvbnN0cnVjdG9yICE9PSBPYmplY3QpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdXcm9uZyBjb2x1bW4gZGVzY3JpcHRvciBpbiBzcGVjcyBkYXRhLicpO1xuICAgICAgfVxuICAgICAgaWYoIXNwZWNzW2tleV0uY29sVHlwZSB8fCAhc3BlY3Nba2V5XS5jb2xMZW5ndGgpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdNaXNzaW5nIGNvbHVtbnMgaW4gc3BlY3MgZGVzY3JpcHRvci4nKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBsZXQgaSwgaiwgLy9jb3VudGVycyB1c2VkIGxhdHRlciBpbiBjb2RlXG4gICAgICByb3csIHZhbCwgdHlwZSxcbiAgICAgIHNwZWNLZXlzID0gW107XG5cdGNvbnN0IHNwZWNpYWxDaGFycyA9IFsnXCInLCAnXFxcXCcsICcvJywgJ1xcbicsICdcXHQnLCAnXFxmJywgJ1xccicsICdcXGInXTtcblxuICBpZighc3BlY3MpIHtcbiAgICBzcGVjcyA9IHt9O1xuXG4gICAgZm9yIChpID0gMDsgaSA8IHRhYmxlLmxlbmd0aDsgaSsrKSB7XG4gICAgICByb3cgPSB0YWJsZVtpXTtcblxuICAgICAgaWYodHlwZW9mIHJvdyAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUYWJsZSBpdGVtIGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgICAgIH1cblxuICAgICAgZm9yKGtleSBpbiByb3cpIHtcbiAgICAgICAgaWYocm93Lmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICB2YWwgID0gcm93W2tleV07XG4gICAgICAgICAgdHlwZSA9IHR5cGVvZiB2YWw7XG5cbiAgICAgICAgICBpZihzcGVjc1trZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHNwZWNLZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgIHNwZWNzW2tleV0gPSB7fTtcblxuICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgIGlmKHZhbCA8IE51bWJlci5NSU5fU0FGRV9JTlRFR0VSIHx8IHZhbCA+IE51bWJlci5NQVhfU0FGRV9JTlRFR0VSKSB7XG4gICAgICAgICAgICAgICAgbG9ncy5hZGRBcHBsaWNhdGlvbkxvZygnT2JqZWN0WycgKyBpICsgJ10uJyArIGtleSArICcgLSBUaGlzIHZhbHVlIGV4Y2VlZHMgZXhwZWN0ZWQgbnVtZXJpYyBwcmVjaXNpb24uJyk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgPSAnbnVtJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSA4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJyAmJiAhKHZhbCBpbnN0YW5jZW9mIERhdGUpKSB7IC8vIHN0cmFpZ2h0Zm9yd2FyZCBzdHJpbmdcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xUeXBlICAgID0gJ3N0cmluZyc7XG4gICAgICAgICAgICAgIHNwZWNzW2tleV0uY29sTGVuZ3RoICA9IHZhbC5sZW5ndGg7XG4gICAgICAgICAgICB9IGVsc2UgaWYodmFsIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdkYXRlJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSA4O1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgICAgICBzcGVjc1trZXldLmNvbFR5cGUgICA9ICdqc29uJztcbiAgICAgICAgICAgICAgc3BlY3Nba2V5XS5jb2xMZW5ndGggPSBKU09OLnN0cmluZ2lmeSh2YWwpLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgc3BlY0tleXMgPSBPYmplY3Qua2V5cyhzcGVjcyk7XG4gIH1cblxuICBsZXQgc2FzQ3N2ID0gJyc7XG5cbiAgLy8gd2UgbmVlZCB0d28gbG9vcHMgLSB0aGUgZmlyc3Qgb25lIGlzIGNyZWF0aW5nIHNwZWNzIGFuZCB2YWxpZGF0aW5nXG4gIGZvciAoaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkrKykge1xuICAgIHJvdyA9IHRhYmxlW2ldO1xuICAgIGZvcihqID0gMDsgaiA8IHNwZWNLZXlzLmxlbmd0aDsgaisrKSB7XG4gICAgICBrZXkgPSBzcGVjS2V5c1tqXTtcbiAgICAgIGlmKHJvdy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgIHZhbCAgPSByb3dba2V5XTtcbiAgICAgICAgdHlwZSA9IHR5cGVvZiB2YWw7XG5cbiAgICAgICAgaWYodHlwZSA9PT0gJ251bWJlcicgJiYgaXNOYU4odmFsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdOYU4gdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYodmFsID09PSAtSW5maW5pdHkgfHwgdmFsID09PSBJbmZpbml0eSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsIHZhbC50b1N0cmluZygpICsgJyB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgICAgfVxuICAgICAgICBpZih2YWwgPT09IHRydWUgfHwgdmFsID09PSBmYWxzZSkge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgICB9XG4gICAgICAgIGlmKHR5cGUgPT09ICdzdHJpbmcnICYmIHZhbC5pbmRleE9mKCdcXHJcXG4nKSAhPT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCAnTmV3IGxpbmUgY2hhcmFjdGVyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGNvbnZlcnQgbnVsbCB0byAnLicgZm9yIG51bWJlcnMgYW5kIHRvICcnIGZvciBzdHJpbmdzXG4gICAgICAgIGlmKHZhbCA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmKHNwZWNzW2tleV0uY29sVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHZhbCA9ICcnO1xuICAgICAgICAgICAgdHlwZSA9ICdzdHJpbmcnO1xuICAgICAgICAgIH0gZWxzZSBpZihzcGVjc1trZXldLmNvbFR5cGUgPT09ICdudW0nKSB7XG4gICAgICAgICAgICB2YWwgPSAnLic7XG4gICAgICAgICAgICB0eXBlID0gJ251bWJlcic7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdDYW5ub3QgY29udmVydCBudWxsIHZhbHVlJyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cblxuICAgICAgICBpZiAoKHR5cGUgPT09ICdudW1iZXInICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ251bScgJiYgdmFsICE9PSAnLicpIHx8XG4gICAgICAgICAgKCh0eXBlID09PSAnc3RyaW5nJyAmJiAhKHZhbCBpbnN0YW5jZW9mIERhdGUpICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ3N0cmluZycpICYmXG4gICAgICAgICAgKHR5cGUgPT09ICdzdHJpbmcnICYmIHNwZWNzW2tleV0uY29sVHlwZSA9PSAnbnVtJyAmJiB2YWwgIT09ICcuJykpIHx8XG4gICAgICAgICAgKHZhbCBpbnN0YW5jZW9mIERhdGUgJiYgc3BlY3Nba2V5XS5jb2xUeXBlICE9PSAnZGF0ZScpIHx8XG4gICAgICAgICAgKCh0eXBlID09PSAnb2JqZWN0JyAmJiB2YWwuY29uc3RydWN0b3IgIT09IERhdGUpICYmIHNwZWNzW2tleV0uY29sVHlwZSAhPT0gJ2pzb24nKSlcbiAgICAgICAge1xuICAgICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHNwZWNzIHR5cGUgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicgK1xuICAgICAgICAgICAgJyB0eXBlL2NvbFR5cGUvdmFsID0gJyArIHR5cGUgKycvJyArIHNwZWNzW2tleV0uY29sVHlwZSArICcvJyArIHZhbCApO1xuICAgICAgICB9IGVsc2UgaWYoIWlzU3BlY3NQcm92aWRlZCAmJiB0eXBlID09PSAnc3RyaW5nJyAmJiBzcGVjc1trZXldLmNvbExlbmd0aCA8IHZhbC5sZW5ndGgpIHtcbiAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XG4gICAgICAgIH0gZWxzZSBpZigodHlwZSA9PT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggPCB2YWwubGVuZ3RoKSB8fCAodHlwZSAhPT0gJ3N0cmluZycgJiYgc3BlY3Nba2V5XS5jb2xMZW5ndGggIT09IDgpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ1RoZXJlIGlzIGEgc3BlY3MgbGVuZ3RoIG1pc21hdGNoIGluIHRoZSBhcnJheSBiZXR3ZWVuIHZhbHVlcyAoY29sdW1ucykgb2YgdGhlIHNhbWUgbmFtZS4nICtcbiAgICAgICAgICAgICcgdHlwZS9jb2xUeXBlL3ZhbCA9ICcgKyB0eXBlICsnLycgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLycgKyB2YWwgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh2YWwgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICAgICAgdmFsID0gdG9TYXNEYXRlVGltZSh2YWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgc3dpdGNoKHNwZWNzW2tleV0uY29sVHlwZSkge1xuICAgICAgICAgIGNhc2UgJ251bSc6XG4gICAgICAgICAgY2FzZSAnZGF0ZSc6XG4gICAgICAgICAgICBzYXNDc3YgKz0gdmFsO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgICAgICAgIHNhc0NzdiArPSAnXCInICsgdmFsLnJlcGxhY2UoL1wiL2csICdcIlwiJykgKyAnXCInO1xuICAgICAgICAgICAgbGV0IGNvbExlbmd0aCA9IHZhbC5sZW5ndGg7XG4gICAgICAgICAgICBmb3IobGV0IGsgPSAwOyBrIDwgdmFsLmxlbmd0aDsgaysrKSB7XG4gICAgICAgICAgICAgIGlmKHNwZWNpYWxDaGFycy5pbmRleE9mKHZhbFtrXSkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgY29sTGVuZ3RoKys7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGV0IGNvZGUgPSB2YWwuY2hhckNvZGVBdChrKTtcbiAgICAgICAgICAgICAgICBpZihjb2RlID4gMHhmZmZmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMztcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoY29kZSA+IDB4N2ZmKSB7XG4gICAgICAgICAgICAgICAgICBjb2xMZW5ndGggKz0gMjtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYoY29kZSA+IDB4N2YpIHtcbiAgICAgICAgICAgICAgICAgIGNvbExlbmd0aCArPSAxO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gdXNlIG1heGltdW0gdmFsdWUgYmV0d2VlbiBtYXggcHJldmlvdXMsIGN1cnJlbnQgdmFsdWUgYW5kIDEgKGZpcnN0IHR3byBjYW4gYmUgMCB3aWNoIGlzIG5vdCBzdXBwb3J0ZWQpXG4gICAgICAgICAgICBzcGVjc1trZXldLmNvbExlbmd0aCA9IE1hdGgubWF4KHNwZWNzW2tleV0uY29sTGVuZ3RoLCBjb2xMZW5ndGgsIDEpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgICAgICAgIHNhc0NzdiArPSAnXCInICsgSlNPTi5zdHJpbmdpZnkodmFsKS5yZXBsYWNlKC9cIi9nLCAnXCJcIicpICsgJ1wiJztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBkbyBub3QgaW5zZXJ0IGlmIGl0J3MgdGhlIGxhc3QgY29sdW1uXG4gICAgICBpZihqIDwgc3BlY0tleXMubGVuZ3RoIC0gMSkge1xuICAgICAgICBzYXNDc3YgKz0gJywnO1xuICAgICAgfVxuICAgIH1cbiAgICBpZihpIDwgdGFibGUubGVuZ3RoIC0gMSkge1xuICAgICAgc2FzQ3N2ICs9ICdcXHJcXG4nO1xuICAgIH1cbiAgfVxuXG4gIC8vY29udmVydCBzcGVjcyB0byBjc3Ygd2l0aCBwaXBlc1xuICBjb25zdCBzcGVjU3RyaW5nID0gc3BlY0tleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBrZXkgKyAnLCcgKyBzcGVjc1trZXldLmNvbFR5cGUgKyAnLCcgKyBzcGVjc1trZXldLmNvbExlbmd0aDtcbiAgfSkuam9pbignfCcpO1xuXG4gIHRoaXMuX2ZpbGVzW21hY3JvTmFtZV0gPSBbXG4gICAgc3BlY1N0cmluZyxcbiAgICBuZXcgQmxvYihbc2FzQ3N2XSwge3R5cGU6ICd0ZXh0L2NzdjtjaGFyc2V0PVVURi04J30pXG4gIF07XG59O1xuXG4vKipcbiAqIEFkZCBmaWxlIGFzIGEgdmVyYmF0aW0gYmxvYiBmaWxlIHVwbGFvZFxuICogQHBhcmFtIHtCbG9ifSBmaWxlIC0gdGhlIGJsb2IgdGhhdCB3aWxsIGJlIHVwbG9hZGVkIGFzIGZpbGVcbiAqIEBwYXJhbSB7U3RyaW5nfSBtYWNyb05hbWUgLSB0aGUgU0FTIHdlYmluIG5hbWUgZ2l2ZW4gdG8gdGhpcyBmaWxlXG4gKi9cblNhc0RhdGEucHJvdG90eXBlLmFkZEZpbGUgID0gZnVuY3Rpb24oZmlsZSwgbWFjcm9OYW1lKSB7XG4gIEZpbGVzLnByb3RvdHlwZS5hZGQuY2FsbCh0aGlzLCBmaWxlLCBtYWNyb05hbWUpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBTYXNEYXRhO1xuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcblxuLypcbiogaDU0cyB0YWJsZXMgb2JqZWN0IGNvbnN0cnVjdG9yXG4qIEBjb25zdHJ1Y3RvclxuKlxuKkBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gVGFibGUgYWRkZWQgd2hlbiBvYmplY3QgaXMgY3JlYXRlZFxuKkBwYXJhbSB7c3RyaW5nfSBtYWNyb05hbWUgLSBtYWNybyBuYW1lXG4qQHBhcmFtIHtudW1iZXJ9IHBhcmFtZXRlclRocmVzaG9sZCAtIHNpemUgb2YgZGF0YSBvYmplY3RzIHNlbnQgdG8gU0FTXG4qXG4qL1xuZnVuY3Rpb24gVGFibGVzKHRhYmxlLCBtYWNyb05hbWUsIHBhcmFtZXRlclRocmVzaG9sZCkge1xuICB0aGlzLl90YWJsZXMgPSB7fTtcbiAgdGhpcy5fcGFyYW1ldGVyVGhyZXNob2xkID0gcGFyYW1ldGVyVGhyZXNob2xkIHx8IDMwMDAwO1xuXG4gIFRhYmxlcy5wcm90b3R5cGUuYWRkLmNhbGwodGhpcywgdGFibGUsIG1hY3JvTmFtZSk7XG59XG5cbi8qXG4qIEFkZCB0YWJsZSB0byB0YWJsZXMgb2JqZWN0XG4qIEBwYXJhbSB7YXJyYXl9IHRhYmxlIC0gQXJyYXkgb2YgdGFibGUgb2JqZWN0c1xuKiBAcGFyYW0ge3N0cmluZ30gbWFjcm9OYW1lIC0gU2FzIG1hY3JvIG5hbWVcbipcbiovXG5UYWJsZXMucHJvdG90eXBlLmFkZCA9IGZ1bmN0aW9uKHRhYmxlLCBtYWNyb05hbWUpIHtcbiAgaWYodGFibGUgJiYgbWFjcm9OYW1lKSB7XG4gICAgaWYoISh0YWJsZSBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdGaXJzdCBhcmd1bWVudCBtdXN0IGJlIGFycmF5Jyk7XG4gICAgfVxuICAgIGlmKHR5cGVvZiBtYWNyb05hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1NlY29uZCBhcmd1bWVudCBtdXN0IGJlIHN0cmluZycpO1xuICAgIH1cbiAgICBpZighaXNOYU4obWFjcm9OYW1lW21hY3JvTmFtZS5sZW5ndGggLSAxXSkpIHtcbiAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnTWFjcm8gbmFtZSBjYW5ub3QgaGF2ZSBudW1iZXIgYXQgdGhlIGVuZCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ01pc3NpbmcgYXJndW1lbnRzJyk7XG4gIH1cblxuICBjb25zdCByZXN1bHQgPSB0aGlzLl91dGlscy5jb252ZXJ0VGFibGVPYmplY3QodGFibGUsIHRoaXMuX3BhcmFtZXRlclRocmVzaG9sZCk7XG5cbiAgY29uc3QgdGFibGVBcnJheSA9IFtdO1xuICB0YWJsZUFycmF5LnB1c2goSlNPTi5zdHJpbmdpZnkocmVzdWx0LnNwZWMpKTtcbiAgZm9yIChsZXQgbnVtYmVyT2ZUYWJsZXMgPSAwOyBudW1iZXJPZlRhYmxlcyA8IHJlc3VsdC5kYXRhLmxlbmd0aDsgbnVtYmVyT2ZUYWJsZXMrKykge1xuICAgIGNvbnN0IG91dFN0cmluZyA9IEpTT04uc3RyaW5naWZ5KHJlc3VsdC5kYXRhW251bWJlck9mVGFibGVzXSk7XG4gICAgdGFibGVBcnJheS5wdXNoKG91dFN0cmluZyk7XG4gIH1cbiAgdGhpcy5fdGFibGVzW21hY3JvTmFtZV0gPSB0YWJsZUFycmF5O1xufTtcblxuVGFibGVzLnByb3RvdHlwZS5fdXRpbHMgPSByZXF1aXJlKCcuL3V0aWxzLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gVGFibGVzO1xuIiwiY29uc3QgaDU0c0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IuanMnKTtcbmNvbnN0IGxvZ3MgPSByZXF1aXJlKCcuLi9sb2dzLmpzJyk7XG5cbi8qXG4qIENvbnZlcnQgdGFibGUgb2JqZWN0IHRvIFNhcyByZWFkYWJsZSBvYmplY3RcbipcbiogQHBhcmFtIHtvYmplY3R9IGluT2JqZWN0IC0gT2JqZWN0IHRvIGNvbnZlcnRcbipcbiovXG5tb2R1bGUuZXhwb3J0cy5jb252ZXJ0VGFibGVPYmplY3QgPSBmdW5jdGlvbihpbk9iamVjdCwgY2h1bmtUaHJlc2hvbGQpIHtcbiAgY29uc3Qgc2VsZiAgICAgICAgICAgID0gdGhpcztcblxuICBpZihjaHVua1RocmVzaG9sZCA+IDMwMDAwKSB7XG4gICAgY29uc29sZS53YXJuKCdZb3Ugc2hvdWxkIG5vdCBzZXQgdGhyZXNob2xkIGxhcmdlciB0aGFuIDMwa2IgYmVjYXVzZSBvZiB0aGUgU0FTIGxpbWl0YXRpb25zJyk7XG4gIH1cblxuICAvLyBmaXJzdCBjaGVjayB0aGF0IHRoZSBvYmplY3QgaXMgYW4gYXJyYXlcbiAgaWYgKHR5cGVvZiAoaW5PYmplY3QpICE9PSAnb2JqZWN0Jykge1xuICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ2FyZ3VtZW50RXJyb3InLCAnVGhlIHBhcmFtZXRlciBwYXNzZWQgdG8gY2hlY2tBbmRHZXRUeXBlT2JqZWN0IGlzIG5vdCBhbiBvYmplY3QnKTtcbiAgfVxuXG4gIGNvbnN0IGFycmF5TGVuZ3RoID0gaW5PYmplY3QubGVuZ3RoO1xuICBpZiAodHlwZW9mIChhcnJheUxlbmd0aCkgIT09ICdudW1iZXInKSB7XG4gICAgdGhyb3cgbmV3IGg1NHNFcnJvcignYXJndW1lbnRFcnJvcicsICdUaGUgcGFyYW1ldGVyIHBhc3NlZCB0byBjaGVja0FuZEdldFR5cGVPYmplY3QgZG9lcyBub3QgaGF2ZSBhIHZhbGlkIGxlbmd0aCBhbmQgaXMgbW9zdCBsaWtlbHkgbm90IGFuIGFycmF5Jyk7XG4gIH1cblxuICBjb25zdCBleGlzdGluZ0NvbHMgPSB7fTsgLy8gdGhpcyBpcyBqdXN0IHRvIG1ha2UgbG9va3VwIGVhc2llciByYXRoZXIgdGhhbiB0cmF2ZXJzaW5nIGFycmF5IGVhY2ggdGltZS4gV2lsbCB0cmFuc2Zvcm0gYWZ0ZXJcblxuICAvLyBmdW5jdGlvbiBjaGVja0FuZFNldEFycmF5IC0gdGhpcyB3aWxsIGNoZWNrIGFuIGluT2JqZWN0IGN1cnJlbnQga2V5IGFnYWluc3QgdGhlIGV4aXN0aW5nIHR5cGVBcnJheSBhbmQgZWl0aGVyIHJldHVybiAtMSBpZiB0aGVyZVxuICAvLyBpcyBhIHR5cGUgbWlzbWF0Y2ggb3IgYWRkIGFuIGVsZW1lbnQgYW5kIHVwZGF0ZS9pbmNyZW1lbnQgdGhlIGxlbmd0aCBpZiBuZWVkZWRcblxuICBmdW5jdGlvbiBjaGVja0FuZEluY3JlbWVudChjb2xTcGVjKSB7XG4gICAgaWYgKHR5cGVvZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0pID09PSAndW5kZWZpbmVkJykge1xuICAgICAgZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0gICAgICAgICAgID0ge307XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xOYW1lICAgPSBjb2xTcGVjLmNvbE5hbWU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xUeXBlICAgPSBjb2xTcGVjLmNvbFR5cGU7XG4gICAgICBleGlzdGluZ0NvbHNbY29sU3BlYy5jb2xOYW1lXS5jb2xMZW5ndGggPSBjb2xTcGVjLmNvbExlbmd0aCA+IDAgPyBjb2xTcGVjLmNvbExlbmd0aCA6IDE7XG4gICAgICByZXR1cm4gMDsgLy8gYWxsIG9rXG4gICAgfVxuICAgIC8vIGNoZWNrIHR5cGUgbWF0Y2hcbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sVHlwZSAhPT0gY29sU3BlYy5jb2xUeXBlKSB7XG4gICAgICByZXR1cm4gLTE7IC8vIHRoZXJlIGlzIGEgZnVkZ2UgaW4gdGhlIHR5cGluZ1xuICAgIH1cbiAgICBpZiAoZXhpc3RpbmdDb2xzW2NvbFNwZWMuY29sTmFtZV0uY29sTGVuZ3RoIDwgY29sU3BlYy5jb2xMZW5ndGgpIHtcbiAgICAgIGV4aXN0aW5nQ29sc1tjb2xTcGVjLmNvbE5hbWVdLmNvbExlbmd0aCA9IGNvbFNwZWMuY29sTGVuZ3RoID4gMCA/IGNvbFNwZWMuY29sTGVuZ3RoIDogMTsgLy8gaW5jcmVtZW50IHRoZSBtYXggbGVuZ3RoIG9mIHRoaXMgY29sdW1uXG4gICAgICByZXR1cm4gMDtcbiAgICB9XG4gIH1cbiAgbGV0IGNodW5rQXJyYXlDb3VudCAgICAgICAgID0gMDsgLy8gdGhpcyBpcyBmb3Iga2VlcGluZyB0YWJzIG9uIGhvdyBsb25nIHRoZSBjdXJyZW50IGFycmF5IHN0cmluZyB3b3VsZCBiZVxuICBjb25zdCB0YXJnZXRBcnJheSAgICAgICAgICAgPSBbXTsgLy8gdGhpcyBpcyB0aGUgYXJyYXkgb2YgdGFyZ2V0IGFycmF5c1xuICBsZXQgY3VycmVudFRhcmdldCAgICAgICAgICAgPSAwO1xuICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XSAgPSBbXTtcbiAgbGV0IGogICAgICAgICAgICAgICAgICAgICAgID0gMDtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBpbk9iamVjdC5sZW5ndGg7IGkrKykge1xuICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdID0ge307XG4gICAgbGV0IGNodW5rUm93Q291bnQgICAgICAgICAgICAgPSAwO1xuXG4gICAgZm9yIChsZXQga2V5IGluIGluT2JqZWN0W2ldKSB7XG4gICAgICBjb25zdCB0aGlzU3BlYyAgPSB7fTtcbiAgICAgIGNvbnN0IHRoaXNWYWx1ZSA9IGluT2JqZWN0W2ldW2tleV07XG5cbiAgICAgIC8vc2tpcCB1bmRlZmluZWQgdmFsdWVzXG4gICAgICBpZih0aGlzVmFsdWUgPT09IHVuZGVmaW5lZCB8fCB0aGlzVmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vdGhyb3cgYW4gZXJyb3IgaWYgdGhlcmUncyBOYU4gdmFsdWVcbiAgICAgIGlmKHR5cGVvZiB0aGlzVmFsdWUgPT09ICdudW1iZXInICYmIGlzTmFOKHRoaXNWYWx1ZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ05hTiB2YWx1ZSBpbiBvbmUgb2YgdGhlIHZhbHVlcyAoY29sdW1ucykgaXMgbm90IGFsbG93ZWQnKTtcbiAgICAgIH1cblxuICAgICAgaWYodGhpc1ZhbHVlID09PSAtSW5maW5pdHkgfHwgdGhpc1ZhbHVlID09PSBJbmZpbml0eSkge1xuICAgICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCd0eXBlRXJyb3InLCB0aGlzVmFsdWUudG9TdHJpbmcoKSArICcgdmFsdWUgaW4gb25lIG9mIHRoZSB2YWx1ZXMgKGNvbHVtbnMpIGlzIG5vdCBhbGxvd2VkJyk7XG4gICAgICB9XG5cbiAgICAgIGlmKHRoaXNWYWx1ZSA9PT0gdHJ1ZSB8fCB0aGlzVmFsdWUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdCb29sZWFuIHZhbHVlIGluIG9uZSBvZiB0aGUgdmFsdWVzIChjb2x1bW5zKSBpcyBub3QgYWxsb3dlZCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBnZXQgdHlwZS4uLiBpZiBpdCBpcyBhbiBvYmplY3QgdGhlbiBjb252ZXJ0IGl0IHRvIGpzb24gYW5kIHN0b3JlIGFzIGEgc3RyaW5nXG4gICAgICBjb25zdCB0aGlzVHlwZSAgPSB0eXBlb2YgKHRoaXNWYWx1ZSk7XG5cbiAgICAgIGlmICh0aGlzVHlwZSA9PT0gJ251bWJlcicpIHsgLy8gc3RyYWlnaHRmb3J3YXJkIG51bWJlclxuICAgICAgICBpZih0aGlzVmFsdWUgPCBOdW1iZXIuTUlOX1NBRkVfSU5URUdFUiB8fCB0aGlzVmFsdWUgPiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuICAgICAgICAgIGxvZ3MuYWRkQXBwbGljYXRpb25Mb2coJ09iamVjdFsnICsgaSArICddLicgKyBrZXkgKyAnIC0gVGhpcyB2YWx1ZSBleGNlZWRzIGV4cGVjdGVkIG51bWVyaWMgcHJlY2lzaW9uLicpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdudW0nO1xuICAgICAgICB0aGlzU3BlYy5jb2xMZW5ndGggICAgICAgICAgICAgICAgICA9IDg7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGhpc1ZhbHVlLnRvU3RyaW5nKCkubGVuZ3RoO1xuICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldICA9IHRoaXNWYWx1ZTtcbiAgICAgIH0gZWxzZSBpZiAodGhpc1R5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgPSBrZXk7XG4gICAgICAgIHRoaXNTcGVjLmNvbFR5cGUgICAgPSAnc3RyaW5nJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICA9IHRoaXNWYWx1ZS5sZW5ndGg7XG5cbiAgICAgICAgaWYgKHRoaXNWYWx1ZSA9PT0gXCJcIikge1xuICAgICAgICAgIHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0gPSBcIiBcIjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXVtrZXldID0gZW5jb2RlVVJJQ29tcG9uZW50KHRoaXNWYWx1ZSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpc1NwZWMuZW5jb2RlZExlbmd0aCA9IHRhcmdldEFycmF5W2N1cnJlbnRUYXJnZXRdW2pdW2tleV0ubGVuZ3RoO1xuICAgICAgfSBlbHNlIGlmKHRoaXNWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIFx0Y29uc29sZS5sb2coXCJFUlJPUiBWQUxVRSBcIiwgdGhpc1ZhbHVlKVxuICAgICAgXHRjb25zb2xlLmxvZyhcIlRZUEVPRiBWQUxVRSBcIiwgdHlwZW9mIHRoaXNWYWx1ZSlcbiAgICAgICAgdGhyb3cgbmV3IGg1NHNFcnJvcigndHlwZUVycm9yJywgJ0RhdGUgdHlwZSBub3Qgc3VwcG9ydGVkLiBQbGVhc2UgdXNlIGg1NHMudG9TYXNEYXRlVGltZSBmdW5jdGlvbiB0byBjb252ZXJ0IGl0Jyk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXNUeXBlID09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXNTcGVjLmNvbE5hbWUgICAgICAgICAgICAgICAgICAgID0ga2V5O1xuICAgICAgICB0aGlzU3BlYy5jb2xUeXBlICAgICAgICAgICAgICAgICAgICA9ICdqc29uJztcbiAgICAgICAgdGhpc1NwZWMuY29sTGVuZ3RoICAgICAgICAgICAgICAgICAgPSBKU09OLnN0cmluZ2lmeSh0aGlzVmFsdWUpLmxlbmd0aDtcbiAgICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XSAgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkodGhpc1ZhbHVlKSkucmVwbGFjZSgvJy9nLCAnJTI3Jyk7XG4gICAgICAgIHRoaXNTcGVjLmVuY29kZWRMZW5ndGggICAgICAgICAgICAgID0gdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF1bal1ba2V5XS5sZW5ndGg7XG4gICAgICB9XG5cbiAgICAgIGNodW5rUm93Q291bnQgPSBjaHVua1Jvd0NvdW50ICsgNiArIGtleS5sZW5ndGggKyB0aGlzU3BlYy5lbmNvZGVkTGVuZ3RoO1xuXG4gICAgICBpZiAoY2hlY2tBbmRJbmNyZW1lbnQodGhpc1NwZWMpID09IC0xKSB7XG4gICAgICAgIHRocm93IG5ldyBoNTRzRXJyb3IoJ3R5cGVFcnJvcicsICdUaGVyZSBpcyBhIHR5cGUgbWlzbWF0Y2ggaW4gdGhlIGFycmF5IGJldHdlZW4gdmFsdWVzIChjb2x1bW5zKSBvZiB0aGUgc2FtZSBuYW1lLicpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vcmVtb3ZlIGxhc3QgYWRkZWQgcm93IGlmIGl0J3MgZW1wdHlcbiAgICBpZihPYmplY3Qua2V5cyh0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XVtqXSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5zcGxpY2UoaiwgMSk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAoY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XG4gICAgICB0aHJvdyBuZXcgaDU0c0Vycm9yKCdhcmd1bWVudEVycm9yJywgJ1JvdyAnICsgaiArICcgZXhjZWVkcyBzaXplIGxpbWl0IG9mIDMya2InKTtcbiAgICB9IGVsc2UgaWYoY2h1bmtBcnJheUNvdW50ICsgY2h1bmtSb3dDb3VudCA+IGNodW5rVGhyZXNob2xkKSB7XG4gICAgICAvL2NyZWF0ZSBuZXcgYXJyYXkgaWYgdGhpcyBvbmUgaXMgZnVsbCBhbmQgbW92ZSB0aGUgbGFzdCBpdGVtIHRvIHRoZSBuZXcgYXJyYXlcbiAgICAgIGNvbnN0IGxhc3RSb3cgPSB0YXJnZXRBcnJheVtjdXJyZW50VGFyZ2V0XS5wb3AoKTsgLy8gZ2V0IHJpZCBvZiB0aGF0IGxhc3Qgcm93XG4gICAgICBjdXJyZW50VGFyZ2V0Kys7IC8vIG1vdmUgb250byB0aGUgbmV4dCBhcnJheVxuICAgICAgdGFyZ2V0QXJyYXlbY3VycmVudFRhcmdldF0gID0gW2xhc3RSb3ddOyAvLyBtYWtlIGl0IGFuIGFycmF5XG4gICAgICBqICAgICAgICAgICAgICAgICAgICAgICAgICAgPSAwOyAvLyBpbml0aWFsaXNlIG5ldyByb3cgY291bnRlciBmb3IgbmV3IGFycmF5IC0gaXQgd2lsbCBiZSBpbmNyZW1lbnRlZCBhdCB0aGUgZW5kIG9mIHRoZSBmdW5jdGlvblxuICAgICAgY2h1bmtBcnJheUNvdW50ICAgICAgICAgICAgID0gY2h1bmtSb3dDb3VudDsgLy8gdGhpcyBpcyB0aGUgbmV3IGNodW5rIG1heCBzaXplXG4gICAgfSBlbHNlIHtcbiAgICAgIGNodW5rQXJyYXlDb3VudCA9IGNodW5rQXJyYXlDb3VudCArIGNodW5rUm93Q291bnQ7XG4gICAgfVxuICAgIGorKztcbiAgfVxuXG4gIC8vIHJlZm9ybWF0IGV4aXN0aW5nQ29scyBpbnRvIGFuIGFycmF5IHNvIHNhcyBjYW4gcGFyc2UgaXQ7XG4gIGNvbnN0IHNwZWNBcnJheSA9IFtdO1xuICBmb3IgKGxldCBrIGluIGV4aXN0aW5nQ29scykge1xuICAgIHNwZWNBcnJheS5wdXNoKGV4aXN0aW5nQ29sc1trXSk7XG4gIH1cbiAgcmV0dXJuIHtcbiAgICBzcGVjOiAgICAgICBzcGVjQXJyYXksXG4gICAgZGF0YTogICAgICAgdGFyZ2V0QXJyYXksXG4gICAganNvbkxlbmd0aDogY2h1bmtBcnJheUNvdW50XG4gIH07IC8vIHRoZSBzcGVjIHdpbGwgYmUgdGhlIG1hY3JvWzBdLCB3aXRoIHRoZSBkYXRhIHNwbGl0IGludG8gYXJyYXlzIG9mIG1hY3JvWzEtbl1cbiAgLy8gbWVhbnMgaW4gdGVybXMgb2YgZG9qbyB4aHIgb2JqZWN0IGF0IGxlYXN0IHRoZXkgbmVlZCB0byBnbyBpbnRvIHRoZSBzYW1lIGFycmF5XG59O1xuXG4vKlxuKiBDb252ZXJ0IGphdmFzY3JpcHQgZGF0ZSB0byBzYXMgdGltZVxuKlxuKiBAcGFyYW0ge29iamVjdH0ganNEYXRlIC0gamF2YXNjcmlwdCBEYXRlIG9iamVjdFxuKlxuKi9cbm1vZHVsZS5leHBvcnRzLnRvU2FzRGF0ZVRpbWUgPSBmdW5jdGlvbiAoanNEYXRlKSB7XG4gIGNvbnN0IGJhc2VkYXRlID0gbmV3IERhdGUoXCJKYW51YXJ5IDEsIDE5NjAgMDA6MDA6MDBcIik7XG4gIGNvbnN0IGN1cnJkYXRlID0ganNEYXRlO1xuXG4gIC8vIG9mZnNldHMgZm9yIFVUQyBhbmQgdGltZXpvbmVzIGFuZCBCU1RcbiAgY29uc3QgYmFzZU9mZnNldCA9IGJhc2VkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcbiAgY29uc3QgY3Vyck9mZnNldCA9IGN1cnJkYXRlLmdldFRpbWV6b25lT2Zmc2V0KCk7IC8vIGluIG1pbnV0ZXNcblxuICAvLyBjb252ZXJ0IGN1cnJkYXRlIHRvIGEgc2FzIGRhdGV0aW1lXG4gIGNvbnN0IG9mZnNldFNlY3MgICAgPSAoY3Vyck9mZnNldCAtIGJhc2VPZmZzZXQpICogNjA7IC8vIG9mZnNldERpZmYgaXMgaW4gbWludXRlcyB0byBzdGFydCB3aXRoXG4gIGNvbnN0IGJhc2VEYXRlU2VjcyAgPSBiYXNlZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIGNvbnN0IGN1cnJkYXRlU2VjcyAgPSBjdXJyZGF0ZS5nZXRUaW1lKCkgLyAxMDAwOyAvLyBnZXQgcmlkIG9mIG1zXG4gIGNvbnN0IHNhc0RhdGV0aW1lICAgPSBNYXRoLnJvdW5kKGN1cnJkYXRlU2VjcyAtIGJhc2VEYXRlU2VjcyAtIG9mZnNldFNlY3MpOyAvLyBhZGp1c3RcblxuICByZXR1cm4gc2FzRGF0ZXRpbWU7XG59O1xuIl19
