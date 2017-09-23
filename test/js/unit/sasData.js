describe('h54s unit -', function() {
  describe('SAS Data test:', function() {

    it('Exceptions in tables', function(done) {
      proclaim.throws(function() {
        new h54s.Tables([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
        new h54s.SasData([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
      }, 'NaN value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
        new h54s.SasData([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
      }, 'Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {c: "Dummy Name", specialNumberVal: -Infinity}
        ], 'data');
        new h54s.SasData([
          {c: "Dummy Name", specialNumberVal: -Infinity}
        ], 'data');
      }, '-Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {d: "Dummy Name", boolVal: true}
        ], 'data');
      }, 'Boolean value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {e: "Dummy Name", boolVal: false}
        ], 'data');
        new h54s.SasData([
          {e: "Dummy Name", boolVal: false}
        ], 'data');
      }, 'Boolean value in one of the values (columns) is not allowed');

      proclaim.doesNotThrow(function() {
        new h54s.SasData([
          {num: 1, str: 'str'},
          {num: null, str: null}
        ], 'data');
      });

      done();
    });

    it('Convert table object test', function(done) {
      var expectedTable = {data: ['[{"colName":"prop1","colType":"string","colLength":3},{"colName":"prop2","colType":"num","colLength":8}]', '[{"prop1":"one","prop2":2}]']};
      var table = new h54s.Tables([{prop1: 'one', prop2: 2}], 'data');

      assert.deepEqual(table._tables, expectedTable, 'Wrong table');
      done();
    });

    it('Test parameter threshold', function(done) {
      var rows = [];

      //around 30kb after json stringivy
      for(var i = 0; i < 260; i++) {
        rows.push({
          data: getRandomAsciiLettersAndNumbers(100)
        });
      }

      var table = new h54s.Tables(rows, 'data');
      assert.equal(table._parameterThreshold, 30000, 'Threshold default value incorrect');
      assert.equal(table._tables.data.length, 2, 'Tables length not correct');

      table = new h54s.Tables(rows, 'data', 10000);
      assert.equal(table._tables.data.length, 4, 'Tables length not correct');

      table = new h54s.Tables(rows, 'data', 5000);
      assert.equal(table._tables.data.length, 7, 'Tables length not correct');

      table = new h54s.Tables(rows, 'data', 50000);
      assert.equal(table._tables.data.length, 2, 'Tables length not correct');

      done();
    });

    it('Test Files object', function(done) {
      var file = new File(['test'], 'testName', {type: 'text/plain;charset=UTF-8'});
      var files = new h54s.Files(file, 'macroName');

      assert.isDefined(files._files.macroName, 'File not set');
      done();
    });

    it('Test SasData object constructor with File', function(done) {
      var file = new File(['test'], 'testName', {type: 'text/plain;charset=UTF-8'});
      var sasData = new h54s.SasData(file, 'macroName');

      assert.isDefined(sasData._files.macroName, 'File not set');
      done();
    });

    it('Test SasData object constructor with Table', function(done) {
      var sasData = new h54s.SasData([{test: 1}], 'macroName');

      assert.isDefined(sasData._files.macroName, 'Table not set');
      done();
    });

    it('Test SasData CSV value', function(done) {
      var sasData = new h54s.SasData([
        {col1: 1},
        {col2: 'str'}
      ], 'macroName');

      var reader = new FileReader();
      reader.onload = function() {
        assert.equal(reader.result, '1,\n,"str"', 'Wrong csv string');
        done();
      };
      reader.readAsText(sasData._files.macroName[1]);
    });

    it('Test both Files and Tables in SasData object', function(done) {
      var sasData = new h54s.SasData([{test: 1}], 'macroName');

      var file = new File(['test'], 'testName', {type: 'text/plain;charset=UTF-8'});
      sasData.addFile(file, 'macroName');
      sasData.addFile(file, 'macro2Name');

      sasData.addTable([{test: 1}], 'macro2Name');

      assert.isDefined(sasData._files.macroName, 'Table not set');
      assert.isDefined(sasData._files.macro2Name, 'Table not set');

      assert.isDefined(sasData._files.macroName, 'File not set');
      assert.isDefined(sasData._files.macro2Name, 'File not set');
      done();
    });

    it('Test SasData specs', function(done) {
      var data = [{
        data1   : 'test',
        data2   : 1,
        dt_data3: new Date()
      }];

      var table = new h54s.SasData(data, 'data');
      assert.equal(table._files.data[0], 'data1,string,4|data2,num,8|dt_data3,date,8', 'Specs are not correct');
      done();
    });

    it('Test SasData custom specs', function(done) {
      var data = [{
        data1   : 'test',
        data2   : 1,
        dt_data3: new Date()
      }];

      var specs = {
        data1: {
          colType: 'string',
          colLength: 4
        },
        data2: {
          colType: 'num',
          colLength: 8
        },
        dt_data3: {
          colType: 'date',
          colLength: 8
        }
      };

      var table = new h54s.SasData(data, 'data', specs);
      assert.equal(table._files.data[0], 'data1,string,4|data2,num,8|dt_data3,date,8', 'Specs are not correct');

      proclaim.throws(function() {
        new h54s.SasData(data, 'data', []);
      }, 'Specs data type wrong. Object expected.', 'Wrong specs data type');
      proclaim.throws(function() {
        new h54s.SasData(data, 'data', {});
      }, 'Missing columns in specs data.', 'Specs object length wrong');
      proclaim.throws(function() {
        new h54s.SasData(data, 'data', Object.assign({}, specs, {data1: []}));
      }, 'Wrong column descriptor in specs data.', 'Column description wrong type');
      proclaim.throws(function() {
        new h54s.SasData(data, 'data', Object.assign({}, specs, {data1: 'wrong'}));
      }, 'Wrong column descriptor in specs data.', 'Column description wrong type');
      proclaim.throws(function() {
        new h54s.SasData(data, 'data', Object.assign({}, specs, {data1: {}}));
      }, 'Missing columns in specs descriptor.', 'Column description data missing');
      proclaim.throws(function() {
        specs.data1.colLength = 1;
        new h54s.SasData(data, 'data', specs);
      }, 'There is a specs mismatch in the array between values (columns) of the same name.', 'No error on wrong description colLength');
      proclaim.throws(function() {
        delete specs.data1.colLength;
        new h54s.SasData(data, 'data', specs);
      }, 'Missing columns in specs descriptor.', 'Column description data missing');
      proclaim.doesNotThrow(function() {
        new h54s.SasData(data, 'data');
      });
      proclaim.doesNotThrow(function() {
        var specs = {
          someNumber: {colType: 'num', colLength: 8},
          someString: {colType: 'string', colLength: 5},
          someDate: {colType: 'date', colLength: 8}
        };
        new h54s.SasData([
          {
            someNumber: 42.0,
            someString: 'Stuff',
            someDate: new Date()
          }
        ], 'data', specs);
      });
      done();
    });

  });
});

function byteLength(str) {
  // returns the byte length of an utf8 string
  var s = str.length;
  for (var i=str.length-1; i>=0; i--) {
    var code = str.charCodeAt(i);
    if (code > 0x7f && code <= 0x7ff) s++;
    else if (code > 0x7ff && code <= 0xffff) s+=2;
    if (code >= 0xDC00 && code <= 0xDFFF) i--; //trail surrogate
  }
  return s;
}
