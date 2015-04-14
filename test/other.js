/* global describe, it, assert, serverData, h54s, getRandomAsciiChars, proclaim */
describe('h54s', function() {
  describe('Character tests:', function() {

    it('Test json character escape', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });

      var data0 = "\\\"/\/\?''";
      var data1 = "asd\nasd\tasd\r\nasdasd" + String.fromCharCode(10) + "asd";

      var table = new h54s.Tables([
        {
          data0: data0,
          data1: data1
        }
      ], 'data');

      sasAdapter.login(serverData.user, serverData.pass, function() {
        sasAdapter.call('/AJAX/h54s_test/BounceData', table, function(err, res) {
          assert.isUndefined(err, 'We got error on sas program ajax call');
          assert.isDefined(res, 'Response is undefined');
          assert.equal(res.outputdata[0].data0, data0, 'Bounce data is different - data0');
          assert.equal(res.outputdata[0].data1, data1, 'Bounce data is different - data1');
          done();
        });
      });
    });

    it('Test ascii characters', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true
      });

      var chars = {};
      for(var i = 32; i < 128; i++) {
        chars['data' + i] = String.fromCharCode(i);
      }

      var table = new h54s.Tables([chars], 'data');

      sasAdapter.call('/AJAX/h54s_test/BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        for(var i = 32; i < 128; i++) {
          assert.equal(res.outputdata[0]['data' + i], chars['data' + i], chars['data' + i] + ' character is not the same in response');
        }
        done();
      });
    });

    it('Test big ascii string', function(done) {
      var data = getRandomAsciiChars(10000);

      proclaim.throws(function() {
        new h54s.Tables([
          {
            data1: data,
            data2: data,
            data3: data,
            data4: data
          }
        ], 'data');
      }, 'Row 0 exceeds size limit of 32kb');

      proclaim.throws(function() {
        new h54s.Tables([
          {}, {
            data1: data,
            data2: data,
            data3: data,
            data4: data
          }
        ], 'data');
      }, 'Row 1 exceeds size limit of 32kb');

      proclaim.doesNotThrow(function() {
        new h54s.Tables([
          {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }, {
            data: data
          }
        ], 'data');
      });
      done();
    });

  });
});
