/* global describe, it, assert, serverData, h54s, getRandomAsciiChars, proclaim */
describe('h54s integration -', function() {
  describe('Integration tests:', function() {

    before(function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          done();
        } else {
          done(new Error('Unable to login'));
        }
      });
    });

    it('Missing SAS program', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('missingProgram', null, function(err, res) {
        assert.isDefined(err);
        assert.equal(err.type, 'programNotFound', 'We got wrong error type');
        done();
      });
    });

    it('Missing SAS program with debug set', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('missingProgram', null, function(err, res) {
        assert.isDefined(err);
        assert.equal(err.type, 'programNotFound', 'We got wrong error type');
        done();
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
      var data = new h54s.Tables([
        {
          dt_some_date: date // jshint ignore:line
        }
      ], 'data');
      sasAdapter.call('BounceData', data, function(err, res) {
        //sas is outputing data in seconds, so we need to round those dates
        var resSeconds = Math.round(res.outputdata[0].DT_SOME_DATE.getTime() / 1000); // jshint ignore:line
        var dateSeconds = Math.round(date.getTime() / 1000);
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.equal(resSeconds, dateSeconds, 'Date is not the same');
        done();
      });
    });

    it('Test json character escape', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      var data0 = "\\\"/\/\?''";
      var data1 = "asd\nasd\tasd\r\nasdasd" + String.fromCharCode(10) + "asd";

      var table = new h54s.Tables([
        {
          data0: data0,
          data1: data1
        }
      ], 'data');

      sasAdapter.call('BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        assert.equal(res.outputdata[0].DATA0, data0, 'Bounce data is different - data0');
        assert.equal(res.outputdata[0].DATA1, data1, 'Bounce data is different - data1');
        done();
      });
    });

    it('Test ascii characters', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true,
        metadataRoot: serverData.metadataRoot
      });

      var chars = {};
      for(var i = 32; i < 128; i++) {
        chars['data' + i] = String.fromCharCode(i);
      }

      var table = new h54s.Tables([chars], 'data');

      sasAdapter.call('BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        for(var i = 32; i < 128; i++) {
          assert.equal(res.outputdata[0]['DATA' + i], chars['data' + i], chars['data' + i] + ' character is not the same in response');
        }
        done();
      });
    });

    it('Test big ascii string', function(done) {
      this.timeout(30000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });
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
          {
            data1: data
          }, {
            data1: data,
            data2: data,
            data3: data,
            data4: data
          }
        ], 'data');
      }, 'Row 1 exceeds size limit of 32kb');

      proclaim.doesNotThrow(function() {
        var rows = [
          {
            data: 0 + ' ' + data
          }, {
            data: 1 + ' ' + data
          }, {
            data: 2 + ' ' + data
          }, {
            data: 3 + ' ' + data
          }, {
            data: 4 + ' ' + data
          }, {
            data: 5 + ' ' + data
          }, {
            data: 6 + ' ' + data
          }, {
            data: 7 + ' ' + data
          }, {
            data: 8 + ' ' + data
          }, {
            data: 9 + ' ' + data
          }, {
            data: 10 + ' ' + data
          }, {
            data: 11 + ' ' + data
          }
        ];

        var table = new h54s.Tables(rows, 'data');

        sasAdapter.call('BounceData', table, function(err, res) {
          assert.isUndefined(err, 'We got error on sas program ajax call');
          assert.isDefined(res, 'Response is undefined');
          assert.equal(res.outputdata.length, 12, 'Received less rows than sent');
          for(var i = 0; i < res.outputdata.length; i++) {
            assert.equal(res.outputdata[i].DATA, rows[i].data, 'Row ' + i + ' is not the same in response');
          }
          done();
        });
      });
    });

    it('Test big table', function(done) {
      this.timeout(30000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      var str = getRandomAsciiChars(1000);
      var rows = [];

      //70kb
      for(var i = 0; i < 700; i++) {
        rows.push({
          data: i + str
        });
      }

      var table = new h54s.Tables(rows, 'data');

      sasAdapter.call('BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        assert.equal(res.outputdata.length, 700, 'Received less rows than sent');
        done();
      });
    });

    it('Test call method with SasData table, and check if all properties are set', function(done) {
      this.timeout(10000);

      var data = [
        {
          data: 'test'
        }
      ];

      var table = new h54s.SasData(data, 'data');

      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('bounceUploadData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.deepEqual(res.data, data, 'Bounce data is different');
        assert.isDefined(res.executingPid, 'Pid missing in response');
        assert.isDefined(res.logmessage, 'Logmessage missing in response');
        assert.isDefined(res.requestingPerson, 'RequestingPerson missing in response');
        assert.isDefined(res.requestingUser, 'RequestingUser missing in response');
        assert.isDefined(res.sasDatetime, 'SasDatetime missing in response');
        assert.isDefined(res.status, 'Status missing in response');
        assert.isDefined(res.usermessage, 'Usermessage missing in response');
        assert.isDefined(res.errormessage, 'Errormessage missing in response');
        done();
      });
    });

    it('Test SasData with multiple tables', function(done) {
      this.timeout(10000);

      var data1 = [
        {
          data: 'test 1'
        }
      ];
      var data2 = [
        {
          data: 'test 2'
        }
      ];

      var tables = new h54s.SasData(data1, 'data_one');
      tables.addTable(data2, 'data_two');

      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      sasAdapter.call('bounceUploadData', tables, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.deepEqual(res.data_one, data1, 'Bounce data1 is different');
        assert.deepEqual(res.data_two, data2, 'Bounce data2 is different');
        done();
      });
    });

    it('Test json character escape in SasData and empty string', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      var data = {
        c0: '"',
        c1: '\\',
        c2: '/',
        // we don't support new line with new CSV
        // it's commented out until we decide if it should be supported
        // c3: '\n',
        c4: '\t',
        c5: '\f',
        c6: '\r',
        c7: '\b',
        c8: ''
      };

      var table = new h54s.SasData([
        data
      ], 'data');

      sasAdapter.call('bounceUploadData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        //TODO: res.data[0] should be changed to res.outputdata[0] to be consistent with other methods
        assert.equal(res.data[0].c0, data.c0, 'Bounce data is different - c0');
        assert.equal(res.data[0].c1, data.c1, 'Bounce data is different - c1');
        assert.equal(res.data[0].c2, data.c2, 'Bounce data is different - c2');
        // assert.equal(res.data[0].c3, data.c3, 'Bounce data is different - c3');
        assert.equal(res.data[0].c4, data.c4, 'Bounce data is different - c4');
        assert.equal(res.data[0].c5, data.c5, 'Bounce data is different - c5');
        assert.equal(res.data[0].c6, data.c6, 'Bounce data is different - c6');
        assert.equal(res.data[0].c7, data.c7, 'Bounce data is different - c7');
        assert.equal(res.data[0].c8, data.c8, 'Bounce data is different - c8');
        done();
      });
    });

    it('Test old type of data transmission with application/x-www-form-urlencoded', function(done) {
      this.timeout(6000);
      var table = new h54s.Tables([{
        test: 'test'
      }], 'data');

      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot,
        useMultipartFormData: false,
        debug: true
      });

      sasAdapter.call('BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.deepEqual(res.outputdata[0].TEST, 'test', 'Bounce data is different');
        done();
      });
    });

    it('Test UTF-8 characters', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot,
        debug: true
      });

      var data = [{}],
          key = 'c0',
          j = 0;
      data[0][key] = '';

      // 32-0xFFFF characters - 200 in each column
      var i = 32;
      var k = 0;
      while(i < 0xFFFF) {
        if(data[k][key].length === 10) {
          // go to the next row
          if(j === 9) {
            k++;
            data.push({});
            j = 0;
            key = 'c0';
          } else {
            key = 'c' + (++j);
          }
          data[k][key] = '';
        }
        data[k][key] += String.fromCharCode(i);
        i++;
      }

      var table = new h54s.SasData(data, 'data');

      sasAdapter.call('bounceUploadData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        for(k = 0; k < data.length; k++) {
          for(key in data) {
            assert.equal(res.data[0][key], data[k][key], 'Bounce upload data is different for key: ' + key);
          }
        }
        done();
      });
    });

    it('Test file sending', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        metadataRoot: serverData.metadataRoot
      });

      var data = new h54s.SasData(new File(['some string'], 'some_file'), 'fileMacro');

      sasAdapter.call('bounceUploadFile', data, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        done();
      });
    });

  });
});
