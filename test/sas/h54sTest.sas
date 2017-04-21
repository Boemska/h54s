/***************************************************************************/
/*     This program parses an input data structure called 'data' and       */
/*             then outputs the same data back for testing                 */
/***************************************************************************/

* EXPECTED INCLUDES
  data0-dataN for the data object
  h54s.sas from the build being tested
;

%hfsGetDataset(data,work.testdata);

* We will eventually have a breakpoint output
  here to mark the end of parsing and beginning
  of output
;

%hfsHeader;
  %hfsOutDataset(bounced, work, testdata);
%hfsFooter;
