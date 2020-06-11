# HTML5 Data Adapter for SAS&reg; (H54S)
[![npm version](https://badge.fury.io/js/h54s.svg)](https://badge.fury.io/js/h54s)
[![install size](https://packagephobia.now.sh/badge?p=h54s)](https://packagephobia.now.sh/result?p=h54s)
[![npm downloads](https://img.shields.io/npm/dm/h54s.svg?style=flat-square)](https://img.shields.io/npm/dm/h54s)
[![gitter chat](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/Boemska/h54s?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)


## What is H54S?

H54S facilitates and manages bi-directional communication between JavaScript based HTML5 Web Applications (Single Page Web Applications, Progressive Web Apps) and back-end services written in SAS that execute on either SAS Viya or SAS v9. The library aims to facilitate communication between Javascript-based UI developers and SAS developers, enabling them  to build and deploy secure, production ready Web Applications with as little friction as possible.


## Quick Start

This repository contains the **core H54S JavaScript library**. If you understand what this does, and just want to start creating an App, head over to our our **H54S React Seed App repository** for a choice of pre-integrated Create React App-based template applications that will make your development much, much easier.


#### Server Requirements

An instance of either:

- SAS Viya (3.4 or later, full deployment); or 
- SAS v9 Platform (v9.4) with Integration Technologies and a SAS Web Tier


#### Client Requirements

- A modern Web Browser (Chrome, Firefox, Safari, IE11+)

Google Chrome or Firefox are strongly recommended. For development, having Git and Node installed is also very useful.


## Why is it called H54S?

It started out as an abbreviation of 'HTML5 4 SAS'. Marketing isn't our strong point. We know it sounds like a strain of Bird Flu, but the project has been active under this name for a few years now so we're sticking to it. It's _almost_ memorable now.


## Great. How do I get started?

Using [git](https://git-scm.com/), clone this repository to somewhere local:

```
git clone https://github.com/Boemska/h54s
```

Then if you're a SAS developer, put your SAS hat on, and follow the instructions according which flavour of SAS you're working with.

## SAS Back End

_Note: You may notice that while the process differs, the code is exactly the same for both SAS Viya and SAS v9. **The design of H54S ensures that all applications built with it are portable between SAS v9 and SAS Viya, with no changes in code required to deploy or promote applications across the two platforms**_ 


1. Copy the `sasautos` directory to your SAS server. **On Viya** this is your Compute Server node, **on SAS v9** this is your Application Server context (e.g. SASApp) compute node. In this example we copied it to `/pub/apps/h54s/sasautos` on the compute node filesystem.

2. Register a new back-end code object. **On Viya** this is a File of type Job Definition, and can be registered through the SASJobExecution WebApp (`https://[yourViyaServer]/SASJobExecution/`). **On SAS v9** this is a Stored Process and can be registered through SAS Management Console or Enterprise Guide. In both cases you'll be registering the code object to a SAS folder that you have permission to write to. In both Viya and v9, I created mine in my user's `My Folder` location ("chris") and called it `myFirstService`:

3. Edit the code for the newly registered code object, and register the following code:

```sas
* get H54s (from wherever you placed it in step 1) ;
%include '/pub/apps/h54s/sasautos/h54s.sas';

* Process and receive datasets from the client ;
%bafgetdatasets();

* Do some SAS. Can be Anything. Just get some data;
data mydata;
  set sashelp.class;
run;

proc sort data=mydata;
  by name;
run;

* Return a resulting dataset to the client ;
%bafheader()
  %bafOutDataset(processed, work, myData)
%bafFooter()
```

4. Configure the output type for your newly registered code object.  

**On Viya**, right click on the job name and select properties. From the properties menu select "Parameters". Add the following parameter and then click save:
  * Name: `_output_type`
  * Default value: `html`
  * Field type: `Character`
  * Required: `false`

**On SAS v9**, make sure you enable Streaming Output as the output type. If you are using Enterprise Guide to do this, also be sure to check "Global Macro Variables" and uncheck "Include STP Macros" under the "Include code for" dropdown.

5. Execute the newly registered code. **On Viya** do this through the same SASJobExecution WebApp, by right clicking on the Job and selecting "Submit job". **On SAS v9** do this through the Stored Process WebApp, by logging on to [yourserver]/SASStoredProcess/, locating the job in the UI and clicking on it.

In both cases, you should see output similar to the following:

```json
{ "processed" : [{"Name":"Alfred","Sex":"M","Age":14,"Height":69,"Weight":112.5},{"Name":"Alice","Sex":"F","Age":13,"Height":56.5,"Weight":84},{"Name":"Barbara","Sex":"F","Age":13,"Height":65.3,"Weight":98},{"Name":"Carol","Sex":"F","Age":14,"Height":62.8,"Weight":102.5},{"Name":"Henry","Sex":"M","Age":14,"Height":63.5,"Weight":102.5},{"Name":"James","Sex":"M","Age":12,"Height":57.3,"Weight":83},{"Name":"Jane","Sex":"F","Age":12,"Height":59.8,"Weight":84.5},{"Name":"Janet","Sex":"F","Age":15,"Height":62.5,"Weight":112.5},{"Name":"Jeffrey","Sex":"M","Age":13,"Height":62.5,"Weight":84},{"Name":"John","Sex":"M","Age":12,"Height":59,"Weight":99.5},{"Name":"Joyce","Sex":"F","Age":11,"Height":51.3,"Weight":50.5},{"Name":"Judy","Sex":"F","Age":14,"Height":64.3,"Weight":90},{"Name":"Louise","Sex":"F","Age":12,"Height":56.3,"Weight":77},{"Name":"Mary","Sex":"F","Age":15,"Height":66.5,"Weight":112},{"Name":"Philip","Sex":"M","Age":16,"Height":72,"Weight":150},{"Name":"Robert","Sex":"M","Age":12,"Height":64.8,"Weight":128},{"Name":"Ronald","Sex":"M","Age":15,"Height":67,"Weight":133},{"Name":"Thomas","Sex":"M","Age":11,"Height":57.5,"Weight":85},{"Name":"William","Sex":"M","Age":15,"Height":66.5,"Weight":112}], "usermessage" : "blank", "logmessage" : "blank", "requestingUser" : "chris", "requestingPerson" : "Chris", "executingPid" : 1054, "sasDatetime" : 1906323243.9 , "status" : "success"}
```

This is good enough for now. Time for some Front End Development.



## HTML5 Front End

### ReactJS, or another 
### Vanilla Javascript

This is the most basic approach. Assuming that you have a local Web Server installed for development:

1. Create an `index.html` or start a new project in your chosen IDE.

2. Copy the `/dist/h54s.js` file to your project and include it. Your `index.html` might look like this:

```html
<!DOCTYPE html>
<html>
  <body>
    <script src="h54s.js"></script>
    <h1>Look Ma, Front End!</h1>
  </body>
</html>
```

For IE, you may need to add `<meta http-equiv="X-UA-Compatible" content="IE=edge;" />`.

3. *If you are hosting your index.html and project files from within a deployed static.war, or behind the same reverse proxy as your SPWA, you don't need this step. Otherwise, for most people:*

   Fire up your browser. This is where Chrome comes in handy, as it allows developers to disable [Same-Origin Policy](https://en.wikipedia.org/wiki/Same-origin_policy). To tell your browser to allow background requests to non-local pages while you develop, you need to start Chrome with the `--disable-web-security` command line flag.  For example, on Mac OS, first close Chrome and run the following in the Terminal:  `open /Applications/Google\ Chrome.app --args --disable-web-security`
When you see this warning, you're in business:

   ![Chrome with --disable-web-security](https://cloud.githubusercontent.com/assets/1783133/11691304/abd0cb1a-9e9a-11e5-8d5e-9706b62a272f.png)

3. Load your `index.html` page, Open Chrome Developer Tools (F12), Open the Console tab.

4. Create an instance of the adapter. In the console, try typing `h5`... Chrome should autocomplete to `h54s`, meaning the script is sourced correctly.

   Assuming your SAS webapp URIs are the default `SASStoredProcess` and `SASLogon`, the following should be enough to get you started:

```javascript
// Instantiate adapter. If SPWA was located at
// http://myServer:7980/SASStoredProcess/, you would do a
var adapter = new h54s({hostUrl: 'http://myServer:7980'});

// then create a dataset to send to SAS, which in JS is an
// object array that looks a bit like this
var myFirstTable = [
  { name: 'Allan', sex: 'M', weight: 101.1 },
  { name: 'Abdul', sex: 'M', weight: 133.7 }
];

// add it to a h54s SasData object
var data = new h54s.SasData(myFirstTable, 'datain');

// make your first call to SAS
adapter.call('/User Folders/Christopher Blake/My Folder/myFirstService', data, function(err, res) {
  if(err) {
    //Houston we have a problem
    console.log(err);
  } else {
    //res is an object returned from the server
    console.log(res);
  }
});
```
If you're logged into your SPWA and have a session cookie already, you should see this:

   ![h54s example](https://user-images.githubusercontent.com/1965454/84392706-9e084980-abf2-11ea-93d8-176521a749a6.gif)

Otherwise, if you're not logged in yet, you should see this:

   ![h54s logon error message](https://user-images.githubusercontent.com/1965454/84391619-2128a000-abf1-11ea-844e-f391e1e2c96a.png)

The easiest thing to do at this point is to log into your SPWA in another tab, refresh your page and try running the code again. However, if you're feeling adventurous you could skip ahead and try this in the console:

```javascript
adapter.login('mysasusername','mysaspassword'); // More on this later
```

Any queued `adapter.call()` calls should resume after a successful `adapter.login()`.

### What just happened? What did I do?

First, we registered a SAS program as either an STP or Job as a back-end service. When the "service" is called the program would do some SAS-based stuff (which given the power and flexibility of SAS could have been anything, from a secured lookup into a legacy mainframe-based system so you can pre-populate a form, to an on-the-fly Hadoop query built into your app). For this example, we just told it to select records from the good old `SASHELP.CLASS` into a new temporary dataset called `WORK.MYDATA`, sort it, and return the resulting dataset to the client as an object array called `processed`.

Then, from the Web side, we started a new project by creating an `index.html` page which sources the client-side `h54s.js` script. We then used the Chrome Dev Console to run some JavaScript code - to create a configured instance of the h54s Adapter, create a sample dataset, attach that dataset to a call to SAS as `datain`, fire it over, and use a simple function to either show us the dataset that was returned by SAS as `processed`, or have a look at any errors that might have occured.

Easy, right? Want to know more, read our [docs](./docs/)

## Development and Testing of JS adapter code

We love contributions!  If you'd like to get involved, check out the [build instructions](CONTRIBUTIONS.md).


## Any questions or comments? Come join the chat. [![Join the chat at https://gitter.im/Boemska/h54s](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/Boemska/h54s?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
