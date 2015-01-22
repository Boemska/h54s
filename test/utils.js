/* global describe, it, assert, serverData, h54s, unescape */
describe('h54s', function() {
  describe('utils test:', function() {

    it('All strings in returned object should be escaped', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.call('/AJAX/h54s_test/startupService', function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        var topLevelProcess = res.toplevelProcess;
        var donutLev1 = res.donutLev1;
        var donutLev2 = res.donutLev2;
        var n, i;
        for(i = 0, n = topLevelProcess.length; i < n; i++) {
          assert.equal(topLevelProcess[i].programname, unescape(topLevelProcess[i].programname), 'String not decoded');
          assert.equal(topLevelProcess[i].shortName, unescape(topLevelProcess[i].shortName), 'String not decoded');

        }
        for(i = 0, n = donutLev1.length; i< n; i++) {
          assert.equal(donutLev1[i].value, unescape(donutLev1[i].value), 'String not decoded');
        }
        for(i = 0, n = donutLev2.length; i< n; i++) {
          assert.equal(donutLev2[i].value, unescape(donutLev2[i].value), 'String not decoded');
        }
        done();
      });
    });

    it('All values in returned object with debug=true should be escaped - string and date', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.call('/AJAX/h54s_test/startupService', function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        var topLevelProcess = res.toplevelProcess;
        var donutLev1 = res.donutLev1;
        var donutLev2 = res.donutLev2;
        var n, i;
        for(i = 0, n = topLevelProcess.length; i < n; i++) {
          assert.equal(topLevelProcess[i].programname, decodeURIComponent(topLevelProcess[i].programname), 'String not decoded');
          assert.equal(topLevelProcess[i].shortName, decodeURIComponent(topLevelProcess[i].shortName), 'String not decoded');

        }
        for(i = 0, n = donutLev1.length; i< n; i++) {
          assert.equal(donutLev1[i].value, decodeURIComponent(donutLev1[i].value), 'String not decoded');
        }
        for(i = 0, n = donutLev2.length; i< n; i++) {
          assert.equal(donutLev2[i].value, decodeURIComponent(donutLev2[i].value), 'String not decoded');
        }
        done();
      });
    });

    it('Server response with errors', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.addTable([
        {
          libname: 'WORK',
          memname: 'CHOSENLIB'
        }
      ], 'data');
      sasAdapter.call('/AJAX/h54s_test/getData', function(err) {
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
    });

    it('Application logs', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.addTable([
        {
          data: 'test'
        }
      ], 'data');
      sasAdapter.call('/AJAX/h54s_test/BounceData', function(err, res) {
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
    });

    it('Test date send and receive', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true
      });
      var date = new Date();
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.addTable([
        {
          dt_some_date: date // jshint ignore:line
        }
      ], 'data');
      sasAdapter.call('/AJAX/h54s_test/BounceData', function(err, res) {
        var resSeconds = Math.round(res.outputdata[0].dt_some_date.getTime() / 1000); // jshint ignore:line
        var dateSeconds = Math.round(date.getTime() / 1000);
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.equal(resSeconds, dateSeconds, 'Date is not the same');
        done();
      });
    });

    it('Set debug mode and get errors when first request fails', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.addTable([
        {
          libname: 'WORK',
          memname: 'CHOSENLIB'
        }
      ], 'data');
      sasAdapter.call('/AJAX/h54s_test/getData', function(err) {
        assert.isObject(err, 'We should get error object');
        assert.equal(err.type, 'parseError', 'We should get parseError');
        var sasErrors = sasAdapter.getSasErrors();
        assert.isArray(sasErrors, 'sasErrors should be array');
        if(sasErrors.length === 0) {
          assert.notOk(sasErrors, 'sasErrors array should not be empty');
        }

        sasAdapter.setDebugMode();
        sasAdapter.addTable([
          {
            libname: 'WORK',
            memname: 'CHOSENLIB'
          }
        ], 'data');
        sasAdapter.call('/AJAX/h54s_test/getData', function(err) {
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
    });

  });
});
