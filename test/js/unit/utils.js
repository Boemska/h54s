/* global describe, it, assert, serverData, h54s, proclaim */
describe('h54s unit -', function() {
  describe('Utils test:', function() {

    it('Server response with errors', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s({
        maxXhrRetries: 3,
      });

      var numOfInvocations = 0;
      var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
      td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn({
          success: function(callback) {
            setTimeout(function() {
              callback.call({
                success: callback
              }, {
                responseText: sasResponses.callFail,
                status: 200
              });
              numOfInvocations++;
            }.bind(this), 0);
            return this;
          },
          error: function(callback) {
            return this;
          }
      });

      sasAdapter.call('*', null, function(err) {
        assert.isObject(err, 'We should get error object');
        assert.equal(err.type, 'parseError', 'We should get parseError');
        var sasErrors = sasAdapter.getSasErrors();
        var failedRequests = sasAdapter.getFailedRequests();
        assert.isArray(sasErrors, 'sasErrors should be array');
        assert.isArray(failedRequests, 'failedRequests should be array');
        if(sasErrors.length === 0) {
          assert.notOk(sasErrors, 'sasErrors array should not be empty');
        }
        if(failedRequests.length === 0) {
          assert.notOk(failedRequests, 'failedRequests array should not be empty');
        }
        assert.equal(numOfInvocations, 3, 'Wrong number of invocations.');
        td.reset();
        done();
      });
    });

    it('Application logs', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s();
      // logs are static for h54s object and shared across all instances
      sasAdapter.clearAllLogs();

      var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
      td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn({
        success: function(callback) {
          callback({
            responseText: sasResponses.callSuccess,
            status: 200
          });
          return this;
        },
        error: function() {
          return this;
        }
      });

      sasAdapter.call('*', null, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        var logs = sasAdapter.getApplicationLogs();
        assert.isArray(logs, 'getApplicationLogs() should return array');
        if(logs.length === 0) {
          assert.fail(logs.length, ' > 0', 'Application logs should not be empty array');
        } else {
          assert.isString(logs[0].message, 'Application log object should have message property of type string');
          assert.equal(res.logmessage, logs[logs.length - 1].message, 'Last log message should be equal as logmessage from response');
          assert.isDefined(logs[0].time, 'Application log object should have time property');
        }
        sasAdapter.call('*', null, function(err, res) {
          assert.equal(sasAdapter.getApplicationLogs().length, 2, 'Wrong number of application logs');
          sasAdapter.clearApplicationLogs();
          assert.equal(sasAdapter.getApplicationLogs().length, 0, 'Wrong number of application logs');
          td.reset();
          done();
        });
      });
    });

    it('Test date', function() {
      var date = new Date();
      var dateConvertedBack = h54s.fromSasDateTime(h54s.toSasDateTime(date));
      assert.equal(Math.round(dateConvertedBack.getTime() / 1000), Math.round(date.getTime() / 1000), 'Date conversion incorrect');
    });

    it('Set debug mode and get errors when first request fails', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s();

      function getAjaxResponseObj(type) {
        return {
            success: function(callback) {
              setTimeout(function() {
                callback.call({
                  success: callback
                }, {
                  responseText: type === 'debug' ? sasResponses.callFailDebug : sasResponses.callFail,
                  status: 200
                });
              }.bind(this), 0);
              return this;
            },
            error: function(callback) {
              return this;
            }
        };
      }

      var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
      td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn(
        getAjaxResponseObj(),
        getAjaxResponseObj('debug')
      );

      sasAdapter.call('*', null, function(err) {
        assert.isObject(err, 'We should get error object');
        assert.equal(err.type, 'parseError', 'We should get parseError');
        var sasErrors = sasAdapter.getSasErrors();
        assert.isArray(sasErrors, 'sasErrors should be array');
        if(sasErrors.length === 0) {
          assert.notOk(sasErrors, 'sasErrors array should not be empty');
        }

        sasAdapter.setDebugMode();

        sasAdapter.call('*', null, function(err) {
          assert.isObject(err, 'We should get error object');
          assert.equal(err.type, 'sasError', 'We should get sasError');
          var debugData = sasAdapter.getDebugData();
          var sasErrors = sasAdapter.getSasErrors();
          var i;
          if(sasErrors.length === 0) {
            assert.notOk(sasErrors, 'sasErrors array should not be empty');
          } else {
            for(i = 0; i < sasErrors.length; i++) {
              assert.isString(sasErrors[i].message, 'error message should be string');
              assert.isString(sasErrors[i].sasProgram, 'error sasProgram should be string');
              assert.isDefined(sasErrors[i].time, 'error time is undefined');
            }
          }
          if(debugData.length === 0) {
            assert.notOk(debugData, 'sasErrors array should not be empty');
          } else {
            for(i = 0; i < debugData.length; i++) {
              assert.isString(debugData[i].debugHtml, 'debugHtml should be string');
              assert.isString(debugData[i].debugText, 'debugText should be string');
              assert.isString(debugData[i].sasProgram, 'sasProgram should be string');
              assert.isObject(debugData[i].params, 'params should be array');
              assert.isDefined(debugData[i].time, 'debug time is undefined');
            }
          }
          td.reset();
          done();
        });
      });
    });

  });
});
