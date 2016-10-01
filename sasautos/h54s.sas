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
%let h54sQuiet = ;

* to enable debug log output set this variable to blank
  otherwise set variable to * 
;
%let h54sDebug = *;

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
  * could do with a nicer way to check whether _WEBOUT is available ;
  %if (%symexist(_REPLAY) = 0) %then %do;
    %let h54starget=STDOUT;
  %end;
  %else %do;
    %let h54starget=_WEBOUT;
  %end;
  %PUT h54s ==> TARGET is  &h54starget.;
  %hfsQuietenUp;
%mend;

%checkEnvironment;

* this is where we parse the inward objects ;
%macro hfsGetDataset(jsonvarname, outdset) ;
  * keep quiet in the log;
  %hfsQuietenDown;
  
  * check if the jsonvarname sym EXISTS and if not then gracefully quit this macro ;
  %if (%symexist(&jsonvarname.0) = 0) %then %do;
    *abort macro execution and explain why;
    %global logmessage h54src;
    %let logmessage=H54S Exception - Input object &jsonvarname was not found;
    %let h54src=inputTableNotFound;
    %return;
  %end;

  * check if the array sent over was EMPTY and if so then gracefully quit this macro ;
  %if (%length(&&&jsonvarname.2) < 4) %then %do;
    *abort macro execution and explain why;
    %global logmessage h54src;
    %let logmessage=H54S Exception - Input object &jsonvarname contained no data ;
    %let h54src=inputTableEmpty;
    %return;
  %end;


* macvar0 will contain number of data tables and macvar1 onwards contains data structures ;
  %do jsonparseloop = 1 %to &&&jsonvarname.0 ;
    %if &jsonparseloop. = 1 %then %do ;
      data colattribs ;
&h54sDebug.putlog 'H54S: hfsGetDataset(): Passed preliminary checks';
&h54sDebug.putlog 'H54S:   Starting colattribs data step processing';
        length colname $32
               coltype $6
               collength 8
               string_colnames num_colnames date_colnames $32000
               length_statement $32000
               jsonString $32000
               ;
        retain string_colnames num_colnames date_colnames ""
               length_statement ""
               fmtname "$coltype"
               type "c"
               ;
* parse all regular expressions ;
* find rows ;
&h54sDebug.putlog "H54S:   Active element is : &jsonvarname&jsonparseloop. ";
        jsonString =  symget("&jsonvarname&jsonparseloop.");
&h54sDebug.putlog "H54S:   Prxparsing : &jsonvarname&jsonparseloop. ";
        rowregexid = prxparse('/(?<=\{).+?(?=\})/i') ;
        rowstart = 1 ;
        rowstop = length(strip(jsonString)) ;

        call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
&h54sDebug.putlog "H54S:   Processing: Metadata Header";

        do while (rowpos > 0) ;
          currentrow = substr(jsonString, rowpos, rowlen) ;
&h54sDebug.putlog "H54S:     Header Loop: Current row is " currentrow;
          lengthofcurrentrow = length(currentrow);
&h54sDebug.putlog "H54S:     Header Loop: Current row length is " lengthofcurrentrow;
          currentpairnum = 1 ;
          do until (scan(currentrow, currentpairnum, ",") = "") ;
            currentpair = scan(currentrow, currentpairnum, ",");
            varname = strip(compress(scan(currentpair, 1, ":"), '"')) ;
            varvalue = urldecode(strip(compress(scan(currentpair, 2, ":"), '"'))) ;
            if upcase(varname) = "COLNAME" then do ;
&h54sDebug.putlog "H54S:     Header Loop: Column name found: " varvalue;
              colname = upcase(varvalue) ;
            end ;
            else if upcase(varname) = "COLTYPE" then do ;
&h54sDebug.putlog "H54S:     Header Loop: Column type found: " varvalue;
              coltype = varvalue ;
              if upcase(varvalue) = "STRING" then length_prefix = "$" ;
              else length_prefix = "" ;
            end ;
                 
            else if upcase(varname) = "COLLENGTH" then do ;
&h54sDebug.putlog "H54S:     Header Loop: Column length found: " varvalue;
              collength = input(varvalue, 8.) ;
            end ;
            currentpairnum + 1 ;
          end ;
          if upcase(coltype) = "STRING" then do;					
&h54sDebug.putlog "H54S:     Header Loop: Adding " colname " to list of STRINGS";
            string_colnames = catx(" ", string_colnames, colname) ;
          end;
          else if upcase(coltype) = "NUM" then do;				
&h54sDebug.putlog "H54S:     Header Loop: Adding " colname " to list of NUMBERS";
            num_colnames = catx(" ", num_colnames, colname) ;
          end;
          else if upcase(coltype) = "DATE" then do;				
&h54sDebug.putlog "H54S:     Header Loop: Adding " colname " to list of DATES";
            date_colnames = catx(" ", date_colnames, colname) ;
          end;
          length_statement = catx(" ",length_statement, colname, length_prefix, collength);
          output ;
          call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
        end ;
        call symputx("string_colnames", string_colnames) ;
        call symputx("num_colnames", num_colnames) ;
        call symputx("date_colnames", date_colnames) ;
        call symputx("length_statement", length_statement) ;
        drop rowregexid rowstart rowstop rowpos rowlen currentrow currentpairnum currentpair
        varname varvalue length_statement length_prefix  string_colnames num_colnames date_colnames ;
&h54sDebug.putlog "H54S:     Header Loop: Finishing DATA step and loading into formats";
      run ;

      data _null_;
&h54sDebug.putlog "H54S:     After header loop - String cols: &string_colnames.";
&h54sDebug.putlog "H54S:     After header loop - Num cols: &num_colnames.";
&h54sDebug.putlog "H54S:     After header loop - Date cols: &date_colnames.";
      run; 

      proc format library=work cntlin=colattribs (keep = fmtname colname coltype type rename = (colname = start coltype = label)) ;
      run;

      data _null_;
&h54sDebug.putlog "H54S:     After Format load - HEADER PROCESSING COMPLETE";
      run; 

    %end ;

/*		The following section processes the non-metadata rows (actual data)
*/
    %else %do ;
      data jsontemptable&jsonparseloop. ;
&h54sDebug.putlog "H54S: Starting data step processing of data macro segments -> Segment # &jsonparseloop.";
        length &length_statement. ;
        length jsonString currentrow currentpair varvalue $32000;
        length coltype $10.;
      
        %if &string_colnames. ^= %then %do;
&h54sDebug.putlog "H54S: -> Segment # &jsonparseloop. contains strings";
          array string_colnames{*} &string_colnames. ;
        %end;		
        %if &num_colnames. ^= %then %do;
&h54sDebug.putlog "H54S: -> Segment # &jsonparseloop. contains numbers";
          array num_colnames{*} &num_colnames. ;	
        %end;		
        %if &date_colnames. ^= %then %do;
&h54sDebug.putlog "H54S: -> Segment # &jsonparseloop. contains dates";
          format &date_colnames. datetime20. ;
          array date_colnames{*} &date_colnames. ;
        %end;		

        jsonString = symget("&jsonvarname&jsonparseloop.");

&h54sDebug.putlog "H54S: -> Segment # &jsonparseloop.: Regular Expression Parsing starts ";
        rowregexid = prxparse('/(?<=\{).+?(?=\})/i') ;
        rowstart = 1 ;
        rowstop = length(strip(jsonString)) ;
        call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
        do while (rowpos > 0) ;
&h54sDebug.putlog "H54S: -> Segment # &jsonparseloop.: Regular Expression Parsing starts ";
* get current row ;
          currentrow = substr(jsonString, rowpos, rowlen) ;
&h54sDebug.putlog "H54S:  -> Segment # &jsonparseloop.: currentrow =>         " currentrow;
          currentpairnum = 1 ;
          do until (scan(currentrow, currentpairnum, ",") = "") ;
            currentpair = scan(currentrow, currentpairnum, ",") ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: assignment: currentpair =>         " currentpair;
            varname = upcase(strip(compress(scan(currentpair, 1, ":"), '"'))) ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: assignment: varname =>             " varname;
            varvalue = urldecode(strip(compress(scan(currentpair, 2, ":"), '"'))) ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: assignment: varvalue =>            " varvalue;
            coltype = upcase(put(varname, $coltype.)) ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: assignment: coltype =>             " coltype;

/*     Colnum is also used as a flag here - if there is a match it will set to 1, check inner if statements */
/*     As long as colnum is not 1 then the program will loop and search through.                            */
            colnum = 1 ;
            do until  (colnum=1); 
              if coltype = "STRING" then  do;
                %if &string_colnames. ^= %then %do;
                  if varname = upcase(vname(string_colnames(colnum))) then do ;
                    string_colnames(colnum) = varvalue ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: STRING: Assigned  " varname " in " string_colnames(colnum);
                    colnum = 1 ;
                    leave;
                  end;
                %end;
              end ;
              else if coltype = "NUM" then do;
                %if &num_colnames. ^= %then %do;
                  if varname = upcase(vname(num_colnames(colnum))) then do ;
                    num_colnames(colnum) = input(varvalue, best20.) ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: NUM   : Assigned  " varname " in " num_colnames(colnum);
                    colnum = 1 ;				
                    leave;
                  end ;
                %end;
              end ;
              else if coltype = "DATE" then do ;
                %if &date_colnames. ^= %then %do;
                  if varname = upcase(vname(date_colnames(colnum))) then do ;
                    date_colnames(colnum) = input(varvalue, 16.) ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: DATE  : Assigned  " varname " in " date_colnames(colnum);
                    colnum = 1 ;
                    leave;
                  end ;
                %end;
              end ;

              colnum + 1 ;
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: Incrementing colnum FROM " colnum; 
            end;	
&h54sDebug.putlog "H54S  -> Segment # &jsonparseloop.: Incrementing currentpairnum FROM " currentpairnum; 
            currentpairnum + 1 ;
          end ;
          output;
          /* set all vars back to missing to prevent retained
             SAS values when parsing incomplete JSON records  */
          call missing (%sysfunc(tranwrd(
            %sysfunc(compbl(
              &string_colnames &num_colnames &date_colnames
            )),%str( ),%str(,))
          ));
          call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
        end ;
        keep &string_colnames. &num_colnames. &date_colnames. ;
      run ;
    %end ;
  %end ;

  data &&outdset. ;
    set
    %do setloop = 2 %to &&&jsonvarname.0 ;
      jsontemptable&setloop.
    %end ;
;
  run ;

  proc datasets library=work nodetails nolist;
    delete jsontemptable: ;
  quit ;

* Come back ;
%hfsQuietenUp;
%mend ;



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

%macro hfsOutDataset(objectName, libn, dsn);
* keep quiet in the log;
  %hfsQuietenDown;

  * check if the specified dataset / view exists and if not then gracefully quit this macro ;
  %if (%sysfunc(exist(&libn..&dsn))=0 and %sysfunc(exist(&libn..&dsn,VIEW))=0) %then %do;
    *abort macro execution but first make sure there is a message;
    %global logmessage h54src;
    %let logmessage=ERROR - Output table &libn..&dsn was not found;
    %let h54src=outputTableNotFound;
    *output an empty object so that it does not break things ;
    data _null_;
      file &h54starget.;
      put '"' "&objectName." '" : [],';
    run;
    *quit this macro;
    %return;
  %end;


  data _null_;
    call symput('qc', '"');
    call symput('pf', "%upcase(&dsn)");
    call symput('dc', '$');
    call symput('dt_', 'dt_');
  run;

  proc sql noprint;
    create table tempCols as
    select upcase(name) as name, type, length from dictionary.columns 
    where upcase(memname)="%upcase(&dsn)" and libname="%upcase(&libn)";
  quit;

  %let totalCols = &sqlObs;

  proc sql noprint;
    select trim(name), trim(type), length into :name1-:name999, :type1-:type999, :length1-:length999
    from tempCols;
  quit;

  * get first and last column names;

  data tempCols;
    set tempCols end=lastcol;
    if _n_ = 1 then do;
      call symput('firstCol', strip(name));
    end;
    if lastcol then do;
      call symput('lastCol', strip(name));
    end;
  run;


  *create the urlencoded view here;
  proc sql noprint;
    create view tempOutputView as 
  select
  %do colNo= 1 %to &totalCols;
    %if &&&name&colNo = &lastCol %then %do;
      %if &&&type&colNo = char %then %do;
        urlencode(strip(&&&name&colNo)) as &&&name&colNo length=30000
      %end;
      %else %do;
        &&&name&colNo as &&&name&colNo
      %end;
    %end;
    %else %do;
      %if &&&type&colNo = char %then %do;
        urlencode(strip(&&&name&colNo)) as &&&name&colNo length=30000,
      %end;
      %else %do;
        &&&name&colNo as &&&name&colNo,
      %end;
    %end;
  %end;

  from &libn..&dsn.
  quit;


  *column types have changed so get metadata for output again;
  * TODO: This needs to be changed from dictionary cols to proc datasets
          so that there is an faster option for servers with many preassigned
          DBMS libs etc 
  ; 
  proc sql noprint;
    create table tempCols as
    select name, type, length from dictionary.columns where memname="TEMPOUTPUTVIEW" and libname = "WORK";
  quit;

  %let totalCols = &sqlObs;

  proc sql noprint;
    select trim(name), trim(type), length into :name1-:name999, :type1-:type999, :length1-:length999
    from tempCols;
  quit;


  *output to webout ;
  data _null_;
    file &h54starget.;
    put '"' "&objectName." '" : [';
  run;

  data _null_;
    file &h54starget.;
    set tempOutputView end=lastrec;
    format _all_;

    %do colNo= 1 %to &totalCols;
      %if &totalCols = 1 %then %do;
        %if &&&type&colNo = char %then %do;
          put '{"' "&&&name&colNo" '":"' &&&name&colNo +(-1) '"}';
          if not lastrec then put ",";
        %end;
      %if &&&type&colNo = num %then %do;
        if &&&name&colNo = . then put '{"' "&&&name&colNo" '":' 'null ' +(-1) '}';
        else put '{"' "&&&name&colNo" '":' &&&name&colNo +(-1) '}';
        if not lastrec then put ",";
        %end;
      %end;

      %else %if &&&name&colNo = &firstCol %then %do;
        %if &&&type&colNo = char %then %do;
          put '{"' "&&&name&colNo" '":"' &&&name&colNo +(-1) '",';
        %end;
        %if &&&type&colNo = num %then %do;
          if &&&name&colNo = . then put '{"' "&&&name&colNo" '":' 'null ' +(-1) ',';
          else put '{"' "&&&name&colNo" '":' &&&name&colNo +(-1) ',';
        %end;
      %end;

      %else %if &&&name&colNo = &lastCol %then %do;
        %if &&&type&colNo = char %then %do;
          put '"' "&&&name&colNo" '":"' &&&name&colNo +(-1) '"}';
          if not lastrec then put ",";
        %end;
        %if &&&type&colNo = num %then %do;
          if &&&name&colNo = . then put '"' "&&&name&colNo" '":' 'null ' +(-1) '}';
          else put '"' "&&&name&colNo" '":' &&&name&colNo +(-1) '}';
          if not lastrec then put ",";
        %end;
      %end;

      %else %do;
        %if &&&type&colNo = char %then %do;
          put '"' "&&&name&colNo" '":"' &&&name&colNo +(-1) '",';
        %end;
        %if &&&type&colNo = num %then %do;
          if &&&name&colNo = . then put '"' "&&&name&colNo" '":' 'null ' +(-1) ',';
          else put '"' "&&&name&colNo" '":' &&&name&colNo +(-1) ',';
        %end;
      %end;
    %end;
  run;

  data _null_;
    file &h54starget.;
    put '],';
  run;

  * delete the temporary tables ;
  proc datasets library=work nodetails nolist;
    delete tempOutputView tempCols ;
  quit ;

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
