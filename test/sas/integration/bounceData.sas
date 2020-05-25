/**********************************************************************************/
/*            This program returns whatever data is passed to it in order to      */
/*            validate that the adapter is returning the same data it's given     */
/**********************************************************************************/
%bafGetDatasets;
resetline;

data myoutput;
    set data;
run;


%let logmessage=This is a test for Bojan;
%let errormessage=Oh dear, I hope this is not serious;

%bafHeader;
  %bafOutDataset(outputdata, work, myoutput);       
%bafFooter;

