#!/usr/bin/env node
"use strict";

/*
 * lilacme.js
 * ==========
 * 
 * Node.js Lilac Mesh Editor HTTP server.
 * 
 * Syntax
 * ------
 * 
 *   ./lilacme.js [port] open [mesh] [trace]
 *   ./lilacme.js [port] new [mesh] [trace]
 * 
 * [port] is the IP port on the localhost (127.0.0.1) to serve files on.
 * It must be a decimal integer in range [1024, 65535].
 * 
 * [mesh] is the path to the Lilac mesh file.  In the "open" invocation,
 * this must be an existing file, and it is read as the initial state.
 * In the "new" invocation, this must NOT be an existing file.  The
 * initial state will be an empty mesh, and the given file will be
 * created the first time it is saved.
 * 
 * The format of the mesh file is JSON text file.  The specifics of the
 * format is described in MeshFormat.md
 * 
 * [trace] is the path to an existing image file that will serve as the
 * tracing file.
 * 
 * You must also have a "lilacme_manifest.json" in the same directory as
 * this script, with a format described in the function documentation
 * for lilacme().
 * 
 * You must also have a "lilacme2json" or "lilacme2json.exe" program
 * binary in the same directory as this script.  This program is part of
 * the main Lilac project.
 * 
 * For further information, see server.md
 */

// Wrap everything in an anonymous function that we immediately invoke
// after it is declared -- this prevents anything from being implicitly
// added to global scope
(function() {
  
  /*
   * Imports
   * =======
   */
  
  var child_process = require('child_process');
  var fs = require('fs');
  var http = require('http');
  var path = require('path');
  
  /*
   * Local constants
   * ===============
   */
  
  /*
   * The maximum amount of JSON data in bytes that can be received from
   * the converter binary.
   */
  var MAX_CONVERT_SIZE = (16 * 1024 * 1024);
  
  /*
   * The minimum and maximum allowable IP port numbers for the server.
   * 
   * Port numbers below 1024 are not allowed because this server is not
   * designed for use anywhere besides the local machine.
   */
  var MIN_PORT_NUMBER = 1024;
  var MAX_PORT_NUMBER = 65535;
  
  /*
   * The HTML file that is served for "/shutdown"
   */
  var SHUTDOWN_HTML =
    "<!DOCTYPE html>\n" +
    "<html lang=\"en\">\n" +
    "  <head>\n" +
    "    <meta charset=\"utf-8\"/>\n" +
    "    <title>Server shutdown</title>\n" +
    "    <meta\n" +
    "      name=\"viewport\"\n" +
    "      content=\"width=device-width, initial-scale=1.0\"/>\n" +
    "  </head>\n" +
    "  <body>\n" +
    "    <h1>Server shutdown</h1>\n" +
    "    <form method=\"post\" action=\"/shutdown\">\n" +
    "      <input \n" +
    "        type=\"hidden\"\n" + 
    "        name=\"ignore_me\"\n" +
    "        id=\"ignore_me\"\n" +
    "        value=\"ignore_this\"/>\n" +
    "      <input type=\"submit\" value=\"Shut down\"/>\n" +
    "    </form>\n" +
    "  </body>\n" +
    "</html>\n";
  
  /*
   * Local variables
   * ===============
   */
  
  /*
   * The current state of the mesh file as a string.
   * 
   * This is set at the start of lilacme() and updated each time the
   * file is saved.
   * 
   * This stores the JSON version of the mesh, not the Shastina version.
   */
  var m_mesh = false;
  
  /*
   * The path to the mesh file on the local file system as a string.
   * 
   * This is set at the start of lilacme().
   */
  var m_mesh_path = false;
  
  /*
   * Flag set to true when a mesh file update is in progress.
   */
  var m_mesh_updating = false;
  
  /*
   * HTTP server virtual file system object.
   * 
   * This is set at the start of lilacme().
   * 
   * This is a JavaScript object that is interpreted as an associative
   * array mapping case-sensitive file extensions (which must not have
   * any period character within them or at the start, and may only
   * contain ASCII lowercase and uppercase letters, digits, and
   * underscore) to category objects.
   * 
   * Category objects have two properties:
   * 
   *   "mime_type" - string giving the Content-Type value that the
   *   server returns for the resource; must be non-empty US-ASCII
   *   string containing only visible characters and SP, and neither
   *   beginning nor ending with SP
   * 
   *   "files" - JavaScript object interpreted as an associative array
   *   mapping case-sensitive file name strings (without the extension
   *   or a dot at the end, and containing only ASCII alphanumerics and
   *   underscore) to Buffer objects containing the raw data to transmit
   *   to the client
   * 
   * Additionally, there is a special entry in the top-level object for
   * the "extension" having special value "." (which would otherwise be
   * illegal).  This is used for serving requests for the root "/" file.
   * The "files" parameter in the category object must have an entry
   * with the file name string "index" which is used for serving this
   * special file.
   * 
   * This virtual file system contains all the data served to the client
   * EXCEPT for "/mesh.json" which is handled specially because the
   * client can modify it, and "/shutdown" which is a built-in file.
   * Any entry in m_vfs in the "json" category for file name "mesh" is
   * ignored.
   * 
   * Most of this virtual file system is loaded by parsing the HTTP
   * manifest file and loading all the referenced files into memory.
   * The only exceptions are:
   * 
   *   (1) The "/mesh.json" file, as described above
   * 
   *   (2) The "/shutdown" file
   * 
   *   (3) The tracing image, either at "/trace.jpg" or "/trace.png",
   *   which is loaded from the command-line argument
   * 
   *   (4) The client configuration file at "/config.json", which is
   *   generated automatically
   * 
   * The configuration JSON file encodes a JSON object with the
   * following property:
   * 
   *   "trace_image" - string containing the path on the HTTP server of
   *   the tracing image, which will have a file extension appropriate
   *   to the image type
   * 
   * For the special files noted above, the mime-type from the HTTP
   * manifest is used if a category exists for it; else, an application
   * default is used.  You can include empty categories in the HTTP
   * manifest if you want to specify the mime type but you don't have
   * any files to include of that type besides what is handled by this
   * server.  For the "/shutdown" file, the "html" category is
   * consulted.
   * 
   * See server.md for further information about the architecture of the
   * HTTP server.
   */
  var m_vfs = false;
  
  /*
   * The HTTP server instance.
   * 
   * This is set during beginServer().
   */
  var m_server = false;
  
  /*
   * Flag that is set when a server stop is requested during a request
   * handler.
   */
  var m_stop = false;
  
  /*
   * Local functions
   * ===============
   */
  
  /*
   * Report an error to console and throw an exception for a fault
   * occurring within this module.
   *
   * Parameters:
   *
   *   func_name : string - the name of the function in this module
   *
   *   loc : number(int) - the location within the function
   */
  function fault(func_name, loc) {
    
    // If parameters not valid, set to unknown:0
    if ((typeof func_name !== "string") || (typeof loc !== "number")) {
      func_name = "unknown";
      loc = 0;
    }
    loc = Math.floor(loc);
    if (!isFinite(loc)) {
      loc = 0;
    }
    
    // Report error to console
    console.log("Fault at " + func_name + ":" + String(loc) +
                  " in lilacme");
    
    // Throw exception
    throw ("lilacme:" + func_name + ":" + String(loc));
  }
  
  /*
   * Report an error to console and throw an exception due to an invalid
   * structure in the HTTP manifest JSON.
   *
   * Parameters:
   *
   *   reason : string - textual description of error
   *
   *   loc : number(int) - unique syntax error identifier
   */
  function manifestError(reason, loc) {
    
    // If parameters not valid, set to default values
    if ((typeof reason !== "string") || (typeof loc !== "number")) {
      reason = "Unknown format error";
      loc = 0;
    }
    loc = Math.floor(loc);
    if (!isFinite(loc)) {
      loc = 0;
    }
    
    // Report error to console
    console.log("HTTP manifest file is invalid!");
    console.log("Code: " + String(loc));
    console.log("Reason: " + reason);
    
    // Throw exception
    throw ("lilacme:http_manifest:" + String(loc));
  }
  
  /*
   * Convert a JSON-format mesh into a Shastina mesh.
   * 
   * This does not perform a full validity check.  It only superficially
   * transforms the syntax.  Exception thrown if any problem.
   * 
   * Parameters:
   * 
   *   str : string - the JSON format mesh
   * 
   * Return:
   * 
   *   the Shastina format mesh as a string
   */
  function meshToShastina(str) {
    
    var func_name = "meshToShastina";
    var m, result;
    var i, p, t, ar;
    var v1s, v2s, v3s;
    var uidm;
    
    // Check parameter
    if (typeof str !== "string") {
      fault(func_name, 100);
    }
    
    // Convert to JSON
    try {
      m = JSON.parse(str);
    } catch (ex) {
      fault(func_name, 200);
    }
    
    // Make sure we have a JSON object that has two properties "points"
    // and "tris" that are both arrays
    if ((typeof m !== "object") || (m instanceof Array)) {
      fault(func_name, 300);
    }
    if ((!("points" in m)) || (!("tris" in m))) {
      fault(func_name, 400);
    }
    if ((typeof m.points !== "object") ||
        (typeof m.tris !== "object") ||
        (!(m.points instanceof Array)) ||
        (!(m.tris instanceof Array))) {
      fault(func_name, 500);
    }
    
    // Begin with the header of the result
    result = "%lilac-mesh;\n%dim " + String(m.points.length) + " " +
                String(m.tris.length) + ";\n";
    
    // Declare each point and build a UID mapping
    uidm = {};
    for(i = 0; i < m.points.length; i++) {
      // Get current point
      p = m.points[i];
      
      // Make sure point is an object that has three string properties,
      // uid nrm loc
      if ((typeof p !== "object") || (p instanceof Array)) {
        fault(func_name, 600);
      }
      
      if ((!("uid" in p)) || (!("nrm" in p)) || (!("loc" in p))) {
        fault(func_name, 700);
      }
      
      if ((typeof p.uid !== "string") ||
          (typeof p.nrm !== "string") ||
          (typeof p.loc !== "string")) {
        fault(func_name, 800);
      }
      
      // Add a UID mapping for this point
      uidm["p_" + p.uid] = i;
      
      // Output the line break before this point in the Shastina file
      result = result + "\n";
      
      // Split nrm into fields around comma and output to Shastina
      ar = p.nrm.split(",");
      if (ar.length !== 2) {
        fault(func_name, 900);
      }
      
      result = result + ar[0] + " " + ar[1] + " ";
      
      // Split loc into fields around comma and output to Shastina to
      // finish the point command
      ar = p.loc.split(",");
      if (ar.length !== 2) {
        fault(func_name, 1000);
      }
      
      result = result + ar[0] + " " + ar[1] + " p";
    }
    
    // Output a blank line before the triangle commands
    result = result + "\n";
    
    // Declare each triangle
    for(i = 0; i < m.tris.length; i++) {
      // Get current triangle
      t = m.tris[i];
      
      // Make sure triangle is an array with three elements that are
      // strings
      if ((typeof t !== "object") || (!(t instanceof Array))) {
        fault(func_name, 1100);
      }
      
      if (t.length !== 3) {
        fault(func_name, 1200);
      }
      
      if ((typeof t[0] !== "string") ||
          (typeof t[1] !== "string") ||
          (typeof t[2] !== "string")) {
        fault(func_name, 1300);
      }
      
      // Get the UID map names of the UIDs
      v1s = "p_" + t[0];
      v2s = "p_" + t[1];
      v3s = "p_" + t[2];
      
      // Make sure each vertex UID is in the UID map
      if ((!(v1s in uidm)) ||
          (!(v2s in uidm)) ||
          (!(v3s in uidm))) {
        fault(func_name, 1400);
      }
      
      // Print a line break before the triangle statement
      result = result + "\n";
      
      // Print the triangle statement, converting the UID of the
      // vertices to their zero-based offset in the point array
      result = result + String(uidm[v1s]) + " " +
                        String(uidm[v2s]) + " " +
                        String(uidm[v3s]) + "  t";
    }
    
    // Output the rest of the Shastina file
    result = result + "\n\n|;\n";
    
    // Return result
    return result;
  }
  
  /*
   * Parse the given string as a port number given on the command line.
   * 
   * The string must be a sequence of one or more decimal digits, and
   * the decoded numeric value must be in range of MIN_PORT_NUMBER and
   * MAX_PORT_NUMBER.
   * 
   * Parameters:
   * 
   *   str - string | mixed - the value to decode
   * 
   * Return:
   * 
   *   the decoded numeric value of the port number, or false if there
   *   was an error parsing the port or the port was out of allowed
   *   range
   */
  function parsePort(str) {
    
    var result;
    var i, c;
    
    // Check parameter type
    if (typeof str !== "string") {
      return false;
    }
    
    // Get numeric value
    result = 0;
    for(i = 0; i < str.length; i++) {
      // Get current character code
      c = str.charCodeAt(i);
      
      // Make sure current character code is a decimal value and decode
      // its numeric value
      if ((c >= 0x30) && (c <= 0x39)) {
        c = c - 0x30;
      } else {
        return false;
      }
      
      // Add digit into result
      result = (result * 10) + c;
      
      // If result has exceeded maximum, fail
      if (result > MAX_PORT_NUMBER) {
        return false;
      }
    }
    
    // Make sure result in proper range
    if ((result < MIN_PORT_NUMBER) || (result > MAX_PORT_NUMBER)) {
      return false;
    }
    
    // Return result
    return result;
  }
  
  /*
   * Synchronously check whether the given path corresponds to an
   * existing regular file.
   * 
   * Parameters:
   * 
   *   path : string - the path to check
   * 
   * Return:
   * 
   *   true if path is an existing regular file, false otherwise
   */
  function isRegularFile(path) {
    
    var func_name = "isRegularFile";
    var s;
    
    // Check parameter
    if (typeof path !== "string") {
      fault(func_name, 100);
    }
    
    // Attempt to stat the file, returning false if there is a problem
    try {
      s = fs.statSync(path, {throwIfNoEntry: true});
      
    } catch (ex) {
      // Couldn't stat the file
      return false;
    }
    
    // Check whether regular file and return result
    return s.isFile();
  }
  
  /*
   * Given the path to this script file, convert it to a path to the
   * HTTP manifest file.
   * 
   * The HTTP manifest file is in the same directory as the script file,
   * but it has the filename "lilacme_manifest.json"
   * 
   * Parameters:
   * 
   *   str : string - the path to the script file
   * 
   * Return:
   * 
   *   the path to the manifest file
   */
  function scriptToManifest(str) {
    
    var func_name = "scriptToManifest";
    
    // Check parameter
    if (typeof str !== "string") {
      fault(func_name, 100);
    }
    
    // Result is the directory name, the platform-specific separator,
    // and the filename "lilacme_manifest.json"
    return (path.dirname(str) + path.sep + "lilacme_manifest.json");
  }
  
  /*
   * Given the path to this script file, convert it to a path to the
   * Shastina to JSON converter binary.
   * 
   * The converter binary is in the same directory as the script file,
   * but it has either the filename "lilacme2json" or "lilacme2json.exe"
   * This function will check which of those paths exists as a regular
   * file.  If neither exists, false is returned.
   * 
   * Parameters:
   * 
   *   str : string - the path to the script file
   * 
   * Return:
   * 
   *   the path to the converter binary, or false if not found
   */
  function scriptToConvert(str) {
    
    var func_name = "scriptToConvert";
    var result;
    
    // Check parameter
    if (typeof str !== "string") {
      fault(func_name, 100);
    }
    
    // Find the appropriate path
    result = path.dirname(str) + path.sep + "lilacme2json";
    if (!isRegularFile(result)) {
      result = path.dirname(str) + path.sep + "lilacme2json.exe";
      if (!isRegularFile(result)) {
        result = false;
      }
    }
    
    // Return result
    return result;
  }
  
  /*
   * Given a raw buffer containing an image file read into memory,
   * return the type of image contained within by reading the signature.
   * 
   * The return value is false if no recognized signature is present.
   * 
   * Otherwise, if a recognized signature is present, the return value
   * is one of the following strings:
   * 
   *   "png" - PNG image format
   *   "jpeg" - JPEG image format
   * 
   * Parameters:
   * 
   *   buf : Buffer - buffer containing the image file data to examine
   * 
   * Return:
   * 
   *   string representing the image type, or false if type could not be
   *   recognized
   */
  function imageType(buf) {
    
    var func_name = "imageType";
    var bh;
    
    // Check parameter
    if (typeof buf !== "object") {
      fault(func_name, 100);
    }
    if (!(buf instanceof Buffer)) {
      fault(func_name, 110);
    }
    
    // If at least eight bytes in buffer, check for the 8-byte PNG
    // signature
    if (buf.length >= 8) {
      
      // Create a buffer storing the PNG signature
      bh = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      
      // Check whether PNG signature is present, and return "png" if it
      // is
      if (bh.compare(buf, 0, 8) === 0) {
        return "png";
      }
    }
    
    // If at least two bytes in buffer, check for JPEG SOI marker
    if (buf.length >= 2) {
      
      // Create a buffer storing the JPEG SOI marker
      bh = Buffer.from([0xff, 0xd8]);
      
      // Check whether SOI present, and return "jpeg" if it is
      if (bh.compare(buf, 0, 2) === 0) {
        return "jpeg";
      }
    }
    
    // If we got here, we couldn't identify the file
    return false;
  }
  
  /*
   * Given a JSON string encoding a HTTP manifest, create a JavaScript
   * object containing the decoded virtual file system.
   * 
   * The format of the JSON in the given string is defined in the
   * documentation for the "lilacme" function, and also in the server.md
   * documentation file.
   * 
   * The format of the decoded object is defined in the documentation
   * for the "m_vfs" variable.
   * 
   * An exception is thrown and an error message printed if there is a
   * problem parsing the JSON file or loading any of the files.
   * 
   * The base_path parameter is the path to the directory that relative
   * file paths in the manifest are resolved against.  It should be the
   * same directory that holds the HTTP manifest file.
   * 
   * Parameters:
   * 
   *   str : string - the JSON HTTP manifest file
   * 
   *   base_path : string - the directory to resolve relative paths
   *   against
   * 
   * Return:
   * 
   *   object representing the decoded virtual file system
   */
  function loadManifest(str, base_path) {
    
    var func_name = "loadManifest";
    var root, root_p;
    var p, q, v;
    var i, c;
    
    // Check parameter
    if (typeof str !== "string") {
      fault(func_name, 100);
    }
    if (typeof base_path !== "string") {
      fault(func_name, 150);
    }
    
    // Parse the JSON
    try {
      root = JSON.parse(str);
    } catch (ex) {
      console.log("Failed to parse HTTP manifest as JSON!");
      console.log("Reason: " + ex);
      throw "parse_manifest";
    }
    
    // Make sure top-level parsed entity is an object
    if ((typeof root !== "object") || (root instanceof Array)) {
      manifestError("Top-level entity must be object", 100);
    }
    
    // Make sure that all properties of the top-level object are either
    // "." or a non-empty sequence of ASCII alphanumerics and underscore
    for(p in root) {
      // Verify that property name is indeed a string
      if (typeof p !== "string") {
        fault(func_name, 200);
      }
      
      // If special "." property, then skip
      if (p === ".") {
        continue;
      }
      
      // If we got here, make sure not empty
      if (p.length < 1) {
        manifestError("Top-level keys may not be empty", 200);
      }
      
      // Make sure everything is ASCII alphanumeric or underscore
      for(i = 0; i < p.length; i++) {
        c = p.charCodeAt(i);
        if (((c < 0x30) || (c > 0x39)) &&
            ((c < 0x41) || (c > 0x5a)) &&
            ((c < 0x61) || (c > 0x7a)) &&
            (c !== 0x5f)) {
          manifestError("Invalid top-level key", 300);
        }
      }
    }
    
    // For each value in the top-level mapping object, make sure the
    // value is an object, that it has a non-empty string property
    // "mime_type" that contains only US-ASCII printing characters
    // (including SP) and neither begins nor ends with SP, and that the
    // object has a object property named "files", for which every
    // property name is a non-empty string containing only ASCII
    // alphanumerics and underscore, and every property value is a
    // string
    for(p in root) {
      // Get the value
      v = root[p];
      
      // Make sure value is object
      if ((typeof v !== "object") || (v instanceof Array)) {
        manifestError("Category value must be object", 400);
      }
      
      // Validate mime_type property
      if (!("mime_type" in v)) {
        manifestError("Category must have mime_type property", 500);
      }
      if (typeof v.mime_type !== "string") {
        manifestError("mime_type must be string", 600);
      }
      if (v.mime_type.length < 1) {
        manifestError("mime_type may not be empty", 700);
      }
      if ((v.mime_type.charCodeAt(0) === 0x20) ||
          (v.mime_type.charCodeAt(v.length - 1) === 0x20)) {
        manifestError("mime_type may neither begin nor end with space",
                        800);
      }
      for(i = 0; i < v.mime_type.length; i++) {
        c = v.mime_type.charCodeAt(i);
        if ((c < 0x20) || (c > 0x7e)) {
          manifestError("mime_type contains invalid characters", 900);
        }
      }
      
      // Validate files property
      if (!("files" in v)) {
        manifestError("Category must have files property", 1000);
      }
      if ((typeof v.files !== "object") || (v.files instanceof Array)) {
        manifestError("files property must have object value", 1100);
      }
      for(q in v.files) {
        // Each file property name should be string
        if (typeof q !== "string") {
          fault(func_name, 300);
        }
        
        // File name must be non-empty
        if (q.length < 1) {
          manifestError("Filenames may not be empty", 1200);
        }
        
        // File name may only contain ASCII alphanumerics
        for(i = 0; i < q.length; i++) {
          c = q.charCodeAt(i);
          if (((c < 0x30) || (c > 0x39)) &&
              ((c < 0x41) || (c > 0x5a)) &&
              ((c < 0x61) || (c > 0x7a)) &&
              (c !== 0x5f)) {
            manifestError("Invalid characters in filename", 1300);
          }
        }
        
        // Value must be a string
        if (typeof v.files[q] !== "string") {
          manifestError("File object value must be string path", 1400);
        }
      }
    }
    
    // If we have the special "." category, make sure its files property
    // has an "index" entry
    if ("." in root) {
      if (!("index" in root["."].files)) {
        manifestError("Special category \".\" must have \"index\" file",
                        1500);
      }
    }
    
    // If "jpg" or "png" categories exist, make sure neither have a
    // "trace" file
    if ("jpg" in root) {
      if ("trace" in root["jpg"].files) {
        manifestError("\"jpg\" category can't have a \"trace\" entry",
                      1600);
      }
    }
    if ("png" in root) {
      if ("trace" in root["png"].files) {
        manifestError("\"png\" category can't have a \"trace\" entry",
                      1700);
      }
    }
    
    // If "json" category exists, make sure it has neither "mesh" nor
    // "config" files
    if ("json" in root) {
      if (("mesh" in root["json"].files) ||
          ("config" in root["json"].files)) {
        manifestError("\"json\" category can't have "+
                      "\"mesh\" or \"config\" entries", 1800);
      }
    }
    
    // Copy current parsed tree to root_p, then construct root from
    // scratch, copying in only recognized data so that we drop anything
    // unnecessary
    root_p = root;
    root = {};
    for(p in root_p) {
      root[p] = {
        "mime_type": root_p[p].mime_type,
        "files": {}
      };
      for(q in root_p[p].files) {
        root[p].files[q] = root_p[p].files[q];
      }
    }
    
    // We can now drop the original parsed representation
    root_p = null;
    
    // Go through all files, resolve them against manifest path, check
    // that they exist and are regular files, and replace their path
    // strings with Buffer objects holding their contents
    for(p in root) {
      for(q in root[p].files) {
        
        // Resolve the path against the base path
        v = path.resolve(base_path, root[p].files[q]);
        
        // Check that resolved path is to regular file
        if (!isRegularFile(v)) {
          console.log("Can't find file referenced from manifest!");
          console.log("File path: " + v);
          throw "find_manifest_element";
        }
        
        // Read the file and use it to replace the path
        try {
          root[p].files[q] = fs.readFileSync(v, {"flag": "r"});
        } catch (ex) {
          console.log("Can't read file referenced from manifest!");
          console.log("File path: " + v);
          throw "read_manifest_element";
        }
      }
    }
    
    // Return the fully loaded manifest
    return root;
  }
  
  /*
   * Handle sending an HTTP error status code and a simple message back
   * to an HTTP client.
   * 
   * code is the HTTP status code.  If it is not a recognized integer
   * status code, it is replaced with 500 (Internal Server Error).  Only
   * codes in 4xx and 5xx range are recognized.
   * 
   * response is the server response object to use to write the
   * response.  This function will handle completely writing and
   * finishing a response to the client.
   * 
   * headRequest is true if the HEAD method was used by the client,
   * false in all other cases
   * 
   * Parameters:
   * 
   *   code : number(int) | mixed - the HTTP status code
   * 
   *   response : http.ServerResponse - the object used to respond to
   *   the client's request
   * 
   *   headRequest : boolean - true if client used a HEAD method, false
   *   otherwise
   */
  function httpError(code, response, headRequest) {
    
    var func_name = "httpError";
    var desc;
    var r;
    
    // Check response and headRequest parameters
    if (typeof response !== "object") {
      fault(func_name, 100);
    }
    if (!(response instanceof http.ServerResponse)) {
      fault(func_name, 110);
    }
    if (typeof headRequest !== "boolean") {
      fault(func_name, 120);
    }
    
    // Check code parameter, replacing it with 500 if there is a problem
    if (typeof code !== "number") {
      code = 500;
    }
    if (!isFinite(code)) {
      code = 500;
    }
    if (code !== Math.floor(code)) {
      code = 500;
    }
    if ((code < 400) || (code > 599)) {
      code = 500;
    }
    
    // Look up the code and set the description; if code not recognized,
    // set code to 500
    if (code === 400) {
      desc = "Bad Request";
      
    } else if (code === 403) {
      desc = "Forbidden";
      
    } else if (code === 404) {
      desc = "Not Found";
      
    } else if (code === 405) {
      desc = "Method Not Allowed";
      
    } else if (code === 501) {
      desc = "Not Implemented";
      
    } else if (code === 503) {
      desc = "Service Unavailable";
      
    } else {
      // Code 500 or unrecognized code
      code = 500;
      desc = "Internal Server Error";
    }
    
    // Build the response string
    r = "HTTP Error " + String(code) + ": " + desc + "\n";
    
    // Encode the response string in UTF-8
    r = Buffer.from(r, "utf8");
    
    // Write the header
    response.writeHead(code, desc, {
      "Content-Length": r.length,
      "Content-Type": "text/plain"
    });
    
    // If request method was HEAD, don't actually respond with the body;
    // in all other cases, transmit the body of the message
    if (headRequest) {
      response.end();
    } else {
      response.end(r);
    }
  }
  
  /*
   * Transmit a successful response to the HTTP client.
   * 
   * response is the server response object to use to write the 
   * response.  This function will handle completely writing and
   * finishing a response to the client.
   * 
   * ct is a string indicating the value of the Content-Type parameter
   * to transmit.  This function does not check the content type value
   * beyond making sure it is a string.
   * 
   * d is a Buffer containing the raw file to transmit to the client.
   * 
   * headRequest is true if the HEAD method was used by the client,
   * false in all other cases
   * 
   * Parameters:
   * 
   *   response : http.ServerResponse - the object used to respond to
   *   the client's request
   * 
   *   ct : string - the MIME type to use for the Content-Type value
   * 
   *   d : Buffer - the file to transmit to the client
   * 
   *   headRequest : boolean - true if client used a HEAD method, false
   *   otherwise
   */
  function httpTransmit(response, ct, d, headRequest) {
    
    var func_name = "httpTransmit";
    
    // Check parameters
    if (typeof response !== "object") {
      fault(func_name, 100);
    }
    if (!(response instanceof http.ServerResponse)) {
      fault(func_name, 110);
    }
    if (typeof ct !== "string") {
      fault(func_name, 120);
    }
    if (typeof d !== "object") {
      fault(func_name, 130);
    }
    if (!(d instanceof Buffer)) {
      fault(func_name, 140);
    }
    if (typeof headRequest !== "boolean") {
      fault(func_name, 150);
    }
    
    // Write the header
    response.writeHead(200, "OK", {
      "Content-Length": d.length,
      "Content-Type": ct
    });
    
    // If request method was HEAD, don't actually respond with the body;
    // in all other cases, transmit the body of the message
    if (headRequest) {
      response.end();
    } else {
      response.end(d);
    }
  }
  
  /*
   * Function that handles GET and HEAD requests.
   * 
   * url is the HTTP URL that was requested, in absolute path form from
   * the root of the server.
   * 
   * The return value is an array with one or two elements.  If the 
   * array has one element, the single element is an integer that
   * indicates the HTTP error status code that should be sent in
   * response.  If the array has two elements, the first element is a
   * string that has the value for the Content-Type header to respond
   * with and the second element is a Buffer containing the data that
   * should be sent back to the client.
   * 
   * The m_mesh and m_vfs variables must be set before using this
   * function.
   * 
   * Parameters:
   * 
   *   url : string - the absolute path to the resource on the server
   * 
   * Return:
   * 
   *   an array of one element containing the error status code, or an
   *   array of two elements containing the content type as a string and
   *   the data to transmit to the client as a Buffer
   */
  function readRequest(url) {
    
    var func_name = "readRequest";
    var ct;
    var i, j, c;
    var ua;
    
    // Check state
    if ((m_mesh === false) || (m_vfs === false)) {
      fault(func_name, 100);
    }
    
    // Check parameter
    if (typeof url !== "string") {
      fault(func_name, 200);
    }
    
    // If this is a request for "/mesh.json" then we need to encode the
    // current setting of m_mesh
    if (url === "/mesh.json") {
      // Get JSON content type
      if ("json" in m_vfs) {
        ct = m_vfs["json"].mime_type;
      } else {
        ct = "application/json";
      }
      
      // Return the encoded mesh data
      return [ct, Buffer.from(m_mesh, "utf8")];
    }
    
    // If this is a request for "/shutdown" then we need to serve the
    // hardcoded shutdown HTML file
    if (url === "/shutdown") {
      // Get HTML content type
      if ("html" in m_vfs) {
        ct = m_vfs["html"].mime_type;
      } else {
        ct = "text/html";
      }
      
      // Return the encoded HTML file
      return [ct, Buffer.from(SHUTDOWN_HTML, "utf8")];
    }
    
    // If this is the special "/" root document, then handle that as a
    // special case because it is stored specially in the virtual file
    // system
    if (url === "/") {
      // If no entry for the root document, return 404
      if (!("." in m_vfs)) {
        return [404];
      }
      
      // Otherwise, serve the special "index" file
      return [m_vfs["."].mime_type, m_vfs["."].files["index"]];
    }
    
    // For everything besides the /mesh.json, /shutdown, and root files
    // handled above, we use the virtual file system in the general
    // case; URL in this case must be at least two characters and the
    // first must be "/" or return 404
    if (url.length < 2) {
      return [404];
    }
    if (url.charAt(0) !== "/") {
      return [404];
    }
    
    // Drop the opening "/" from the URL
    url = url.slice(1);

    // Make sure exactly one "." character in URL, else 404
    i = url.indexOf(".");
    if (i < 0) {
      return [404];
    }
    if (url.lastIndexOf(".") !== i) {
      return [404];
    }
    
    // Split URL around the "."
    ua = url.split(".");
    if (ua.length !== 2) {
      fault(func_name, 300);
    }

    // Make sure each component element is non-empty and has only
    // alphanumeric characters and underscore, else 404
    if ((ua[0].length < 1) || (ua[1].length < 1)) {
      return [404];
    }
  
    for(i = 0; i < ua.length; i++) {
      for(j = 0; j < ua[i].length; j++) {
        c = ua[i].charCodeAt(j);
        if (((c < 0x30) || (c > 0x39)) &&
            ((c < 0x41) || (c > 0x5a)) &&
            ((c < 0x61) || (c > 0x7a)) &&
            (c !== 0x5f)) {
          return [404];
        }
      }
    }

    // If extension and file name are in virtual file system, then
    // transmit that file, otherwise 404
    if (ua[1] in m_vfs) {
      if (ua[0] in m_vfs[ua[1]].files) {
        return [m_vfs[ua[1]].mime_type, m_vfs[ua[1]].files[ua[0]]];
      }
    }
    return [404];
  }
  
  /*
   * Function that handles POST requests.
   * 
   * url is the HTTP URL that was POSTed to, in absolute path form from
   * the root of the server.
   * 
   * The return value is an array with one or two elements.  If the 
   * array has one element, the single element is an integer that
   * indicates the HTTP error status code that should be sent in
   * response.  If the array has two elements, the first element is a
   * string that has the value for the Content-Type header to respond
   * with and the second element is a Buffer containing the data that
   * should be sent back to the client.
   * 
   * The m_server variable must be set before using this function.
   * 
   * Note that the data the client transmits to the server during the
   * POST request is ignored and not requested by this function.  This
   * is because POST is only used for the special case of "/shutdown"
   * where the POST data is not relevant.
   * 
   * Parameters:
   * 
   *   url : string - the absolute path to the resource on the server
   * 
   * Return:
   * 
   *   an array of one element containing the error status code, or an
   *   array of two elements containing the content type as a string and
   *   the data to transmit to the client as a Buffer
   */
  function postRequest(url) {
    
    var func_name = "postRequest";
    var d;
    
    // Check state
    if (m_server === false) {
      fault(func_name, 100);
    }
    
    // Check parameter
    if (typeof url !== "string") {
      fault(func_name, 200);
    }
    
    // We only support POST on "/shutdown"; otherwise, return 405
    if (url !== "/shutdown") {
      return [405];
    }
    
    // Shut down the server when we receive POST on "/shutdown" -- we'll
    // do this by setting the m_stop flag so that we do the shutdown
    // after this request is finished
    m_stop = true;
    
    // Return a simple message to the client
    d = "HTTP server has shut down.\n";
    d = Buffer.from(d, "utf8");
    return ["text/plain", d];
  }
  
  /*
   * Function that handles PUT requests.
   * 
   * Since the handler here is asynchronous, it takes the same
   * parameters as the handleRequest() function and handles all details
   * of the request.  The request object must have a method that is a
   * case-insensitive match for "PUT".
   * 
   * The m_mesh and m_mesh_path variables must be set.
   * 
   * Parameters:
   * 
   *   request : http.IncomingMessage - the client PUT request
   * 
   *   response : http.ServerResponse - the object used to respond to
   *   the client's request
   */
  function putRequest(request, response) {
    
    var func_name = "putRequest";
    var req_url;
    var read_fault = false;
    var payload = "";
    
    // Check state
    if ((typeof m_mesh !== "string") ||
        (typeof m_mesh_path !== "string")) {
      fault(func_name, 100);
    }
    
    // Check parameters
    if ((typeof request !== "object") ||
        (typeof response !== "object")) {
      fault(func_name, 200);
    }
    if (!(request instanceof http.IncomingMessage)) {
      fault(func_name, 210);
    }
    if (!(response instanceof http.ServerResponse)) {
      fault(func_name, 220);
    }
    
    // Check that method is PUT
    if (request.method.toUpperCase() !== "PUT") {
      fault(func_name, 300);
    }
    
    // Store the request URL
    req_url = request.url;
    
    // We need to asynchronously read the client data into payload;
    // begin by adding an error event handler on the read stream
    request.on("error", function(err) {
      
      // If read_fault already set, ignore this duplicate event; else,
      // set read_fault to prevent further invocations
      if (read_fault) {
        return;
      } else {
        read_fault = true;
      }
      
      // Send an HTTP error response to the client
      httpError(500, response, false);
    });
    
    // The function will continue asynchronously in the end event of the
    // read stream, which occurs when the client payload has been fully
    // read
    request.on("end", function() {
      
      // If read_fault is set, then ignore this event because we've
      // already sent an error to the client
      if (read_fault) {
        return;
      }
      
      // We have now fully read the client's data into payload string,
      // so we can proceed -- begin by checking that the URL is for the
      // special "/mesh.json" object, otherwise error 405
      if (req_url !== "/mesh.json") {
        httpError(405, response, false);
        return;
      }
      
      // If a mesh update is already in progress, then fail with 503;
      // else, set m_mesh_updating flag before proceeding
      if (m_mesh_updating) {
        httpError(503, response, false);
        return;
      } else {
        m_mesh_updating = true;
      }
      
      // Set the new mesh value as the JSON
      m_mesh = payload;
      
      // Convert the JSON mesh to Shastina
      try {
        payload = meshToShastina(payload);
      } catch (ex) {
        m_mesh_updating = false;
        httpError(500, response, false);
        return;
      }
      
      // Asynchronously write Shastina to disk file
      fs.writeFile(m_mesh_path, payload, {
        "encoding": "utf8",
        "flag": "w"
      }, function(err) {
        
        var r;
        
        // First thing to do when file operation completes is to clear
        // the m_mesh_updating flag
        m_mesh_updating = false;
        
        // If there was an error, respond with 500 to client
        if (err) {
          httpError(500, response, false);
          return;
        }
        
        // If we got here, we just need to transmit a simple JSON "true"
        // response to the client
        r = "true\n";
        r = Buffer.from(r, "utf8");
        httpTransmit(response, "application/json", r, false);
      });
      
    });
    
    // Set the encoding of the request payload to UTF-8 so we get
    // decoded strings while reading
    request.setEncoding("utf8");
    
    // Begin asynchronously reading the client data by attaching a data
    // event handler
    request.on("data", function(s) {
      
      // If read_fault is set, then ignore this event
      if (read_fault) {
        return;
      }
      
      // Check parameter
      if (typeof s !== "string") {
        fault(func_name, 900);
      }
      
      // Append the new data to the payload
      payload = payload + s;
    });
  }
  
  /*
   * Event handler that is called to handle requests to the server.
   * 
   * This is called by the Node.JS HTTP server to handle HTTP requests
   * from the client.
   * 
   * The m_mesh, m_mesh_path, m_vfs, and m_server variables must all be
   * set.
   * 
   * Parameters:
   * 
   *   request : http.IncomingMessage - the client request
   * 
   *   response : http.ServerResponse - the object used to respond to
   *   the client's request
   */
  function handleRequest(request, response) {
    
    var func_name = "handleRequest";
    var m;
    var url;
    var retval;

    // Check state
    if ((typeof m_mesh !== "string") ||
        (typeof m_mesh_path !== "string") ||
        (typeof m_vfs !== "object") ||
        (typeof m_server !== "object")) {
      fault(func_name, 100);
    }
    
    // Check parameters
    if ((typeof request !== "object") ||
        (typeof response !== "object")) {
      fault(func_name, 200);
    }
    if (!(request instanceof http.IncomingMessage)) {
      fault(func_name, 210);
    }
    if (!(response instanceof http.ServerResponse)) {
      fault(func_name, 220);
    }
    
    // Get the request method and normalize to uppercase
    m = request.method;
    m = m.toUpperCase();
    
    // If request method is "PUT" then delegate everything to the
    // special handler
    if (m === "PUT") {
      putRequest(request, response);
      return;
    }
    
    // Get the requested URL
    url = request.url;
    
    // Now that we have the method and the requested URL, and we've
    // handled the special PUT case, we don't need anything more from
    // the request, so consume any data the client gave to us and
    // discard it
    request.resume();
    
    // Handle the specific method types (apart from PUT)
    if (m === "GET") {
      // GET request, so we're doing a read request
      retval = readRequest(url);
      
      // Handle the different responses
      if (retval.length === 1) {
        // HTTP error code was returned
        httpError(retval[0], response, false);
        
      } else if (retval.length === 2) {
        // File was returned to transmit to client
        httpTransmit(response, retval[0], retval[1], false);
        
      } else {
        // Shouldn't happen
        fault(func_name, 300);
      }
      
    } else if (m === "HEAD") {
      // HEAD request, so we're doing a read request
      retval = readRequest(url);
      
      // Handle the different responses
      if (retval.length === 1) {
        // HTTP error code was returned
        httpError(retval[0], response, true);
        
      } else if (retval.length === 2) {
        // File was returned to transmit to client
        httpTransmit(response, retval[0], retval[1], true);
        
      } else {
        // Shouldn't happen
        fault(func_name, 400);
      }
      
    } else if (m === "POST") {
      // POST request
      retval = postRequest(url);
      
      // Handle the different responses
      if (retval.length === 1) {
        // HTTP error code was returned
        httpError(retval[0], response, false);
        
      } else if (retval.length === 2) {
        // File was returned to transmit to client
        httpTransmit(response, retval[0], retval[1], false);
        
      } else {
        // Shouldn't happen
        fault(func_name, 500);
      }
      
    } else {
      // Unsupported method
      httpError(405, response, false);
    }
    
    // If m_stop is now set, shut down the server
    if (m_stop) {
      console.log("HTTP client requested server shutdown.");
      console.log("Server is shutting down...");
      m_server.close();
    }
  }
  
  /*
   * Begin the HTTP server.
   * 
   * The m_mesh, m_mesh_path, and m_vfs variables must be initialized
   * properly before using this function.  However, m_server must not be
   * set yet and must be false.  It will be set by this function.
   * 
   * server_port is the port that we should set the server up on.  It
   * must be an integer in range [MIN_PORT_NUMBER, MAX_PORT_NUMBER].
   * 
   * Parameters:
   * 
   *   server_port : number(int) - the port for the server to use
   */
  function beginServer(server_port) {
    
    var func_name = "beginServer";
    
    // Check state
    if (typeof m_mesh !== "string") {
      fault(func_name, 100);
    }
    if (typeof m_mesh_path !== "string") {
      fault(func_name, 105);
    }
    if (typeof m_vfs !== "object") {
      fault(func_name, 110);
    }
    if (m_server !== false) {
      fault(func_name, 120);
    }
    
    // Check parameter
    if (typeof server_port !== "number") {
      fault(func_name, 200);
    }
    
    if (!isFinite(server_port)) {
      fault(func_name, 210);
    }
    
    if ((server_port < MIN_PORT_NUMBER) ||
        (server_port > MAX_PORT_NUMBER)) {
      fault(func_name, 220);
    }
    
    // Create an HTTP server and register the handler function
    m_server = http.createServer(handleRequest);
    
    // Add an inactivity timeout of five seconds so that it the web
    // browser client tries to keep a connection open indefinitely, it
    // will timeout and be closed by the server after five seconds; this
    // stops clients from preventing the server from shutting down
    m_server.timeout = 5000;
    
    // Register error handler, which reports an error and closes down
    // the server
    m_server.on("error", function(err) {
      console.log("Server error!");
      console.log("Cause: " + err);
      console.log("Server is shutting down...");
      m_server.close();
    });
    
    m_server.on("close", function() {
      console.log("Server has shut down.");
    });
    
    // Register an event handler for CTRL+C received that prints a
    // message and closes down the server
    process.on("SIGINT", function() {
      console.log("Server interrupted by signal.");
      console.log("Server is shutting down...");
      m_server.close();
    });
    
    // Start the server and register an event handler to report when the
    // server is running
    m_server.listen(server_port, function() {
      var a = m_server.address();
      console.log("HTTP server is listening on http://localhost:" +
                    String(a.port) + "/");
    });
  }
  
  /*
   * The main program function.
   * 
   * server_port is the port that we should set the server up on.  It
   * must be an integer in range [MIN_PORT_NUMBER, MAX_PORT_NUMBER].
   * 
   * new_mesh is a boolean that is true if we are starting a new mesh
   * and false if we are opening an existing mesh.
   * 
   * mesh_path is the path to the mesh file.  If new_mesh is true, then
   * this path is ignored until the first client save, upon which the
   * file is overwritten if it exists.  If new_mesh is false, then this
   * file is read immediately and used as the initial mesh state in the
   * client.  Subsequent saves will overwrite the file.
   * 
   * trace_path is the path to the tracing image file.  This file will
   * be read into memory and served whenever the client requests the
   * "trace_image" resource.
   * 
   * manifest_path is the path to the HTTP server manifest file.  This
   * must be a JSON file that encodes an object with the same format as
   * described for the variable m_vfs, EXCEPT:
   * 
   *   (1) Within the "files" object of a category, the values are
   *   string paths to files which will be loaded into server memory
   *   within the virtual file system; relative paths are resolved
   *   against the directory containing the HTTP server manifest file
   * 
   *   (2) If "jpg" and/or "png" categories exist, neither may contain a
   *   file named "trace" since the tracing file will be dynamically
   *   included by the server
   * 
   *   (3) If the "json" category exists, it may not contain any files
   *   named "mesh" or "config", because these are dynamically included
   *   by the server
   * 
   * See also server.md for further documentation of the manifest
   * format.
   * 
   * convert_path is the path to the "lilacme2json" program binary to
   * use for converting Shastina mesh files to JSON.  If opening an
   * existing file, the converter will be used to convert the initial
   * Shastina to the initial JSON.
   * 
   * All files specified by the manifest will be loaded into memory
   * before the server begins.  Changes to the files after loading will
   * be ignored, so the server must be restarted to refresh files in the
   * HTTP manifest.
   * 
   * Parameters:
   * 
   *   server_port : number(int) - the port for the server to use
   * 
   *   new_mesh : boolean - true if creating a new mesh, false if
   *   opening an existing mesh
   * 
   *   mesh_path : string - path to the mesh file
   * 
   *   trace_path : string - path to the trace image file
   * 
   *   manifest_path : string - path to the JSON HTTP manifest file
   * 
   *   convert_path : string - path to the converter program binary
   */
  function lilacme(
      server_port,
      new_mesh,
      mesh_path,
      trace_path,
      manifest_path,
      convert_path) {
    
    var func_name = "lilacme";
    var t, trxt, tfc;
    var ccfg;
    
    // Check parameters
    if ((typeof server_port !== "number") ||
        (typeof new_mesh !== "boolean") ||
        (typeof mesh_path !== "string") ||
        (typeof trace_path !== "string") ||
        (typeof manifest_path !== "string") ||
        (typeof convert_path !== "string")) {
      fault(func_name, 100);
    }
    
    if (!isFinite(server_port)) {
      fault(func_name, 110);
    }
    
    if ((server_port < MIN_PORT_NUMBER) ||
        (server_port > MAX_PORT_NUMBER)) {
      fault(func_name, 120);
    }
    
    // Read the whole manifest file into a string
    try {
      t = fs.readFileSync(manifest_path, {
        "encoding": "utf8",
        "flag": "r"
      });
    } catch (ex) {
      console.log("Failed to read HTTP manifest file!");
      console.log("Reason: " + ex);
      throw "read_manifest";
    }
    
    // Process the manifest file to establish the virtual file system
    m_vfs = loadManifest(t, path.dirname(manifest_path));
    
    // Initialize the mesh file state
    if (new_mesh) {
      // New mesh requested, so set to empty mesh file and store the
      // path
      m_mesh = "{\"points\": [], \"tris\": []}\n";
      m_mesh_path = mesh_path;
      
    } else {
      // Open existing mesh requested, so load from file through the
      // converter and store the path
      try {
        m_mesh = child_process.execFileSync(
                    convert_path,
                    [mesh_path],
                    {
                      "cwd": process.cwd(),
                      "input": "",
                      "maxBuffer": MAX_CONVERT_SIZE,
                      "encoding": "utf8",
                      "windowsHide": true
                    });
        
        m_mesh_path = mesh_path;
        
      } catch (ex) {
        console.log("Failed to read mesh file!");
        console.log("Reason: " + ex);
        throw "read_mesh";
      }
    }
    
    // Read the tracing image file as a raw buffer
    try {
      tfc = fs.readFileSync(trace_path, {
        "flag": "r"
      });
    
    } catch (ex) {
      console.log("Failed to read tracing image file!");
      console.log("Reason: " + ex);
      throw "read_trace";
    }
    
    // Determine the tracing image HTTP extension depending on its type
    t = imageType(tfc);
    if (t === "jpeg") {
      trxt = "jpg";
    
    } else if (t === "png") {
      trxt = "png";
      
    } else {
      console.log("Unrecognized tracing image file type!");
      throw "trace_format";
    }
    
    // Build the client-side configuration file and encode it into a
    // Buffer with UTF-8 encoding
    ccfg = "{\n" +
            "  \"trace_image\": \"/trace." + trxt + "\"\n" +
            "}\n";
    ccfg = Buffer.from(ccfg, "utf8");
    
    // Insert the tracing image into the virtual file system -- begin by
    // establishing the image type category if not already established
    if (!(trxt in m_vfs)) {
      // Establish new category for type
      if (trxt === "jpg") {
        m_vfs[trxt] = {
          "mime_type": "image/jpeg",
          "files": {}
        };
        
      } else if (trxt === "png") {
        m_vfs[trxt] = {
          "mime_type": "image/png",
          "files": {}
        };
        
      } else {
        // Shouldn't happen
        fault(func_name, 200);
      }
    }
    
    // Now we can add an entry for the tracing file and store it there
    // in the virtual file system
    m_vfs[trxt].files["trace"] = tfc;
    
    // Insert the client-side configuration file into the virtual file
    // system -- begin by establishing the JSON category if not already
    // established
    if (!("json" in m_vfs)) {
      m_vfs["json"] = {
        "mime_type": "application/json",
        "files": {}
      };
    }
    
    // Now we can add an entry for the client-side configuration file
    // and store it there in the virtual file system
    m_vfs["json"].files["config"] = ccfg;
    
    // We have successfully initialize m_mesh with the initial mesh
    // state and m_vfs with the server virtual file system, so we can
    // now begin the server
    beginServer(server_port);
  }
  
  /*
   * Program entrypoint
   * ==================
   */
  
  // Begin with successful status and empty parameters object
  var app_status = true;
  var app_param = {};
  
  // We must have exactly four arguments beyond the module name and the
  // server script path
  if (app_status) {
    if (process.argv.length !== 6) {
      console.log("Wrong number of arguments!");
      app_status = false;
    }
  }
  
  // Determine the manifest path and check that the file exists and is a
  // regular file
  if (app_status) {
    app_param.manifest_path = scriptToManifest(process.argv[1]);
    if (!isRegularFile(app_param.manifest_path)) {
      console.log("Missing HTTP manifest in same directory as script!");
      app_status = false;
    }
  }
  
  // Determine the converter binary path, making sure a file exists
  // there at the same time
  if (app_status) {
    app_param.convert_path = scriptToConvert(process.argv[1]);
    if (app_param.convert_path === false) {
      console.log("Missing lilacme2json converter binary!");
      app_status = false;
    }
  }
  
  // Decode the port number
  if (app_status) {
    app_param.port = parsePort(process.argv[2]);
    if (app_param.port === false) {
      console.log("Invalid port argument!");
      app_status = false;
    }
  }
  
  // Determine whether we are using a new mesh
  if (app_status) {
    if (process.argv[3] === "open") {
      app_param.new_mesh = false;
      
    } else if (process.argv[3] === "new") {
      app_param.new_mesh = true;
      
    } else {
      console.log("Unrecognized program mode!");
      app_status = false;
    }
  }
  
  // Store the mesh path, after verifying that it is an existing file or
  // that it does not exist, consistent with the program mode
  if (app_status) {
    // Get the path
    app_param.mesh_path = process.argv[4];
    
    // Check modal consistency
    if (app_param.new_mesh) {
      // New mesh mode, so check that file doesn't already exist
      if (fs.existsSync(app_param.mesh_path)) {
        console.log("Mesh file already exists; use open mode instead!");
        app_status = false;
      }
    } else {
      // Open mesh mode, so check that file is existing regular file
      if (!isRegularFile(app_param.mesh_path)) {
        console.log("Can't find mesh file!");
        app_status = false;
      }
    }
  }
  
  // Store the trace image path, after verifying that it is an existing
  // file
  if (app_status) {
    // Get the path
    app_param.trace_path = process.argv[5];
    
    // Check that it exists and is a regular file
    if (!isRegularFile(app_param.trace_path)) {
      console.log("Can't find trace image file!");
      app_status = false;
    }
  }
  
  // Call through to the main function
  if (app_status) {
    try {
      lilacme(
        app_param.port,
        app_param.new_mesh,
        app_param.mesh_path,
        app_param.trace_path,
        app_param.manifest_path,
        app_param.convert_path);
      
    } catch (ex) {
      console.log("Stopped on exception: " + ex);
      app_status = false;
    }
  }
  
  // If program status is false, set error return from process
  if (!app_status) {
    process.exitCode = 1;
  }
  
}());
