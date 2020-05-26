%let base = /pub/apps/h54s
%include("&base/sasautos/h54s.sas");

%bafheader;
    %bafOutDataset(toplevelUser, sashelp, class);
    %bafOutDataset(toplevelProcess, sashelp, class);
    %bafOutDataset(donutLev0, sashelp, class);
    %bafOutDataset(donutLev1, sashelp, class);
    %bafOutDataset(donutLev2, sashelp, class);
    %bafOutDataset(last30daysrpt, sashelp, class);
    %bafOutDataset(last30daysstp, sashelp, class);
%bafFooter;