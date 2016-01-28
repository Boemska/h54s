"use strict";

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

module.exports = function (execFile, log) {
  var child = childProcess.execFile(execFile, ['-stdio']);

  //create files, or remove data if they exist
  if(log) {
    fs.writeFile(path.join(__dirname, '..', 'log', 'sas-out.log'), '');
    fs.writeFile(path.join(__dirname, '..', 'log', 'sas-err.log'), '');
  }

  return new Promise((fulfill, reject) => {
    var outData = '',
        errData = '',
        startTime,
        readTime,
        parseTime,
        outputTime;

    function stdoutCallback(chunk) {
      outData += chunk.toString();

      if(log) {
        fs.appendFile(path.join(__dirname, '..', 'log', 'sas-out.log'), chunk.toString());
      }

      if(chunk.toString().indexOf('--h54s-read-end--') === 0) {
        startTime = Date.now();
        readTime = Date.now() - startTime;
      }

      if(chunk.toString().indexOf('--h54s-data-start--') === 0) {
        startTime = Date.now();
        parseTime = Date.now() - startTime;
      }

      if(chunk.toString().indexOf('--h54s-data-end--') !== -1) {
        outputTime = Date.now() - startTime;
      }
    }
    function stderrCallback(chunk) {
      var patt = /(\d+\s+)?(%put )?--codeend--;?/g;
      var scriptEnded = patt.test(chunk.toString());

      if(log) {
        fs.appendFile(path.join(__dirname, '..', 'log', 'sas-err.log'), chunk.toString());
      }

      if(scriptEnded) {
        fulfill({
          out: outData,
          readTime: readTime,
          parseTime: parseTime,
          outputTime: outputTime
        });
        child.stdout.removeListener('data', stdoutCallback);
        child.stderr.removeListener('data', stderrCallback);
        child.kill();
      } else {
        errData += chunk.toString();
        if(errData.indexOf('ERROR') !== -1) {
          //throw new error with message from sas
          reject(new Error(errData.match(/(.*\n){5}ERROR[^\n]*/)[0]));
        }

        //done loading autoexec?
        if(chunk.toString().indexOf('processing completed') !== -1) {
          child.stdin.write('%let _debug=131;\n');

          startTime = Date.now();

          child.stdin.write(`%include '${path.join(__dirname, '..', 'generated.sas')}';\n`);

          fs.readFile(path.join(__dirname, '../../../', 'sasautos', 'h54s.sas'), (err, data) => {
            if(err) {
              console.log(err);
              return;
            }
            var h54sSasContent = data.toString().replace(/%let\sbatchOutFile.+;/g, '%let batchOutFile=STDOUT;');
            child.stdin.write(h54sSasContent);

            //flag for time measure
            child.stdin.write(`
              data _null_;
                file &h54starget.;
                put "--h54s-read-end--";
              run;
            `);

            child.stdin.write(`%include '${path.join(__dirname, '..', 'h54sTest.sas')}';\n`);
            child.stdin.write('%put --codeend--;\n');
          });
        }
      }
    }

    child.stdout.on('data', stdoutCallback);
    child.stderr.on('data', stderrCallback);
  });
}
