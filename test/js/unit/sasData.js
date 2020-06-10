describe('h54s unit -', function() {
  describe('SAS Data test:', function() {

    it('Exceptions in tables', function(done) {
      proclaim.throws(function() {
        new h54s.SasData([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
      }, 'NaN value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
      }, 'NaN value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
      }, 'Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
      }, 'Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {c: "Dummy Name", specialNumberVal: -Infinity}
        ], 'data');
      }, '-Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {c: "Dummy Name", specialNumberVal: -Infinity}
        ], 'data');
      }, '-Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {d: "Dummy Name", boolVal: true}
        ], 'data');
      }, 'Boolean value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.SasData([
          {e: "Dummy Name", boolVal: false}
        ], 'data');
      }, 'Boolean value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
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
        assert.equal(reader.result, '1,\r\n,"str"', 'Wrong csv string');
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
      }, 'There is a specs length mismatch in the array between values (columns) of the same name. type/colType/val = string/string/test', 'No error on wrong description colLength');

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

    it('Test macro name validation', function(done) {
      proclaim.doesNotThrow(function() {
        new h54s.SasData([], 'data');
        new h54s.SasData([], 'data');
      });

      var name33 = new Array(33).fill('a').join('');
      var name32 = new Array(32).fill('a').join('');

      proclaim.doesNotThrow(function() {
        new h54s.SasData([], name32);
      });

      proclaim.throws(function() {
        new h54s.SasData([], name33);
      }, 'Table name too long. Maximum is 32 characters');


      proclaim.throws(function() {
        new h54s.SasData([], '1table');
      }, 'Table name starting with number or special characters');

      proclaim.throws(function() {
        new h54s.SasData([], '!table');
      }, 'Table name starting with number or special characters');

      proclaim.throws(function() {
        new h54s.SasData([], '@table');
      }, 'Table name starting with number or special characters');

      proclaim.throws(function() {
        new h54s.SasData([], '^table');
      }, 'Table name starting with number or special characters');

      proclaim.throws(function() {
        new h54s.SasData([], '~table');
      }, 'Table name starting with number or special characters');

      proclaim.doesNotThrow(function() {
        new h54s.SasData([], '_table');
      });


      proclaim.throws(function() {
        new h54s.SasData([], 'ta ble');
      }, 'Table name has unsupported characters');

      proclaim.throws(function() {
        new h54s.SasData([], 'ta!ble');
      }, 'Table name has unsupported characters');

      proclaim.throws(function() {
        new h54s.SasData([], 'ta/ble');
      }, 'Table name has unsupported characters');

      proclaim.throws(function() {
        new h54s.SasData([], 'ta:ble');
      }, 'Table name has unsupported characters');

      proclaim.doesNotThrow(function() {
        new h54s.SasData([], 'table1');
        new h54s.SasData([], 'ta0ble');
        new h54s.SasData([], 'ta9ble');
        new h54s.SasData([], 'ta_ble');
        new h54s.SasData([], '_ta_ble_');
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

    if (code > 0x7f && code <= 0x7ff) {
      s++;
    } else if (code > 0x7ff && code <= 0xffff) {
      s+=2;
    }

    if (code >= 0xDC00 && code <= 0xDFFF) {
      i--; //trail surrogate
    }
  }
  return s;
}
