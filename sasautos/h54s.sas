/************************************************************************/
/*            Parser and Generator for v1 of the Adapter                */
/*                                                                      */
/************************************************************************/

* check if we are in debug mode and delimit data with -h54s-- tags ;
%global h54sDebuggingMode;
%let h54sDebuggingMode = 0;
%global _debug;

%global isSASViya;
%let isSASViya = 0;

data _null_;
  major = substr(symget("SYSVER"), 1, find(symget("SYSVER"), ".")-1);         
  if major eq "V" then call symput('isSASViya', 1);
  else call symput('isSASViya', 0);
run;


%macro bafCheckDebug;
  %if %symExist(_debug) %then %do;
    %if &_debug = 131 %then %do;
      %let h54sDebuggingMode = 1;
    %end;
  %end;
%mend;

%bafCheckDebug;

%GLOBAL h54sQuiet h54sDebug h54ssource h54ssource2 h54slrecl h54snotes h54starget;

* to enable quiet mode (minimal log output) set variable to blank 
  otherwise set variable to *. See around 10 lines below for what it does 
;
%let h54sQuiet = ;

* to enable debug log output set this variable to blank
  otherwise set variable to * 
;
%let h54sDebug = *;

%macro bafQuietenDown;
  %&h54sQuiet.let h54ssource=%sysfunc(getoption(source));
  %&h54sQuiet.let h54ssource2=%sysfunc(getoption(source2));
  %&h54sQuiet.let h54slrecl=%sysfunc(getoption(lrecl));
  %&h54sQuiet.let h54snotes=%sysfunc(getoption(notes));
  &h54sQuiet.options nosource nosource2 nonotes;
%mend;

%macro bafQuietenUp;
  &h54sQuiet.options &h54ssource &h54ssource2 lrecl=&h54slrecl &h54snotes; 
%mend;

* Go quiet and avoid all the garbage in the log ;
%bafQuietenDown;
* Go loud;
%bafQuietenUp;

%macro bafGetDatasets();
  /*
  _WEBIN_NAME has the name of each parameter for the counterpart spec
  _WEBIN_FILE_COUNT has the total number of files. If 1 then we need no suffix
  */
  %if %symexist(_webin_file_count) = 0 %then %do;
    %return;
  %end;

  %put h54s ==> WEBIN FILE COUNT IS &_WEBIN_FILE_COUNT.;

  /*
  bafpn is the index of a file described as FILE
  bafxn is the index of a file described as XML
  global vars initialised
  */
  %global bafpn;
  %global bafxn;
  %let bafpn=;
  %let bafxn=;

  /* baftn is the index of the file (table) being iterated over */
  %do files = 1 %to &_WEBIN_FILE_COUNT;
    %if &_WEBIN_FILE_COUNT = 1 %then %let baftn=;
    %else %do;
      %let baftn=&files.;
    %end;

    /* references to file and spec */
    %let thisobj=&&_WEBIN_name&baftn;
    %let testspec=&&&&&&_WEBIN_name&baftn.;

    %put h54s ==> Evaluating filename &&&&_WEBIN_name&baftn;
    /* if a spec comes back as a FILE then it is not a table */
    %if (%UPCASE("&&&&&&_WEBIN_name&baftn.") eq "FILE") %then %do;
      %if (%UPCASE("&&&&_WEBIN_name&baftn.") eq "MYFILE") %then %do;
        %let bafpn=&baftn.;
        %put Found MYFILE (program) as input number &baftn.;
      %end;
      %else %if (%UPCASE("&&&&_WEBIN_name&baftn.") eq "XML") %then %do;
        %let bafxn=&baftn.;
        %put Found XML (meta query) as input number &baftn.;
      %end;
    %end;
    %else %do;

      /* build data step length and input statements for this input table */
      data _null_;
        length spec $32767;
        length lenspec $50;
        length varname $32;
        spec=symget(symget(cats("_WEBIN_NAME","&baftn.")));
        /* viya 3.5 */ 
        spec=prxchange("s/\%([\'\""\%\(\)])/$1/", -1 , prxchange('s/^\%nrstr\((.*)\)/$1/s', -1, spec));
        
        put spec=;
        colcount=countw(spec, '|');

        do c=1 to colcount;
          lenspec=scan(spec, c, '|');
          varname=upcase(scan(lenspec,1,','));
          select (scan(lenspec, 2, ','));
              when ('num') do;
                indef=varname!!':best16.';
              end;
              when ('string') do;
                indef=cats(varname,':$',scan(lenspec, 3, ','),'.');
              end;
          end;


          * length statement specification here ;
          lname=cats('lens', c);
          * call symputx(lname, lendef, 'L');

          * input statement specification here ;

          pname=cats('cols', c);
          call symputx(pname, indef, 'L');
          output;
        end;
        call symputx('totalcol', colcount);
      run;

      /* parse the actual input data */

  * options mprint mlogic symbolgen;
  %put h54s --- START DESERIALISING TABLE &&_WEBIN_name&baftn. ;
  %put h54s --- TABLE FILENAME IS &&_WEBIN_FILEREF&baftn. ;

    %if &isSASViya eq 1 %then %do;

      filename thisfile filesrvc "&&_WEBIN_FILEURI&baftn." ;	
      data "&&_WEBIN_name&baftn."n;
        INFILE thisfile LRECL=32767 recfm=v dsd;
        input %do j=1 %to &totalcol.;
        &&cols&j.
        %end;
        ;
      run;

    %end;
    %else %do;

      data "&&_WEBIN_name&baftn."n;
        INFILE &&_WEBIN_FILEREF&baftn. LRECL=32767 recfm=v dsd;
        input %do j=1 %to &totalcol.;
        &&cols&j.
        %end;
        ;
      run;
      
    %end;

  %put h54s --- FINISH DESERIALISING TABLE &&_WEBIN_name&baftn. ;

    %end;
  %end;

  %put h54s ==> === SUMMARY OF DESERIALISED INPUT TABLES === ;
    proc sql noprint;
    %do files = 1 %to &_WEBIN_FILE_COUNT;
        %if &_WEBIN_FILE_COUNT eq 1 %then %do;
            %let baftn=;
        %end;
        %else %do;
            %let baftn=&files.;
        %end;
      %if &baftn ne &bafpn and &baftn ne &bafxn %then %do;
        describe table "&&_WEBIN_name&baftn."n;
      %end;
    %end;
    %put h54s ==> === END SUMMARY ===;
    quit;

%mend;

%macro bafOutDataset(outputas, outlib, outdsn);

  data _null_;
    file thiscall mod;
    put '"' "&outputas." '" : ';
  run;

  filename thisjson temp;

  proc json out=thisjson; 
    export &outlib..&outdsn. / nosastags;
  run;

  data _null_;
     length data $1;
     INFILE thisjson recfm=n;
     file thiscall  recfm=n mod;
     input data  $char1. @@;
     put data $char1. @@;
  run;

  filename thisjson clear;

  data _null_;
    file thiscall mod;
    put ',';
  run;
%mend;
  
%macro bafOutSingleMacro(objectName,singleValue);
* Note: Use this with care, not best practice. Not quoted, so always quote string JS variables. 
        It is risky outputting macro vars raw. I personally would not do it.
;
  data _null_;
    file thiscall mod;
    put '"' "&objectName." '" : "' "&singleValue." '",' ;
  run;
* Come back ;
%mend;


%macro bafHeader();
  filename thiscall temp;
  * keep quiet in the log;
  data _null_;
    file thiscall mod;
    * uncomment these if working with v8 SAS/IntrNet broker ;
    *put "Content-type: text/html";
    *put;
    %*hfsCheckDebug;
    %if &h54sDebuggingMode = 1 %then %do;
      put "--h54s-data-start--";
    %end;
    put '{';
  run;
* Come back ;
%mend;



%macro bafFooter();
  * keep quiet in the log;
  /* %bafQuietenDown; */

  %if (%symexist(usermessage) = 0) %then %do;
    %let usermessage = blank;
  %end;

  %if (%symexist(logmessage) = 0) %then %do;
    %let logmessage = blank;
  %end;

  %if (%symexist(h54src) = 0) %then %do;
    %let h54src = success;
  %end;



  %if &isSASViya eq 1 %then %do;
    data _null_;
      file thiscall mod;
      sasdatetime=datetime();
      put '"usermessage" : "' "&usermessage." '",';
      put '"logmessage" : "' "&logmessage." '",';
      put '"requestingUser" : "' "&SYS_COMPUTE_SESSION_OWNER." '",';
      put '"requestingPerson" : "' "&SYS_COMPUTE_SESSION_OWNER." '",';
      put '"executingPid" : ' "&sysjobid." ',';
      put '"sasDatetime" : ' sasdatetime ',';
      put '"status" : "' "&h54src." '"}';
      put;

      %if &h54sDebuggingMode = 1 %then %do;
        put "--h54s-data-end--";
      %end;
    run;

    * http://support.sas.com/kb/20/784.html ;
    data _null_;
      length data $1;
      INFILE thiscall recfm=n;
      file _webout  recfm=n mod;
      input data  $char1. @@;
      put data $char1. @@;
    run;  

  %end;
  %else %do;
    data _null_;
      file thiscall mod;
      sasdatetime=datetime();
      put '"usermessage" : "' "&usermessage." '",';
      put '"logmessage" : "' "&logmessage." '",';
      put '"requestingUser" : "' "&_METAUSER." '",';
      put '"requestingPerson" : "' "&_metaperson." '",';
      put '"executingPid" : ' "&sysjobid." ',';
      put '"sasDatetime" : ' sasdatetime ',';
      put '"status" : "' "&h54src." '"}';
      put;

      %if &h54sDebuggingMode = 1 %then %do;
        put "--h54s-data-end--";
      %end;
    run;

    * http://support.sas.com/kb/20/784.html ;
    data _null_;
      length data $1;
      INFILE thiscall recfm=n;
      file _webout  recfm=n mod;
      input data  $char1. @@;
      put data $char1. @@;
    run;
  %end;

  * Come back ;
  %bafQuietenUp;

%mend;
