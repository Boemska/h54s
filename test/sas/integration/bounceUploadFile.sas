/**********************************************************************************/
/*            This program is the first version of the file uploader adapter      */
/*                                                                                */
/**********************************************************************************/
%let baseDir = /pub/apps/devtest;
%include "&baseDir/h54s.sas";

%macro getUploadedFile;
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
%getUploadedFile;


data myoutput;
    set uploadInfo;
run;

%let logmessage=This is a test for Bojan;

%hfsHeader;
  %hfsOutDataset(infoDataset, work, myoutput);       
%hfsFooter;
