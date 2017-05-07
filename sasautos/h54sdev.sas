/*******************************************************************************
 * Boemska HTML5 Data Adapter for SAS v3.1  http://github.com/Boemska/h54s     *
 *    Copyright (C) 2015 Boemska Ltd.       http://boemskats.com/h54s          *
 *******************************************************************************
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *                               VERSION HISTORY
 *
 *     Date      Version                        Notes                          
 * ------------ --------- ----------------------------------------------------
 *  Oct 2012     1.0       Deserialisation with no support from the front end
 *                         making 3 passes to generate metadata at back end.
 *                         Entirely SAS Macro based parser.                
 *
 *  Sep 2013     2.0       Rewritten with a Javascript-based Table Metadata 
 *                         generator. Down to 1 pass. 2.5x increase in 
 *                         performance.   
 *
 *  Mar 2014     3.0       Almost a complete rewrite of the parser, now using 
 *                         PRXPARSE and PROC FORMAT. 40-60x increase in 
 *                         performance. (with thanks to Hadley Christoffels)
 *
 *  Dec 2014     3.1       Moving entirely away from Macro-based processing
 *                         to avoid quoting issues, partial rw to use SYMGET 
 *                         and data step.   (wih thanks to Prajwal Shetty D)
 *
 *  Dec 2015     3.2       Changed _WEBOUT to be variable, added hfsErrorCheck
 *                         and errorchecking in hfsGet and hfsOut to enable  
 *                         processing to be stopped with unexpected input 
 *
 *          LATEST VERSION ALWAYS AVAILABLE ON github.com/Boemska/h54s 
 *
 * Macro Quick Reference:
 * ===================== 
 *
 * %hfsGetDataset(jsonvarname, outdset);
 *      This macro deserialises a JavaScript data object into a SAS table.
 *        jsonvarname:  the name given to the table array from the front end,
 *                      coresponding to macroName in the 
 *                      h54s.Tables(tableArray, macroName) example
 *        outdset:      the name of the target dataset that the tableArray is 
 *                      to be deserialised into
 *
 * %hfsHeader;
 *      This macro prepares the output stream for data object output. 
 *      Conceptually similar to %STPBEGIN.
 * 
 * %hfsOutDataset(objectName, libn, dsn);
 *      This macro serialises a SAS dataset to a JavaScript data object.
 *        objectName:   the name of the target JS object that the table will be
 *                      serialised into
 *        libn:         the libname of the source table to be serialised 
 *        dsn:          the dataset name of the source table to be serialised
 * 
 * %hfsFooter;
 *      This macro closes the output stream for data objects. 
 *      Counterpart to %hfsHeader. Conceptually similar to %STPEND. 
 * 
 * The other macros defined here are still in development, and although
 * useful they are not complete and should be used with caution.
 * 
 */

%GLOBAL h54sQuiet h54sDebug h54ssource h54ssource2 h54slrecl h54snotes h54starget;

* to enable quiet mode (minimal log output) set variable to blank 
  otherwise set variable to *. See around 10 lines below for what it does 
;
%let h54sQuiet = * ;

* to enable debug log output set this variable to blank
  otherwise set variable to * 
;
%let h54sDebug = ;

%&h54sDebug.put H54S Debug Mode is Enabled;
%&h54sQuiet.put H54S Quiet Mode is Enabled;


* This macro stores the current values for some of the log level system 
  options so that they can be restored afte processing is complete. Controlled
  by the h54sQuiet macro var above ;
%macro hfsQuietenDown;
  %&h54sQuiet.let h54ssource=%sysfunc(getoption(source));
  %&h54sQuiet.let h54ssource2=%sysfunc(getoption(source2));
  %&h54sQuiet.let h54slrecl=%sysfunc(getoption(lrecl));
  %&h54sQuiet.let h54snotes=%sysfunc(getoption(notes));
  &h54sQuiet.options nosource nosource2 nonotes;
%mend;

%macro hfsQuietenUp;
  &h54sQuiet.options &h54ssource &h54ssource2 lrecl=&h54slrecl &h54snotes; 
%mend;

           
* Go quiet and avoid all the garbage in the log ;
%hfsQuietenDown;

options NOQUOTELENMAX LRECL=32000 spool;

* check if _WEBOUT exists, if not then this is a test or interactive session ;


%macro checkEnvironment;
  %hfsQuietenDown;
  * set this to whatever your test harness is configured to ; 
  %let batchOutFile='/tmp/h54sTest.out';
  * could do with a nicer way to check whether _WEBOUT is available ;
  %if (%symexist(_REPLAY) = 0) %then %do;
    %let h54starget=&batchOutFile.;
  %end;
  %else %do;
    %let h54starget=_WEBOUT;
  %end;
  %PUT h54s ==> TARGET is  &h54starget.;
  %hfsQuietenUp;
%mend;

%checkEnvironment;

* check if we are in debug mode and delimit data with -h54s-- tags ;
%global h54sDebuggingMode;
%let h54sDebuggingMode = 0;

%macro hfsCheckDebug;
  * keep quiet in the log;
  %hfsQuietenDown;
  %if %symExist(_debug) %then %do;
    %if &_debug = 131 %then %do;
      %let h54sDebuggingMode = 1;
    %end;
  %end;
* Come back ;
%hfsQuietenUp;
%mend;


%macro hfsHeader();
  * keep quiet in the log;
  %hfsQuietenDown;
  data _null_;
    file &h54starget.;
    * uncomment these if working with v8 SAS/IntrNet broker ;
    *put "Content-type: text/html";
    *put;
    %hfsCheckDebug;
    %if &h54sDebuggingMode = 1 %then %do;
      put "--h54s-data-start--";
    %end;
    put '{';
  run;
* Come back ;
%hfsQuietenUp;
%mend;

%macro hfsFooter();
  * keep quiet in the log;
  %hfsQuietenDown;
  %if (%symexist(usermessage) = 0) %then %do;
    %let usermessage = blank;
  %end;

  %if (%symexist(logmessage) = 0) %then %do;
    %let logmessage = blank;
  %end;

  %if (%symexist(h54src) = 0) %then %do;
    %let h54src = success;
  %end;

  data _null_;
    file &h54starget.;
    sasdatetime=datetime();
    put '"usermessage" : "' "&usermessage." '",';
    put '"logmessage" : "' "&logmessage." '",';
    put '"requestingUser" : "' "&_metauser." '",';
    put '"requestingPerson" : "' "&_metaperson." '",';
    put '"executingPid" : ' "&sysjobid." ',';
    put '"sasDatetime" : ' sasdatetime ',';
    put '"status" : "' "&h54src." '"}';
    put;

    %if &h54sDebuggingMode = 1 %then %do;
      put "--h54s-data-end--";
    %end;
  run;

* Come back ;
%hfsQuietenUp;

%mend;

%macro hfsOutSingleMacro(objectName,singleValue);
* keep quiet in the log;
  %hfsQuietenDown;
* Note: Use this with care, not best practice. Not quoted, so always quote string JS variables. 
        It is risky outputting macro vars raw. I personally would not do it.
;
  data _null_;
    file &h54starget.;
    put '"' "&objectName." '" : ' "&singleValue." ',' ;
  run;
* Come back ;
%hfsQuietenUp;
%mend;


* this macro is a stub that needs further testing with earlier versions of SAS. 
  It needs to escape the rest of the program after outputting its message as to 
  return a standardised error object 
;
%macro hfsErrorCheck;
* keep quiet in the log;
%hfsQuietenDown;
  %if (%symexist(h54src) ne 0) %then %do;
    %if "&h54src" ne "0" %then %do;
      %hfsHeader;
      %hfsFooter;
      ENDSAS;
    %end;
  %end;

* Come back ;
%hfsQuietenUp;
%mend;


%hfsQuietenUp;
