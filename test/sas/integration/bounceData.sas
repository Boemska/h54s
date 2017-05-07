/**********************************************************************************/
/*            This program returns whatever data is passed to it in order to      */
/*            validate that the adapter is returning the same data it's given     */
/**********************************************************************************/

%let baseDir = /pub/apps/devtest;

* this now points to the latest development branch of h54s on apps ;
* TODO: make this parameter driven so we can have a test-only server context ;
%include "/pub/apps/devtest/h54s/sasautos/h54s.sas";

libname test '/pub/apps/devtest';

/*
%include "&baseDir/h54snew.sas";
%include "&baseDir/bounceData_include.sas";
*/
options mlogic;

%*SASXConvertTable(data, work, tblspec);
%*hfsGetDataset(jsonvarname=data, outlib=work, outdset=tblspec);
%put ********************************;
%put _all_;

%hfsGetDataset(data, work.tblspec);

%*hfsErrorCheck;

data myoutput;
    set tblspec;
    * STRINGDATE = put(THEDATE, datetime20.);
    * dt_JSDATE = datetime();
    * this is for bojan ;
/*
d1= '"';
d2= "\\";
d3= "\/";
d4= "\b";
d5= "\f";
d6= "\n";
d7= "\r";
d8= "\t";
*/
run;


%let logmessage=This is a test for Bojan;
%let errormessage=Oh dear, I hope this is not serious;

%hfsHeader;
  %hfsOutDataset(outputdata, work, myoutput);       
%hfsFooter;

