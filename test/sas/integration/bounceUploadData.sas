/**********************************************************************************/
/*            This program loads the default values for the usage dashboard       */
/*                                                                                */
/**********************************************************************************/

* this now points to the latest development branch of h54s on apps ;
* TODO: make this parameter driven so we can have a test-only server context ;
%include "/pub/apps/devtest/h54s/sasautos/h54sdev.sas";
libname test '/pub/apps/devtest';
libname dudbdat '/pub/apps/allianz/dudbdat';



%macro getUploadedFileInfo;
* this macro should create a dataset that holds the info for any
  files that were uploaded to the STP server as part of the 
  POST request;
  data uploadInfo;
    length name fileref filename fileext content_type content_length debug_inputnumber $256;
    
    %do i = 1 %to &_WEBIN_FILE_COUNT;
      %if &i = 1 %then %let tn=; 
      %else %let tn=&i.;
      name = "&_WEBIN_name.&tn.";
      fileref = "&_WEBIN_fileref.&tn.";
      filename = "&_WEBIN_filename.&tn.";
      fileext = "&_WEBIN_fileext.&tn.";
      content_type = "&_WEBIN_content_type.&tn.";
      content_length = "&_WEBIN_content_length.&tn.";
      debug_inputnumber="&tn.";
      output;
    %end;
  run;

%mend;
%getUploadedFileInfo;


%macro deserialiseFile;
  %do i = 1 %to &_WEBIN_FILE_COUNT;
      %if &_WEBIN_FILE_COUNT = 1 %then %let tn=; 
      %else %let tn=&i.;

      %let thefile=%sysfunc(pathname(&_WEBIN_FILEREF&tn.));
   
/* 
so 
_WEBIN_NAME has the name of each parameter for the counterpart spec
_WEBIN_FILE_COUNT has the total number of files. If 1 then we need no suffix
*/

    filename testfile "&thefile." ;

/* this is the debug bit for bojan  */

   filename debfile "/pub/ht/debug/jsonin_&tn";
    data _null_;
    file debfile;
    infile testfile; 
    input;
    put _infile_;
    run;

    data _null_;
      file "/pub/ht/debug/specin_&tn";  
      put "&&&_WEBIN_name&tn";
    run;

    %let testspec=&&&_WEBIN_name&tn.;


data _null_;
  length spec $32000.;
  length coldef $100.;
  length colspec $40.;
  spec=symget('testspec');
  colcount=countw(spec,'|');
  put spec=;
  put colcount=;
  do c = 1 to colcount;
    colspec = scan(spec,c,'|');
    put colspec=;
    select (scan(colspec,2,','));
      when ('num')  coldef = cat("@'""",scan(colspec,1,','),""":' ", scan(colspec,1,','), " : 8.");
      when ('string')  coldef = cat("@'""",scan(colspec,1,','),""":' ", scan(colspec,1,','), " : $",cats(scan(colspec,3,','),'.'));
    end; 
    mname = cats('cols',c);
    call symputx(mname,coldef,'L');
    output;
  end;
  call symputx('totalcol',colcount);
run;

data dudbdat.randomfile;
  INFILE testfile LRECL = 999999999 recfm=v dsd dlm=",}";
  INPUT
    %do I = 1 %to &totalcol.;
    &&&cols&I.
    %end;
    @@;
run;


/*
    data _null_;
      file _webout;
      put '"' "&_WEBIN_name&tn." '" : ';
    run;

    data _null_;
      file _webout;
      infile "&thefile.";
      input;
      put;
      put _infile_;
    run;

    data _null_;
      file _webout;
      put ',';
    run;
*/



  %end;
%mend;

%macro newoutputds(outputas, outlib, outdsn);

data _null_

  data _null_;
    file _webout;
    put '"' "&outputas." '" : ';
  run;

  proc json out=_webout ;
    export &outlib..&outdsn. / nosastags;
  run;

  data _null_;
    file _webout;
    put ',';
  run;

%mend;

  %deserialiseFile;

data myoutput;
    set uploadInfo;
run;

%let logmessage=This is a test for Bojan;

%hfsHeader;
  %newoutputds(infoDataset, work, myoutput);       
  %newoutputds(data, dudbdat, randomfile);       
%hfsFooter;
