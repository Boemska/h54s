/* global describe, it, assert, serverData, h54s, proclaim */
describe('h54s integration -', function() {
  describe('Utils test:', function() {

    it('Server response with errors', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          var table = new h54s.Tables([
            {
              libname: 'WORK',
              memname: 'CHOSENLIB'
            }
          ], 'data');
          sasAdapter.call('getData', table, function(err) {
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
            done();
          });
        }
      });
    });

    it('Application logs', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          var table = new h54s.Tables([
            {
              data: 'test'
            }
          ], 'data');
          sasAdapter.call('BounceData', table, function(err, res) {
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
            done();
          });
        } else {
          assert.fail(status, 200, 'Wrong status code on login');
        }
      });
    });

    it('Test date send and receive', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true,
        metadataRoot: serverData.metadataRoot
      });
      var date = new Date();
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          var table = new h54s.Tables([
            {
              dt_some_date: date // jshint ignore:line
            }
          ], 'data');
          sasAdapter.call('BounceData', table, function(err, res) {
            //sas is outputing data in seconds, so we need to round those dates
            var resSeconds = Math.round(res.outputdata[0].DT_SOME_DATE.getTime() / 1000); // jshint ignore:line
            var dateSeconds = Math.round(date.getTime() / 1000);
            assert.isUndefined(err, 'We got error on sas program ajax call');
            assert.equal(resSeconds, dateSeconds, 'Date is not the same');
            done();
          });
        } else {
          assert.fail(status, 200, 'Wrong status code on login');
        }
      });
    });

    it('Set debug mode and get errors when first request fails', function(done) {
      this.timeout(20000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          var table = new h54s.Tables([
            {
              libname: 'WORK',
              memname: 'CHOSENLIB'
            }
          ], 'data');
          sasAdapter.call('getData', table, function(err) {
            assert.isObject(err, 'We should get error object');
            assert.equal(err.type, 'parseError', 'We should get parseError');
            var sasErrors = sasAdapter.getSasErrors();
            assert.isArray(sasErrors, 'sasErrors should be array');
            if(sasErrors.length === 0) {
              assert.notOk(sasErrors, 'sasErrors array should not be empty');
            }

            sasAdapter.setDebugMode();
            table.add([
              {
                libname: 'WORK',
                memname: 'CHOSENLIB'
              }
            ], 'data');
            sasAdapter.call('getData', table, function(err) {
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
              done();
            });
          });
        } else {
          assert.fail(status, 200, 'Wrong status code on login');
        }
      });
    });

    it('Program not found error', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('notFoundProgram', null, function(err) {
        assert.isDefined(err, 'We should get error object');
        assert.equal(err.type, 'programNotFound', 'Wrong error type');
        done();
      });
    });

  });
});
