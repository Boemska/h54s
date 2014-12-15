describe('h54s', function() {
  describe('utils test:', function() {

    //TODO: Implement and test date escape
    it('All values in returned object should be escaped - string and date', function(done) {
      this.timeout(4000);
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
      sasAdapter.call('/AJAX/h54s_test/getData', function(err, res) {
        assert.isObject(err, 'We should get error object');
        assert.equal(err.type, 'parseError', 'We should get parseError');
        var sasErrors = sasAdapter.getSasErrors();
        assert.isArray(sasErrors, 'sasErrors should be array');
        if(sasErrors.length === 0) {
          assert.notOk(sasErrors, 'sasErrors array should not be empty');
        }
        done();
      });
    });

    it('Application logs', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.call('/AJAX/h54s_test/startupService', function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        var logs = sasAdapter.getApplicationLogs();
        assert.isArray(logs, 'getApplicationLogs() should return array');
        assert.equal(logs.length, 0, 'Application logs should be empty array');
        done();
      });
    });

  });
});
