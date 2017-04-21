describe('h54s browserify -', function() {
  describe('Packages test:', function() {

    it('Application logs test', function(done) {
      var logs = require('../../../src/logs.js');

      for(var i = 0; i < 150; i++) {
        logs.addApplicationLog('msg' + i, 'sasProgram' + i);
        assert.equal(logs.get.getApplicationLogs().length, i < 100 ? i+1 : 100, 'Wrong applicationLogs length');
      }

      logs.clear.clearApplicationLogs();
      for(i = 0; i < 20; i++) {
        logs.addApplicationLog('msg' + i, 'sasProgram' + i);
        assert.equal(logs.get.getApplicationLogs()[i].message, 'msg' + i, 'Wrong applicationLogs message');
        assert.equal(logs.get.getApplicationLogs()[i].sasProgram, 'sasProgram' + i, 'Wrong applicationLogs message');
      }

      logs.clear.clearApplicationLogs();
      assert.equal(logs.get.getApplicationLogs().length, 0, 'Wrong applicationLogs length after clear');

      logs.addApplicationLog('msg', 'sasProgram');
      assert.equal(logs.get.getApplicationLogs().length, 1, 'Wrong applicationLogs length after clear');
      assert.equal(logs.get.getApplicationLogs()[0].message, 'msg', 'Wrong applicationLogs message');
      assert.equal(logs.get.getApplicationLogs()[0].sasProgram, 'sasProgram', 'Wrong applicationLogs message');
      done();
    });

    it('Errors log test', function(done) {
      var logs = require('../../../src/logs.js');

      for(var i = 0; i < 100; i++) {
        logs.addSasErrors(['ERROR1', 'ERROR2', 'ERROR3']);
        assert.equal(logs.get.getSasErrors().length, (i+1)*3  < 100 ? (i+1)*3 : 100, 'Wrong errorsLog length');
      }

      logs.clear.clearSasErrors();
      assert.equal(logs.get.getSasErrors().length, 0, 'Wrong errorsLog length after clear');

      logs.addSasErrors(['ERROR1', 'ERROR2', 'ERROR3']);
      assert.equal(logs.get.getSasErrors().length, 3, 'Wrong errorsLog length after clear');
      assert.equal(logs.get.getSasErrors()[0], 'ERROR1', 'Wrong errorsLog message');
      assert.equal(logs.get.getSasErrors()[1], 'ERROR2', 'Wrong errorsLog message');
      assert.equal(logs.get.getSasErrors()[2], 'ERROR3', 'Wrong errorsLog message');
      done();
    });

  });
});
