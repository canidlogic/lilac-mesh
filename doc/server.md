# Lilac Mesh Editor HTTP Server

The main Lilac Mesh Editor application is a client-side JavaScript web application.  However, this client-side web application must be served to the web browser using a special HTTP server that is bundled with the Lilac Mesh Editor.  This document describes the special HTTP server.

Note that the special HTTP server is __not__ designed to be used on the open internet.  It is intended to run on the local machine, so that the web browser accesses a local port of `localhost`.  The special HTTP server provides some extra file-system access features through a virtual file system.  These features are not available through standard client-side JavaScript due to security restrictions.

## 1. Architecture

The special HTTP server is contained within the `lilacme.js` script.  This is a Node.js script [\[NODE\]][node] that must be invoked from the Node runtime rather than from within a browser.  The server script begins with a `#!` shebang line that invokes `/user/bin/env node` so that the script file can be run like an executable program under a Unix shell with `./lilacme.js`, provided that executable permissions have been added to the file with `chmod +x lilacme.js`

See the documentation at the top of the `lilacme.js` script file for the details of how to invoke the server script and what command-line parameters are required.

The `lilacme.js` script must be in the same directory as an "HTTP manifest" file named `lilacme_manifest.json`.  The format of this manifest file is described in &sect;2 Manifest.  The server will begin by loading this manifest file, and then loading all files referenced from this manifest into a virtual file system that it stores in memory.  The details of this virtual file system are described in &sect;3 Virtual file system.

Additionally, the `lilacme.js` script must be in the same directory as a compiled `lilacme2json` program binary.  The source code of this program is in the `util` directory.  This is used to convert Shastina mesh files into the JSON format used by the mesh editor.  For Windows compatibility, this program binary may also be named `lilacme2json.exe`.

The server script will then open an HTTP server on a local port of the local machine and report a web address to the user.  The user then navigates to that local web address in the web browser.  This will load the client-side Lilac Mesh Editor into the web browser from the virtual file system of the server script.  The virtual file system includes all the necessary configuration information for the client-side web application, so the user does not have to do any manual configuration of the web application.

The HTTP server script gives the client-side Lilac Mesh Editor webapp the ability to save the mesh file to the local file system path that was provided as a command-line parameter to the server script.  This is handled through the virtual file system (&sect;3).

The HTTP server script also gives the client-side Lilac Mesh Editor a method to gracefully shut down the HTTP server once the user is finished with the application.  This is also handled through the virtual file system (&sect;3).

Alternatively, the user can use `CTRL+C` to interrupt the server script with a signal.  This is not the preferred way to shut down the server, but it is provided in case there is a problem accessing the server through the web browser.

## 2. Manifest

The HTTP manifest file is a special configuration file named `lilacme_manifest.json` that must be present in the same directory as the `lilacme.js` server script.  The server script loads this manifest file and uses it to construct most (but not all) of the virtual file system (&sect;3).  See &sect;1 Architecture for more about how the HTTP manifest file fits into the architecture of the application.

The HTTP manifest file is a [\[JSON\]][json] text file with a specific structure described in this section.  The top-level entity in the JSON file must be an object.  This object is interpreted as an associative array mapping string keys to object values called _categories_.  The string keys in this top-level object are file extensions (without a period at the beginning), which define the types of files that the virtual file system contains.  For example, there may be a `js` category for files with a `.js` extension that the server serves as JavaScript modules.

There may also be a special string key in the top-level object which is simply a period character `.` by itself.  This is used when the client requests the root document `/` of the virtual file system.  This is important because it is the first document that the client normally navigates to (unless they specifically request some other file in the virtual file system).

All string keys in the top-level object must be non-empty strings that contain only ASCII alphanumeric characters and underscores &mdash; except for the special `.` period key described above.  Note that the virtual file system is case sensitive, so `JS` is not the same key as `js`.

### 2.1 Category objects

The HTTP manifest file maps string keys to special kinds of objects called _categories_.  This section describes the category objects.

A category object is a JSON object with at least two properties:

1. `mime_type`
2. `files`

Category objects may have additional properties besides these two, but all additional properties will be ignored.

The `mime_type` property is a string identifying the value that will be sent as the `Content-Type` HTTP header value when files from this category are served to the web browser client.  This `mime_type` value should be one of the media types identified in the [\[IANA\]][iana] media types registry.  A small subset of commonly used `mime_type` values is provided by [\[MDN\]][mdn], though IANA is the authoritative source.

The `files` property is a JSON object.  This object is interpreted as an associative array mapping string keys to string values.  The string keys are file names, without the file extension.  The string values are file paths in the local file system to the file that should be copied into the virtual file system and served when this file is requested.  Relative file paths are allowed as string values, in which case they are resolved against the directory that contains the HTTP manifest file.

For example, if the top-level object in the HTTP manifest maps `js` to a category object that has a `files` property with a key `client` that maps to a value `/home/user/example.js` then when `/client.js` is requested from the HTTP server, the HTTP server will send back the contents of `/home/user/example.js`

File names are limited to only ASCII alphanumeric characters and underscore, and they may not be empty.  All served files are in the root directory of the HTTP virtual file systems, and no subdirectories may be defined.

Note that the contents of each file referenced from the HTTP manifest are copied into memory when the HTTP server begins.  Therefore, if the files referenced from the manifest are changed while the HTTP server is running, or the HTTP manifest file is changed when the server is running, this has no effect whatsoever on the HTTP server, which will continue serving the in-memory copies of these files that it made when it started up.  __This means that you must restart the HTTP server after you update the files.__  Otherwise, the server will continue serving its old in-memory copies.

(If you restart the HTTP server, you should also reload the client web application.)

For the special `.` category that has a string key consisting only of a period in the top-level object, the `files` property must contain a string key named `index` which is served when the root document `/` is requested.  (The name `index` is never actually visible to the HTTP client.)  The special `.` category also has a `mime_type` property that works the same way as for all the other categories.

There are also a few restrictions to prevent the manifest defining files that will be defined dynamically by the server in the virtual file system (&sect;3).  Specifically:

1. If `jpg` category is defined, it may not have a file named `trace`
2. If `png` category is defined, it may not have a file named `trace`
3. If `json` category is defined, it may not have a file named `mesh`
4. If `json` category is defined, it may not have a file named `config`

These four rules are equivalent to preventing the HTTP manifest from defining any of the following files in the virtual file system:

1. `/trace.jpg`
2. `/trace.png`
3. `/mesh.json`
4. `/config.json`

Since the HTTP manifest structure requires files to have extensions, the HTTP manifest is also prevented from defining any files that lack file extensions, except for the special `/` root document.

## 3. Virtual file system

The _virtual file system_ is the file system that the `lilacme.js` HTTP server makes available to web browser clients.

All files in the virtual file system are stored in the root directory, so that there are no subdirectories.  Also, the `/` root document may be defined.

Almost all of the files in the virtual file system are defined by the HTTP manifest (&sect;2).  The only exception are four special files that the HTTP server dynamically includes:

1. `/config.json`
2. `/trace.jpg` or `/trace.png`
3. `/mesh.json`
4. `/shutdown`

The `/config.json` is a client-side configuration file in [\[JSON\]][json] format that the server automatically generates and includes in the virtual file system.  The client-side webapp loads this configuration file to receive configuration information from the server.  The JSON within this file has a top-level JSON object that has a property `trace_image` which has a string value that stores the path in the virtual file system to the tracing image.  The tracing image path will either be `/trace.jpg` or `/trace.png` depending on the format of the image file.

The server will also include a copy of the tracing image in the virtual file system at the path indicated by the `/config.json` file.  This will be `/trace.jpg` if the tracing image is a JPEG file, and `/trace.png` if the tracing image is a PNG file.

Finally, the server will include the current JSON mesh file.  The format of this file is documented in `MeshJSON.md`.  The special HTTP server will automatically convert between the standard Shastina format of the mesh file that is stored on disk and the JSON format that is served to the client.  The JSON file is available for reading at the path `/mesh.json` on the server.  In addition, the HTTP server accepts HTTP `PUT` method requests for `/mesh.json` to save new file contents (which will automatically be converted from JSON to Shastina before storing on disk).  The HTTP server will overwrite the mesh file at the path that was passed to it as a command-line parameter with any mesh that is uploaded with the `PUT` method to `/mesh.json`.  The return status is 200 with a JSON return of `true` if saving was successful, and otherwise there was an error.  This `PUT` functionality allows the client-side webapp to implement "Save File" functionality.

All files in the virtual file system respond to HTTP `GET` and `HEAD` requests to read the file contents.  `/mesh.json` also responds to `PUT` requests as described above.  Finally, there is a special file in the virtual file system called `/shutdown` that responds to HTTP `GET`, `HEAD`, and `POST` requests.  This `/shutdown` file never conflicts with files in the HTTP manifest because it lacks a file extension.  Reading the `/shutdown` file returns a special HTML file that has a `<form>` element that `POST`s a result to `/shutdown`.  Invoking `/shutdown` with any kind of `POST` request will cause the HTTP server to perform a graceful shutdown.

Although users are able to use `/shutdown` manually, the normal way to shut down the server is to invoke "Quit" functionality within the client-side webapp, which will automatically `POST` to `/shutdown` to close down the server.

The MIME types returned in the `Content-Type` for these dynamically included files is determined in the following way.  First, check whether the HTTP manifest has an entry for the file type; if it does, then use the `mime_type` defined in the category in the HTTP manifest.  Otherwise, an appropriate default value hardcoded into the server script is used for the content type setting.  You may include categories with empty `files` objects if you want to define a MIME type for a dynamically included file but have no other files of that type to include.

Dynamically included files that have extensions will use the category matching that extension.  The special `/shutdown` file will look for a category matching the `html` extension.

## External references

[\[IANA\]][iana] &mdash; "Media Types"\
Internet Assigned Numbers Authority (IANA)\
`www.iana.org/assignments/media-types/media-types.xhtml`

[iana]: https://www.iana.org/assignments/media-types/media-types.xhtml

[\[JSON\]][json] &mdash; "Introducing JSON"\
`www.json.org`

[json]: https://www.json.org/

[\[MDN\]][mdn] &mdash; "Common MIME types - HTTP | MDN"\
Mozilla Developer Network (MDN)\
`developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types`

[mdn]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types

[\[NODE\]][node] &mdash; "Node.js"\
`nodejs.org`

[node]: https://nodejs.org/
